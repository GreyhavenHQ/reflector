"""
Local translation service using MarianMT models.

Singleton service that loads HuggingFace MarianMT translation models
and reuses them across all local translator processor instances.

Ported from gpu/self_hosted/app/services/translator.py for in-process use.
"""

import logging
import threading

from transformers import MarianMTModel, MarianTokenizer, pipeline

logger = logging.getLogger(__name__)


class LocalTranslatorService:
    """MarianMT text translation service for in-process use."""

    def __init__(self):
        self._pipeline = None
        self._current_pair = None
        self._lock = threading.Lock()

    def load(self, source_language: str = "en", target_language: str = "fr"):
        """Load the translation model for a specific language pair."""
        model_name = self._resolve_model_name(source_language, target_language)
        logger.info(
            "Loading MarianMT model: %s (%s -> %s)",
            model_name,
            source_language,
            target_language,
        )
        tokenizer = MarianTokenizer.from_pretrained(model_name)
        model = MarianMTModel.from_pretrained(model_name)
        self._pipeline = pipeline("translation", model=model, tokenizer=tokenizer)
        self._current_pair = (source_language.lower(), target_language.lower())

    def _resolve_model_name(self, src: str, tgt: str) -> str:
        """Resolve language pair to MarianMT model name."""
        pair = (src.lower(), tgt.lower())
        mapping = {
            ("en", "fr"): "Helsinki-NLP/opus-mt-en-fr",
            ("fr", "en"): "Helsinki-NLP/opus-mt-fr-en",
            ("en", "es"): "Helsinki-NLP/opus-mt-en-es",
            ("es", "en"): "Helsinki-NLP/opus-mt-es-en",
            ("en", "de"): "Helsinki-NLP/opus-mt-en-de",
            ("de", "en"): "Helsinki-NLP/opus-mt-de-en",
        }
        return mapping.get(pair, "Helsinki-NLP/opus-mt-en-fr")

    def translate(self, text: str, source_language: str, target_language: str) -> dict:
        """Translate text between languages.

        Args:
            text: Text to translate.
            source_language: Source language code (e.g. "en").
            target_language: Target language code (e.g. "fr").

        Returns:
            dict with "text" key containing {source_language: original, target_language: translated}.
        """
        pair = (source_language.lower(), target_language.lower())
        if self._pipeline is None or self._current_pair != pair:
            self.load(source_language, target_language)
        with self._lock:
            results = self._pipeline(
                text, src_lang=source_language, tgt_lang=target_language
            )
        translated = results[0]["translation_text"] if results else ""
        return {"text": {source_language: text, target_language: translated}}


# Module-level singleton — shared across all local translator processors
translator_service = LocalTranslatorService()
