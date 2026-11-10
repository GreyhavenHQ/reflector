"""
Tests for summary language support.

Rules:
- When the transcript was actually translated, summaries follow the target
  language (target wins, then source as fallback).
- When no translation happened, the transcript text is in the spoken language
  (metadata may not reflect it: frontend defaults and the "No translation"
  fallback both produce "en"), so the LLM is instructed to respond in the
  same language as the text.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from reflector.processors.summary.prompts import (
    build_language_instruction,
    resolve_summary_language,
)
from reflector.processors.summary.summary_builder import (
    ParticipantsResponse,
    SummaryBuilder,
)

AUTO_INSTRUCTION_MARKER = "same language as the text you are summarizing"


def _make_builder() -> SummaryBuilder:
    llm = MagicMock()
    llm.model_name = "TEST MODEL"
    return SummaryBuilder(llm=llm)


def _make_processor(
    source_language=None, target_language=None, translated_chunks: list = None
):
    from reflector.processors.transcript_final_summary import (
        TranscriptFinalSummaryProcessor,
    )

    transcript = None
    if source_language is not None or target_language is not None:
        transcript = SimpleNamespace(
            participants=[],
            source_language=source_language,
            target_language=target_language,
        )
    processor = TranscriptFinalSummaryProcessor(transcript=transcript)
    processor.chunks = [
        SimpleNamespace(transcript=SimpleNamespace(translation=translation))
        for translation in (translated_chunks or [None])
    ]
    return processor


async def _get_builder(processor) -> SummaryBuilder:
    with (
        patch.object(SummaryBuilder, "identify_participants", AsyncMock()),
        patch.object(SummaryBuilder, "generate_summary", AsyncMock()),
    ):
        return await processor.get_summary_builder("text")


# --- resolve_summary_language (pure) ----------------------------------------


def test_translated_prefers_target_language():
    assert resolve_summary_language("fr", "en", translated=True) == "en"


def test_translated_same_language():
    assert resolve_summary_language("fr", "fr", translated=True) == "fr"


def test_translated_falls_back_to_source():
    assert resolve_summary_language("fr", None, translated=True) == "fr"
    assert resolve_summary_language("fr", "", translated=True) == "fr"
    assert resolve_summary_language("fr", "   ", translated=True) == "fr"


def test_not_translated_returns_none_for_auto_detection():
    # Metadata cannot be trusted when no translation happened (frontend
    # defaults and the "No translation" fallback both produce "en").
    assert resolve_summary_language("fr", "en") is None
    assert resolve_summary_language("fr", "fr") is None
    assert resolve_summary_language("fr", None) is None
    assert resolve_summary_language(None, "en") is None
    assert resolve_summary_language(None, None) is None
    assert resolve_summary_language("", "") is None


# --- build_language_instruction (pure) --------------------------------------


def test_language_instruction_none_or_empty_means_auto():
    for value in (None, "", "   "):
        instruction = build_language_instruction(value)
        assert AUTO_INSTRUCTION_MARKER in instruction


def test_language_instruction_known_code():
    instruction = build_language_instruction("fr")
    assert "French" in instruction


def test_language_instruction_is_case_insensitive():
    assert "French" in build_language_instruction("FR")


def test_language_instruction_unknown_code_passthrough():
    instruction = build_language_instruction("xx-unknown")
    assert "xx-unknown" in instruction


# --- SummaryBuilder prompt enhancement --------------------------------------


@pytest.mark.asyncio
async def test_builder_prompt_includes_language():
    builder = _make_builder()
    builder.set_language("fr")
    builder.llm.get_response = AsyncMock(return_value="recap")

    await builder._get_response("PROMPT", ["some text"])

    prompt = builder.llm.get_response.call_args[0][0]
    assert prompt.startswith("PROMPT")
    assert "French" in prompt


@pytest.mark.asyncio
async def test_builder_prompt_defaults_to_auto_language():
    builder = _make_builder()
    builder.llm.get_response = AsyncMock(return_value="recap")

    await builder._get_response("PROMPT", ["some text"])

    prompt = builder.llm.get_response.call_args[0][0]
    assert prompt.startswith("PROMPT")
    assert AUTO_INSTRUCTION_MARKER in prompt


@pytest.mark.asyncio
async def test_builder_structured_prompt_includes_language():
    builder = _make_builder()
    builder.set_language("de")
    builder.llm.get_structured_response = AsyncMock(
        return_value=ParticipantsResponse(participants=[], total_speakers=0)
    )

    await builder._get_structured_response("PROMPT", ParticipantsResponse)

    prompt = builder.llm.get_structured_response.call_args[0][0]
    assert "German" in prompt


def test_set_language_ignores_empty():
    builder = _make_builder()
    builder.set_language(None)
    builder.set_language("  ")
    assert builder.language is None
    builder.set_language("fr")
    assert builder.language == "fr"


# --- TranscriptFinalSummaryProcessor wiring ---------------------------------


@pytest.mark.asyncio
async def test_processor_no_translation_means_auto_language():
    # French audio, "No translation" (frontend sends target="en"), passthrough
    # translation backend: the transcript stays in French, so the summary
    # must follow the text language (auto), not the metadata "en".
    processor = _make_processor(source_language="fr", target_language="en")
    builder = await _get_builder(processor)

    assert builder.language is None


@pytest.mark.asyncio
async def test_processor_translated_target_wins():
    processor = _make_processor(
        source_language="fr", target_language="en", translated_chunks=["english..."]
    )
    builder = await _get_builder(processor)

    assert builder.language == "en"


@pytest.mark.asyncio
async def test_processor_translated_falls_back_to_source():
    processor = _make_processor(
        source_language="fr", target_language=None, translated_chunks=["..."]
    )
    builder = await _get_builder(processor)

    assert builder.language == "fr"


@pytest.mark.asyncio
async def test_processor_not_translated_even_with_same_languages():
    processor = _make_processor(source_language="fr", target_language="fr")
    builder = await _get_builder(processor)

    assert builder.language is None


@pytest.mark.asyncio
async def test_processor_no_language_without_transcript():
    processor = _make_processor()
    builder = await _get_builder(processor)

    assert builder.language is None
