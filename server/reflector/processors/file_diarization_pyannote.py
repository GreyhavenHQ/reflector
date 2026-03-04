"""
Pyannote file diarization processor using pyannote.audio in-process.

Downloads audio from URL, runs pyannote diarization locally,
and returns speaker segments. No HTTP backend needed.
"""

import asyncio
import os

from reflector.processors._audio_download import download_audio_to_temp
from reflector.processors._pyannote_diarization_service import diarization_service
from reflector.processors.file_diarization import (
    FileDiarizationInput,
    FileDiarizationOutput,
    FileDiarizationProcessor,
)
from reflector.processors.file_diarization_auto import FileDiarizationAutoProcessor


class FileDiarizationPyannoteProcessor(FileDiarizationProcessor):
    async def _diarize(self, data: FileDiarizationInput):
        """Run pyannote diarization on file from URL."""
        self.logger.info(f"Starting pyannote diarization from {data.audio_url}")
        tmp_path = await download_audio_to_temp(data.audio_url)
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, diarization_service.diarize_file, str(tmp_path)
            )
            return FileDiarizationOutput(diarization=result["diarization"])
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


FileDiarizationAutoProcessor.register("pyannote", FileDiarizationPyannoteProcessor)
