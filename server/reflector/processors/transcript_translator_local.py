"""
Local transcript translator processor using MarianMT in-process.

Translates transcript text using HuggingFace MarianMT models
locally. No HTTP backend needed.
"""

import asyncio

from reflector.processors._local_translator_service import translator_service
from reflector.processors.transcript_translator import TranscriptTranslatorProcessor
from reflector.processors.transcript_translator_auto import (
    TranscriptTranslatorAutoProcessor,
)
from reflector.processors.types import TranslationLanguages


class TranscriptTranslatorLocalProcessor(TranscriptTranslatorProcessor):
    """Translate transcript text using local MarianMT models."""

    async def _translate(self, text: str) -> str | None:
        source_language = self.get_pref("audio:source_language", "en")
        target_language = self.get_pref("audio:target_language", "en")

        languages = TranslationLanguages()
        assert languages.is_supported(target_language)

        self.logger.debug(f"Local translate {text=}")

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            translator_service.translate,
            text,
            source_language,
            target_language,
        )

        if target_language in result["text"]:
            translation = result["text"][target_language]
        else:
            translation = None

        self.logger.debug(f"Translation result: {text=}, {translation=}")
        return translation


TranscriptTranslatorAutoProcessor.register("local", TranscriptTranslatorLocalProcessor)
