"""
Local audio diarization processor using pyannote.audio in-process.

Downloads audio from URL, runs pyannote diarization locally,
and returns speaker segments. No HTTP backend needed.
"""

import asyncio
import os

from reflector.processors._audio_download import download_audio_to_temp
from reflector.processors._local_diarization_service import diarization_service
from reflector.processors.audio_diarization import AudioDiarizationProcessor
from reflector.processors.audio_diarization_auto import AudioDiarizationAutoProcessor
from reflector.processors.types import AudioDiarizationInput


class AudioDiarizationLocalProcessor(AudioDiarizationProcessor):
    INPUT_TYPE = AudioDiarizationInput

    async def _diarize(self, data: AudioDiarizationInput):
        """Run local pyannote diarization on audio from URL."""
        tmp_path = await download_audio_to_temp(data.audio_url)
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, diarization_service.diarize_file, str(tmp_path)
            )
            return result["diarization"]
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


AudioDiarizationAutoProcessor.register("local", AudioDiarizationLocalProcessor)
