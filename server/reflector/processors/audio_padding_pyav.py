"""
PyAV audio padding processor.

Pads audio tracks with silence directly in-process (no HTTP).
Reuses the shared PyAV utilities from reflector.utils.audio_padding.
"""

import asyncio
import os
import tempfile

import av

from reflector.logger import logger
from reflector.processors.audio_padding import AudioPaddingProcessor, PaddingResponse
from reflector.processors.audio_padding_auto import AudioPaddingAutoProcessor
from reflector.utils.audio_padding import apply_audio_padding_to_file

S3_TIMEOUT = 60


class AudioPaddingPyavProcessor(AudioPaddingProcessor):
    """Audio padding processor using PyAV (no HTTP backend)."""

    async def pad_track(
        self,
        track_url: str,
        output_url: str,
        start_time_seconds: float,
        track_index: int,
    ) -> PaddingResponse:
        """Pad audio track with silence via PyAV.

        Args:
            track_url: Presigned GET URL for source audio track
            output_url: Presigned PUT URL for output WebM
            start_time_seconds: Amount of silence to prepend
            track_index: Track index for logging
        """
        if not track_url:
            raise ValueError("track_url cannot be empty")
        if start_time_seconds <= 0:
            raise ValueError(
                f"start_time_seconds must be positive, got {start_time_seconds}"
            )

        log = logger.bind(track_index=track_index, padding_seconds=start_time_seconds)
        log.info("Starting local PyAV padding")

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._pad_track_blocking,
            track_url,
            output_url,
            start_time_seconds,
            track_index,
        )

    def _pad_track_blocking(
        self,
        track_url: str,
        output_url: str,
        start_time_seconds: float,
        track_index: int,
    ) -> PaddingResponse:
        """Blocking padding work: download, pad with PyAV, upload."""
        import requests

        log = logger.bind(track_index=track_index, padding_seconds=start_time_seconds)
        temp_dir = tempfile.mkdtemp()
        input_path = None
        output_path = None

        try:
            # Download source audio
            log.info("Downloading track for local padding")
            response = requests.get(track_url, stream=True, timeout=S3_TIMEOUT)
            response.raise_for_status()

            input_path = os.path.join(temp_dir, "track.webm")
            total_bytes = 0
            with open(input_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        total_bytes += len(chunk)
            log.info("Track downloaded", bytes=total_bytes)

            # Apply padding using shared PyAV utility
            output_path = os.path.join(temp_dir, "padded.webm")
            with av.open(input_path) as in_container:
                apply_audio_padding_to_file(
                    in_container,
                    output_path,
                    start_time_seconds,
                    track_index,
                    logger=logger,
                )

            file_size = os.path.getsize(output_path)
            log.info("Local padding complete", size=file_size)

            # Upload padded track
            log.info("Uploading padded track to S3")
            with open(output_path, "rb") as f:
                upload_response = requests.put(output_url, data=f, timeout=S3_TIMEOUT)
            upload_response.raise_for_status()
            log.info("Upload complete", size=file_size)

            return PaddingResponse(size=file_size)

        except Exception as e:
            log.error("Local padding failed", error=str(e), exc_info=True)
            raise
        finally:
            if input_path and os.path.exists(input_path):
                try:
                    os.unlink(input_path)
                except Exception as e:
                    log.warning("Failed to cleanup input file", error=str(e))
            if output_path and os.path.exists(output_path):
                try:
                    os.unlink(output_path)
                except Exception as e:
                    log.warning("Failed to cleanup output file", error=str(e))
            try:
                os.rmdir(temp_dir)
            except Exception as e:
                log.warning("Failed to cleanup temp directory", error=str(e))


AudioPaddingAutoProcessor.register("pyav", AudioPaddingPyavProcessor)
