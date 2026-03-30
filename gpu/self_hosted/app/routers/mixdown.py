"""
Audio mixdown endpoint for selfhosted GPU service.

CPU-intensive multi-track audio mixing service for combining N audio tracks
into a single MP3 using PyAV amix filter graph.

IMPORTANT: This mixdown logic is duplicated from server/reflector/utils/audio_mixdown.py
for deployment isolation (self_hosted can't import from server/reflector/). If you modify
the PyAV filter graph or mixdown algorithm, you MUST update both:
  - gpu/self_hosted/app/routers/mixdown.py (this file)
  - server/reflector/utils/audio_mixdown.py

Constants duplicated from server/reflector/utils/audio_constants.py for same reason.
"""

import logging
import os
import tempfile
from fractions import Fraction

import av
import requests
from av.audio.resampler import AudioResampler
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import apikey_auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["mixdown"])

S3_TIMEOUT = 120


class MixdownRequest(BaseModel):
    track_urls: list[str]
    output_url: str
    target_sample_rate: int | None = None
    offsets_seconds: list[float] | None = None


class MixdownResponse(BaseModel):
    size: int
    duration_ms: float = 0.0
    cancelled: bool = False


@router.post("/mixdown", dependencies=[Depends(apikey_auth)], response_model=MixdownResponse)
def mixdown_tracks(req: MixdownRequest):
    """Mix multiple audio tracks into single MP3 using PyAV amix filter graph."""
    valid_urls = [u for u in req.track_urls if u]
    if not valid_urls:
        raise HTTPException(status_code=400, detail="No valid track URLs provided")
    if req.offsets_seconds is not None:
        if len(req.offsets_seconds) != len(req.track_urls):
            raise HTTPException(
                status_code=400,
                detail=f"offsets_seconds length ({len(req.offsets_seconds)}) "
                f"must match track_urls ({len(req.track_urls)})",
            )
        if any(o > 18000 for o in req.offsets_seconds):
            raise HTTPException(
                status_code=400, detail="offsets_seconds exceeds maximum 18000s (5 hours)"
            )
    if not req.output_url:
        raise HTTPException(status_code=400, detail="output_url cannot be empty")

    logger.info("Mixdown request: %d tracks", len(valid_urls))

    temp_dir = tempfile.mkdtemp()
    track_paths = []
    output_path = None

    try:
        # --- Download all tracks ---
        for i, url in enumerate(valid_urls):
            logger.info("Downloading track %d", i)
            response = requests.get(url, stream=True, timeout=S3_TIMEOUT)
            response.raise_for_status()

            track_path = os.path.join(temp_dir, f"track_{i}.webm")
            total_bytes = 0
            with open(track_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        total_bytes += len(chunk)

            track_paths.append(track_path)
            logger.info("Track %d downloaded: %d bytes", i, total_bytes)

        if not track_paths:
            raise HTTPException(status_code=400, detail="No tracks could be downloaded")

        # --- Detect sample rate ---
        target_sample_rate = req.target_sample_rate
        if target_sample_rate is None:
            for path in track_paths:
                try:
                    container = av.open(path)
                    for frame in container.decode(audio=0):
                        target_sample_rate = frame.sample_rate
                        container.close()
                        break
                    else:
                        container.close()
                        continue
                    break
                except Exception:
                    continue
        if target_sample_rate is None:
            raise HTTPException(
                status_code=400, detail="Could not detect sample rate from any track"
            )

        logger.info("Target sample rate: %d", target_sample_rate)

        # --- Calculate per-input delays ---
        input_offsets_seconds = None
        if req.offsets_seconds is not None:
            input_offsets_seconds = [
                req.offsets_seconds[i] for i, url in enumerate(req.track_urls) if url
            ]

        delays_ms = []
        if input_offsets_seconds is not None:
            base = min(input_offsets_seconds) if input_offsets_seconds else 0.0
            delays_ms = [max(0, int(round((o - base) * 1000))) for o in input_offsets_seconds]
        else:
            delays_ms = [0 for _ in track_paths]

        # --- Build filter graph ---
        # N abuffer -> optional adelay -> amix -> aformat -> abuffersink
        graph = av.filter.Graph()
        inputs = []

        for idx in range(len(track_paths)):
            args = (
                f"time_base=1/{target_sample_rate}:"
                f"sample_rate={target_sample_rate}:"
                f"sample_fmt=s32:"
                f"channel_layout=stereo"
            )
            in_ctx = graph.add("abuffer", args=args, name=f"in{idx}")
            inputs.append(in_ctx)

        mixer = graph.add("amix", args=f"inputs={len(inputs)}:normalize=0", name="mix")
        fmt = graph.add(
            "aformat",
            args=f"sample_fmts=s32:channel_layouts=stereo:sample_rates={target_sample_rate}",
            name="fmt",
        )
        sink = graph.add("abuffersink", name="out")

        for idx, in_ctx in enumerate(inputs):
            delay_ms = delays_ms[idx] if idx < len(delays_ms) else 0
            if delay_ms > 0:
                adelay = graph.add(
                    "adelay",
                    args=f"delays={delay_ms}|{delay_ms}:all=1",
                    name=f"delay{idx}",
                )
                in_ctx.link_to(adelay)
                adelay.link_to(mixer, 0, idx)
            else:
                in_ctx.link_to(mixer, 0, idx)

        mixer.link_to(fmt)
        fmt.link_to(sink)
        graph.configure()

        # --- Open all containers and decode ---
        containers = []
        output_path = os.path.join(temp_dir, "mixed.mp3")

        try:
            for path in track_paths:
                containers.append(av.open(path))

            decoders = [c.decode(audio=0) for c in containers]
            active = [True] * len(decoders)
            resamplers = [
                AudioResampler(format="s32", layout="stereo", rate=target_sample_rate)
                for _ in decoders
            ]

            # Open output MP3
            out_container = av.open(output_path, "w", format="mp3")
            out_stream = out_container.add_stream("libmp3lame", rate=target_sample_rate)
            total_duration = 0

            while any(active):
                for i, (dec, is_active) in enumerate(zip(decoders, active)):
                    if not is_active:
                        continue
                    try:
                        frame = next(dec)
                    except StopIteration:
                        active[i] = False
                        inputs[i].push(None)
                        continue

                    if frame.sample_rate != target_sample_rate:
                        continue

                    out_frames = resamplers[i].resample(frame) or []
                    for rf in out_frames:
                        rf.sample_rate = target_sample_rate
                        rf.time_base = Fraction(1, target_sample_rate)
                        inputs[i].push(rf)

                    while True:
                        try:
                            mixed = sink.pull()
                        except Exception:
                            break
                        mixed.sample_rate = target_sample_rate
                        mixed.time_base = Fraction(1, target_sample_rate)
                        for packet in out_stream.encode(mixed):
                            out_container.mux(packet)
                            total_duration += packet.duration

            # Flush filter graph
            while True:
                try:
                    mixed = sink.pull()
                except Exception:
                    break
                mixed.sample_rate = target_sample_rate
                mixed.time_base = Fraction(1, target_sample_rate)
                for packet in out_stream.encode(mixed):
                    out_container.mux(packet)
                    total_duration += packet.duration

            # Flush encoder
            for packet in out_stream.encode(None):
                out_container.mux(packet)
                total_duration += packet.duration

            # Calculate duration in ms
            last_tb = out_stream.time_base
            duration_ms = 0.0
            if last_tb and total_duration > 0:
                duration_ms = round(float(total_duration * last_tb * 1000), 2)

            out_container.close()

        finally:
            for c in containers:
                try:
                    c.close()
                except Exception:
                    pass

        file_size = os.path.getsize(output_path)
        logger.info("Mixdown complete: %d bytes, %.2fms", file_size, duration_ms)

        # --- Upload result ---
        logger.info("Uploading mixed audio to S3")
        with open(output_path, "rb") as f:
            upload_response = requests.put(req.output_url, data=f, timeout=S3_TIMEOUT)
        upload_response.raise_for_status()
        logger.info("Upload complete: %d bytes", file_size)

        return MixdownResponse(size=file_size, duration_ms=duration_ms)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Mixdown failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Mixdown failed: {e}") from e
    finally:
        for path in track_paths:
            if os.path.exists(path):
                try:
                    os.unlink(path)
                except Exception as e:
                    logger.warning("Failed to cleanup track file: %s", e)
        if output_path and os.path.exists(output_path):
            try:
                os.unlink(output_path)
            except Exception as e:
                logger.warning("Failed to cleanup output file: %s", e)
        try:
            os.rmdir(temp_dir)
        except Exception as e:
            logger.warning("Failed to cleanup temp directory: %s", e)
