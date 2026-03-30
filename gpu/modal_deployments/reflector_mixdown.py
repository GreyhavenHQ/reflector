"""
Reflector GPU backend - audio mixdown
=====================================

CPU-intensive multi-track audio mixdown service.
Mixes N audio tracks into a single MP3 using PyAV amix filter graph.

IMPORTANT: This mixdown logic is duplicated from server/reflector/utils/audio_mixdown.py
for Modal deployment isolation (Modal can't import from server/reflector/). If you modify
the PyAV filter graph or mixdown algorithm, you MUST update both:
  - gpu/modal_deployments/reflector_mixdown.py (this file)
  - server/reflector/utils/audio_mixdown.py

Constants duplicated from server/reflector/utils/audio_constants.py for same reason.
"""

import os
import tempfile
from fractions import Fraction
import asyncio

import modal

S3_TIMEOUT = 120  # Higher than padding (60s) — multiple track downloads
MIXDOWN_TIMEOUT = 1200 + (S3_TIMEOUT * 2)  # 1440s total
SCALEDOWN_WINDOW = 60
DISCONNECT_CHECK_INTERVAL = 2

app = modal.App("reflector-mixdown")

# CPU-based image (mixdown is CPU-bound, no GPU needed)
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")  # Required by PyAV
    .pip_install(
        "av==13.1.0",  # PyAV for audio processing
        "requests==2.32.3",  # HTTP for presigned URL downloads/uploads
        "fastapi==0.115.12",  # API framework
    )
)


@app.function(
    cpu=4.0,  # Higher than padding (2.0) for multi-track mixing
    timeout=MIXDOWN_TIMEOUT,
    scaledown_window=SCALEDOWN_WINDOW,
    image=image,
    secrets=[modal.Secret.from_name("reflector-gpu")],
)
@modal.asgi_app()
def web():
    from fastapi import Depends, FastAPI, HTTPException, Request, status
    from fastapi.security import OAuth2PasswordBearer
    from pydantic import BaseModel

    class MixdownRequest(BaseModel):
        track_urls: list[str]
        output_url: str
        target_sample_rate: int | None = None
        offsets_seconds: list[float] | None = None

    class MixdownResponse(BaseModel):
        size: int
        duration_ms: float = 0.0
        cancelled: bool = False

    web_app = FastAPI()

    oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

    def apikey_auth(apikey: str = Depends(oauth2_scheme)):
        if apikey == os.environ["REFLECTOR_GPU_APIKEY"]:
            return
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    @web_app.post("/mixdown", dependencies=[Depends(apikey_auth)])
    async def mixdown_endpoint(request: Request, req: MixdownRequest) -> MixdownResponse:
        """Modal web endpoint for mixing audio tracks with disconnect detection."""
        import logging
        import threading

        logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
        logger = logging.getLogger(__name__)

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
                raise HTTPException(status_code=400, detail="offsets_seconds exceeds maximum 18000s (5 hours)")
        if not req.output_url:
            raise HTTPException(status_code=400, detail="output_url cannot be empty")

        logger.info(f"Mixdown request: {len(valid_urls)} tracks")

        # Thread-safe cancellation flag
        cancelled = threading.Event()

        async def check_disconnect():
            """Background task to check for client disconnect."""
            while not cancelled.is_set():
                await asyncio.sleep(DISCONNECT_CHECK_INTERVAL)
                if await request.is_disconnected():
                    logger.warning("Client disconnected, setting cancellation flag")
                    cancelled.set()
                    break

        disconnect_task = asyncio.create_task(check_disconnect())

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, _mixdown_tracks_blocking, req, cancelled, logger
            )
            return MixdownResponse(**result)
        finally:
            cancelled.set()
            disconnect_task.cancel()
            try:
                await disconnect_task
            except asyncio.CancelledError:
                pass

    def _mixdown_tracks_blocking(req, cancelled, logger) -> dict:
        """Blocking CPU-bound mixdown work with periodic cancellation checks.

        Downloads all tracks, builds PyAV amix filter graph, encodes to MP3,
        and uploads the result to the presigned output URL.
        """
        import av
        import requests
        from av.audio.resampler import AudioResampler
        import time

        temp_dir = tempfile.mkdtemp()
        track_paths = []
        output_path = None
        last_check = time.time()

        try:
            # --- Download all tracks ---
            valid_urls = [u for u in req.track_urls if u]
            for i, url in enumerate(valid_urls):
                if cancelled.is_set():
                    logger.info("Cancelled during download phase")
                    return {"size": 0, "duration_ms": 0.0, "cancelled": True}

                logger.info(f"Downloading track {i}")
                response = requests.get(url, stream=True, timeout=S3_TIMEOUT)
                response.raise_for_status()

                track_path = os.path.join(temp_dir, f"track_{i}.webm")
                total_bytes = 0
                chunk_count = 0
                with open(track_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            total_bytes += len(chunk)
                            chunk_count += 1
                            if chunk_count % 12 == 0:
                                now = time.time()
                                if now - last_check >= DISCONNECT_CHECK_INTERVAL:
                                    if cancelled.is_set():
                                        logger.info(f"Cancelled during track {i} download")
                                        return {"size": 0, "duration_ms": 0.0, "cancelled": True}
                                    last_check = now

                track_paths.append(track_path)
                logger.info(f"Track {i} downloaded: {total_bytes} bytes")

            if not track_paths:
                raise ValueError("No tracks downloaded")

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
                raise ValueError("Could not detect sample rate from any track")

            logger.info(f"Target sample rate: {target_sample_rate}")

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
                    # Check cancellation periodically
                    now = time.time()
                    if now - last_check >= DISCONNECT_CHECK_INTERVAL:
                        if cancelled.is_set():
                            logger.info("Cancelled during mixing")
                            out_container.close()
                            return {"size": 0, "duration_ms": 0.0, "cancelled": True}
                        last_check = now

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
            logger.info(f"Mixdown complete: {file_size} bytes, {duration_ms}ms")

            if cancelled.is_set():
                logger.info("Cancelled after mixing, before upload")
                return {"size": 0, "duration_ms": 0.0, "cancelled": True}

            # --- Upload result ---
            logger.info("Uploading mixed audio to S3")
            with open(output_path, "rb") as f:
                upload_response = requests.put(req.output_url, data=f, timeout=S3_TIMEOUT)
            upload_response.raise_for_status()
            logger.info(f"Upload complete: {file_size} bytes")

            return {"size": file_size, "duration_ms": duration_ms}

        finally:
            # Cleanup all temp files
            for path in track_paths:
                if os.path.exists(path):
                    try:
                        os.unlink(path)
                    except Exception as e:
                        logger.warning(f"Failed to cleanup track file: {e}")
            if output_path and os.path.exists(output_path):
                try:
                    os.unlink(output_path)
                except Exception as e:
                    logger.warning(f"Failed to cleanup output file: {e}")
            try:
                os.rmdir(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp directory: {e}")

    return web_app
