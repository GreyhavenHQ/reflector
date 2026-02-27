"""
Audio padding endpoint for selfhosted GPU service.

CPU-intensive audio padding service for adding silence to audio tracks.
Uses PyAV filter graph (adelay) for precise track synchronization.

IMPORTANT: This padding logic is duplicated from server/reflector/utils/audio_padding.py
for deployment isolation (self_hosted can't import from server/reflector/). If you modify
the PyAV filter graph or padding algorithm, you MUST update both:
  - gpu/self_hosted/app/routers/padding.py (this file)
  - server/reflector/utils/audio_padding.py

Constants duplicated from server/reflector/utils/audio_constants.py for same reason.
"""

import logging
import math
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

router = APIRouter(tags=["padding"])

# ref B0F71CE8-FC59-4AA5-8414-DAFB836DB711
OPUS_STANDARD_SAMPLE_RATE = 48000
OPUS_DEFAULT_BIT_RATE = 128000

S3_TIMEOUT = 60


class PaddingRequest(BaseModel):
    track_url: str
    output_url: str
    start_time_seconds: float
    track_index: int


class PaddingResponse(BaseModel):
    size: int
    cancelled: bool = False


@router.post("/pad", dependencies=[Depends(apikey_auth)], response_model=PaddingResponse)
def pad_track(req: PaddingRequest):
    """Pad audio track with silence using PyAV adelay filter graph."""
    if not req.track_url:
        raise HTTPException(status_code=400, detail="track_url cannot be empty")
    if not req.output_url:
        raise HTTPException(status_code=400, detail="output_url cannot be empty")
    if req.start_time_seconds <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"start_time_seconds must be positive, got {req.start_time_seconds}",
        )
    if req.start_time_seconds > 18000:
        raise HTTPException(
            status_code=400,
            detail="start_time_seconds exceeds maximum 18000s (5 hours)",
        )

    logger.info(
        "Padding request: track %d, delay=%.3fs", req.track_index, req.start_time_seconds
    )

    temp_dir = tempfile.mkdtemp()
    input_path = None
    output_path = None

    try:
        # Download source audio
        logger.info("Downloading track for padding")
        response = requests.get(req.track_url, stream=True, timeout=S3_TIMEOUT)
        response.raise_for_status()

        input_path = os.path.join(temp_dir, "track.webm")
        total_bytes = 0
        with open(input_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    total_bytes += len(chunk)
        logger.info("Track downloaded: %d bytes", total_bytes)

        # Apply padding using PyAV
        output_path = os.path.join(temp_dir, "padded.webm")
        delay_ms = math.floor(req.start_time_seconds * 1000)
        logger.info("Padding track %d with %dms delay using PyAV", req.track_index, delay_ms)

        in_container = av.open(input_path)
        in_stream = next((s for s in in_container.streams if s.type == "audio"), None)
        if in_stream is None:
            in_container.close()
            raise HTTPException(status_code=400, detail="No audio stream in input")

        with av.open(output_path, "w", format="webm") as out_container:
            out_stream = out_container.add_stream("libopus", rate=OPUS_STANDARD_SAMPLE_RATE)
            out_stream.bit_rate = OPUS_DEFAULT_BIT_RATE
            graph = av.filter.Graph()

            abuf_args = (
                f"time_base=1/{OPUS_STANDARD_SAMPLE_RATE}:"
                f"sample_rate={OPUS_STANDARD_SAMPLE_RATE}:"
                f"sample_fmt=s16:"
                f"channel_layout=stereo"
            )
            src = graph.add("abuffer", args=abuf_args, name="src")
            aresample_f = graph.add("aresample", args="async=1", name="ares")
            delays_arg = f"{delay_ms}|{delay_ms}"
            adelay_f = graph.add(
                "adelay", args=f"delays={delays_arg}:all=1", name="delay"
            )
            sink = graph.add("abuffersink", name="sink")

            src.link_to(aresample_f)
            aresample_f.link_to(adelay_f)
            adelay_f.link_to(sink)
            graph.configure()

            resampler = AudioResampler(
                format="s16", layout="stereo", rate=OPUS_STANDARD_SAMPLE_RATE
            )

            for frame in in_container.decode(in_stream):
                out_frames = resampler.resample(frame) or []
                for rframe in out_frames:
                    rframe.sample_rate = OPUS_STANDARD_SAMPLE_RATE
                    rframe.time_base = Fraction(1, OPUS_STANDARD_SAMPLE_RATE)
                    src.push(rframe)

                    while True:
                        try:
                            f_out = sink.pull()
                        except Exception:
                            break
                        f_out.sample_rate = OPUS_STANDARD_SAMPLE_RATE
                        f_out.time_base = Fraction(1, OPUS_STANDARD_SAMPLE_RATE)
                        for packet in out_stream.encode(f_out):
                            out_container.mux(packet)

            # Flush filter graph
            src.push(None)
            while True:
                try:
                    f_out = sink.pull()
                except Exception:
                    break
                f_out.sample_rate = OPUS_STANDARD_SAMPLE_RATE
                f_out.time_base = Fraction(1, OPUS_STANDARD_SAMPLE_RATE)
                for packet in out_stream.encode(f_out):
                    out_container.mux(packet)

            # Flush encoder
            for packet in out_stream.encode(None):
                out_container.mux(packet)

        in_container.close()

        file_size = os.path.getsize(output_path)
        logger.info("Padding complete: %d bytes", file_size)

        # Upload padded track
        logger.info("Uploading padded track to S3")
        with open(output_path, "rb") as f:
            upload_response = requests.put(req.output_url, data=f, timeout=S3_TIMEOUT)
        upload_response.raise_for_status()
        logger.info("Upload complete: %d bytes", file_size)

        return PaddingResponse(size=file_size)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Padding failed for track %d: %s", req.track_index, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Padding failed: {e}") from e
    finally:
        if input_path and os.path.exists(input_path):
            try:
                os.unlink(input_path)
            except Exception as e:
                logger.warning("Failed to cleanup input file: %s", e)
        if output_path and os.path.exists(output_path):
            try:
                os.unlink(output_path)
            except Exception as e:
                logger.warning("Failed to cleanup output file: %s", e)
        try:
            os.rmdir(temp_dir)
        except Exception as e:
            logger.warning("Failed to cleanup temp directory: %s", e)
