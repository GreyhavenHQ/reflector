"""
PyAV audio mixdown processor.

Mixes N tracks in-process using the existing utility from reflector.utils.audio_mixdown.
Writes to a local temp file (does NOT upload to S3 — the pipeline handles upload).
"""

import os
import tempfile

from reflector.logger import logger
from reflector.processors.audio_file_writer import AudioFileWriterProcessor
from reflector.processors.audio_mixdown import AudioMixdownProcessor, MixdownResponse
from reflector.processors.audio_mixdown_auto import AudioMixdownAutoProcessor
from reflector.utils.audio_mixdown import (
    detect_sample_rate_from_tracks,
    mixdown_tracks_pyav,
)


class AudioMixdownPyavProcessor(AudioMixdownProcessor):
    """Audio mixdown processor using PyAV (no HTTP backend).

    Writes the mixed output to a local temp file and returns its path
    in MixdownResponse.output_path. The caller is responsible for
    uploading the file and cleaning it up.
    """

    async def mixdown_tracks(
        self,
        track_urls: list[str],
        output_url: str,
        target_sample_rate: int | None = None,
        offsets_seconds: list[float] | None = None,
    ) -> MixdownResponse:
        log = logger.bind(track_count=len(track_urls))
        log.info("Starting local PyAV mixdown")

        valid_urls = [url for url in track_urls if url]
        if not valid_urls:
            raise ValueError("No valid track URLs provided")

        # Auto-detect sample rate if not provided
        if target_sample_rate is None:
            target_sample_rate = detect_sample_rate_from_tracks(
                valid_urls, logger=logger
            )
            if not target_sample_rate:
                raise ValueError("No decodable audio frames in any track")

        # Write to temp MP3 file
        temp_dir = tempfile.mkdtemp()
        output_path = os.path.join(temp_dir, "mixed.mp3")
        duration_ms_container = [0.0]

        async def capture_duration(d):
            duration_ms_container[0] = d

        writer = AudioFileWriterProcessor(
            path=output_path, on_duration=capture_duration
        )

        try:
            await mixdown_tracks_pyav(
                valid_urls,
                writer,
                target_sample_rate,
                offsets_seconds=offsets_seconds,
                logger=logger,
            )
            await writer.flush()

            file_size = os.path.getsize(output_path)
            log.info(
                "Local mixdown complete",
                size=file_size,
                duration_ms=duration_ms_container[0],
            )

            return MixdownResponse(
                size=file_size,
                duration_ms=duration_ms_container[0],
                output_path=output_path,
            )

        except Exception as e:
            # Cleanup on failure
            if os.path.exists(output_path):
                try:
                    os.unlink(output_path)
                except Exception:
                    pass
            try:
                os.rmdir(temp_dir)
            except Exception:
                pass
            log.error("Local mixdown failed", error=str(e), exc_info=True)
            raise


AudioMixdownAutoProcessor.register("pyav", AudioMixdownPyavProcessor)
