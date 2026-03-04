"""
Tests for in-process processor backends (--cpu mode).

All ML model calls are mocked — no actual model loading needed.
Tests verify processor registration, wiring, error handling, and data flow.
"""

import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from reflector.processors.file_diarization import (
    FileDiarizationInput,
    FileDiarizationOutput,
)
from reflector.processors.types import (
    AudioDiarizationInput,
    TitleSummaryWithId,
    Transcript,
    Word,
)

# ── Registration Tests ──────────────────────────────────────────────────


def test_audio_diarization_pyannote_registers():
    """Verify AudioDiarizationPyannoteProcessor registers with 'pyannote' backend."""
    # Importing the module triggers registration
    import reflector.processors.audio_diarization_pyannote  # noqa: F401
    from reflector.processors.audio_diarization_auto import (
        AudioDiarizationAutoProcessor,
    )

    assert "pyannote" in AudioDiarizationAutoProcessor._registry


def test_file_diarization_pyannote_registers():
    """Verify FileDiarizationPyannoteProcessor registers with 'pyannote' backend."""
    import reflector.processors.file_diarization_pyannote  # noqa: F401
    from reflector.processors.file_diarization_auto import FileDiarizationAutoProcessor

    assert "pyannote" in FileDiarizationAutoProcessor._registry


def test_transcript_translator_marian_registers():
    """Verify TranscriptTranslatorMarianProcessor registers with 'marian' backend."""
    import reflector.processors.transcript_translator_marian  # noqa: F401
    from reflector.processors.transcript_translator_auto import (
        TranscriptTranslatorAutoProcessor,
    )

    assert "marian" in TranscriptTranslatorAutoProcessor._registry


def test_file_transcript_whisper_registers():
    """Verify FileTranscriptWhisperProcessor registers with 'whisper' backend."""
    import reflector.processors.file_transcript_whisper  # noqa: F401
    from reflector.processors.file_transcript_auto import FileTranscriptAutoProcessor

    assert "whisper" in FileTranscriptAutoProcessor._registry


# ── Audio Download Utility Tests ────────────────────────────────────────


@pytest.mark.asyncio
async def test_download_audio_to_temp_success():
    """Verify download_audio_to_temp downloads to a temp file and returns path."""
    from reflector.processors._audio_download import download_audio_to_temp

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "audio/wav"}
    mock_response.iter_content.return_value = [b"fake audio data"]
    mock_response.raise_for_status = MagicMock()

    with patch("reflector.processors._audio_download.requests.get") as mock_get:
        mock_get.return_value = mock_response

        result = await download_audio_to_temp("https://example.com/test.wav")

        assert isinstance(result, Path)
        assert result.exists()
        assert result.read_bytes() == b"fake audio data"
        assert result.suffix == ".wav"

        # Cleanup
        os.unlink(result)


@pytest.mark.asyncio
async def test_download_audio_to_temp_cleanup_on_error():
    """Verify temp file is cleaned up when download fails mid-write."""
    from reflector.processors._audio_download import download_audio_to_temp

    mock_response = MagicMock()
    mock_response.headers = {"content-type": "audio/wav"}
    mock_response.raise_for_status = MagicMock()

    def fail_iter(*args, **kwargs):
        raise ConnectionError("Download interrupted")

    mock_response.iter_content = fail_iter

    with patch("reflector.processors._audio_download.requests.get") as mock_get:
        mock_get.return_value = mock_response

        with pytest.raises(ConnectionError, match="Download interrupted"):
            await download_audio_to_temp("https://example.com/test.wav")


def test_detect_extension_from_url():
    """Verify extension detection from URL path."""
    from reflector.processors._audio_download import _detect_extension

    assert _detect_extension("https://example.com/test.wav", "") == ".wav"
    assert _detect_extension("https://example.com/test.mp3?signed=1", "") == ".mp3"
    assert _detect_extension("https://example.com/test.webm", "") == ".webm"


def test_detect_extension_from_content_type():
    """Verify extension detection from content-type header."""
    from reflector.processors._audio_download import _detect_extension

    assert _detect_extension("https://s3.aws/uuid", "audio/mpeg") == ".mp3"
    assert _detect_extension("https://s3.aws/uuid", "audio/wav") == ".wav"
    assert _detect_extension("https://s3.aws/uuid", "audio/webm") == ".webm"


def test_detect_extension_fallback():
    """Verify fallback extension when neither URL nor content-type is recognized."""
    from reflector.processors._audio_download import _detect_extension

    assert (
        _detect_extension("https://s3.aws/uuid", "application/octet-stream") == ".audio"
    )


# ── Audio Diarization Pyannote Processor Tests ──────────────────────────


@pytest.mark.asyncio
async def test_audio_diarization_pyannote_diarize():
    """Verify pyannote audio diarization downloads, diarizes, and cleans up."""
    from reflector.processors.audio_diarization_pyannote import (
        AudioDiarizationPyannoteProcessor,
    )

    mock_diarization_result = {
        "diarization": [
            {"start": 0.0, "end": 2.5, "speaker": 0},
            {"start": 2.5, "end": 5.0, "speaker": 1},
        ]
    }

    # Create a temp file to simulate download
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.write(b"fake audio")
    tmp.close()
    tmp_path = Path(tmp.name)

    processor = AudioDiarizationPyannoteProcessor()

    with (
        patch(
            "reflector.processors.audio_diarization_pyannote.download_audio_to_temp",
            new_callable=AsyncMock,
            return_value=tmp_path,
        ),
        patch(
            "reflector.processors.audio_diarization_pyannote.diarization_service"
        ) as mock_svc,
    ):
        mock_svc.diarize_file.return_value = mock_diarization_result

        data = AudioDiarizationInput(
            audio_url="https://example.com/test.wav",
            topics=[
                TitleSummaryWithId(
                    id="topic-1",
                    title="Test Topic",
                    summary="A test topic",
                    timestamp=0.0,
                    duration=5.0,
                    transcript=Transcript(
                        words=[Word(text="hello", start=0.0, end=1.0)]
                    ),
                )
            ],
        )
        result = await processor._diarize(data)

        assert result == mock_diarization_result["diarization"]
        mock_svc.diarize_file.assert_called_once()


# ── File Diarization Pyannote Processor Tests ───────────────────────────


@pytest.mark.asyncio
async def test_file_diarization_pyannote_diarize():
    """Verify pyannote file diarization returns FileDiarizationOutput."""
    from reflector.processors.file_diarization_pyannote import (
        FileDiarizationPyannoteProcessor,
    )

    mock_diarization_result = {
        "diarization": [
            {"start": 0.0, "end": 3.0, "speaker": 0},
            {"start": 3.0, "end": 6.0, "speaker": 1},
        ]
    }

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.write(b"fake audio")
    tmp.close()
    tmp_path = Path(tmp.name)

    processor = FileDiarizationPyannoteProcessor()

    with (
        patch(
            "reflector.processors.file_diarization_pyannote.download_audio_to_temp",
            new_callable=AsyncMock,
            return_value=tmp_path,
        ),
        patch(
            "reflector.processors.file_diarization_pyannote.diarization_service"
        ) as mock_svc,
    ):
        mock_svc.diarize_file.return_value = mock_diarization_result

        data = FileDiarizationInput(audio_url="https://example.com/test.wav")
        result = await processor._diarize(data)

        assert isinstance(result, FileDiarizationOutput)
        assert len(result.diarization) == 2
        assert result.diarization[0]["start"] == 0.0
        assert result.diarization[1]["speaker"] == 1


# ── Transcript Translator Marian Processor Tests ───────────────────────


@pytest.mark.asyncio
async def test_transcript_translator_marian_translate():
    """Verify MarianMT translator calls service and extracts translation."""
    from reflector.processors.transcript_translator_marian import (
        TranscriptTranslatorMarianProcessor,
    )

    mock_result = {"text": {"en": "Hello world", "fr": "Bonjour le monde"}}

    processor = TranscriptTranslatorMarianProcessor()

    def fake_get_pref(key, default=None):
        prefs = {"audio:source_language": "en", "audio:target_language": "fr"}
        return prefs.get(key, default)

    with (
        patch.object(processor, "get_pref", side_effect=fake_get_pref),
        patch(
            "reflector.processors.transcript_translator_marian.translator_service"
        ) as mock_svc,
    ):
        mock_svc.translate.return_value = mock_result

        result = await processor._translate("Hello world")

        assert result == "Bonjour le monde"
        mock_svc.translate.assert_called_once_with("Hello world", "en", "fr")


@pytest.mark.asyncio
async def test_transcript_translator_marian_no_translation():
    """Verify translator returns None when target language not in result."""
    from reflector.processors.transcript_translator_marian import (
        TranscriptTranslatorMarianProcessor,
    )

    mock_result = {"text": {"en": "Hello world"}}

    processor = TranscriptTranslatorMarianProcessor()

    def fake_get_pref(key, default=None):
        prefs = {"audio:source_language": "en", "audio:target_language": "fr"}
        return prefs.get(key, default)

    with (
        patch.object(processor, "get_pref", side_effect=fake_get_pref),
        patch(
            "reflector.processors.transcript_translator_marian.translator_service"
        ) as mock_svc,
    ):
        mock_svc.translate.return_value = mock_result

        result = await processor._translate("Hello world")

        assert result is None


# ── File Transcript Whisper Processor Tests ─────────────────────────────


@pytest.mark.asyncio
async def test_file_transcript_whisper_transcript():
    """Verify whisper file processor downloads, transcribes, and returns Transcript."""
    from reflector.processors.file_transcript import FileTranscriptInput
    from reflector.processors.file_transcript_whisper import (
        FileTranscriptWhisperProcessor,
    )

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.write(b"fake audio")
    tmp.close()
    tmp_path = Path(tmp.name)

    processor = FileTranscriptWhisperProcessor()

    # Mock the blocking transcription method
    mock_transcript = Transcript(
        words=[
            Word(text="Hello", start=0.0, end=0.5),
            Word(text=" world", start=0.5, end=1.0),
        ]
    )

    with (
        patch(
            "reflector.processors.file_transcript_whisper.download_audio_to_temp",
            new_callable=AsyncMock,
            return_value=tmp_path,
        ),
        patch.object(
            processor,
            "_transcribe_file_blocking",
            return_value=mock_transcript,
        ),
    ):
        data = FileTranscriptInput(
            audio_url="https://example.com/test.wav", language="en"
        )
        result = await processor._transcript(data)

        assert isinstance(result, Transcript)
        assert len(result.words) == 2
        assert result.words[0].text == "Hello"


# ── VAD Helper Tests ────────────────────────────────────────────────────


def test_enforce_word_timing_constraints():
    """Verify word timing enforcement prevents overlapping times."""
    from reflector.processors.file_transcript_whisper import (
        _enforce_word_timing_constraints,
    )

    words = [
        {"word": "hello", "start": 0.0, "end": 1.5},
        {"word": "world", "start": 1.0, "end": 2.0},  # overlaps with previous
        {"word": "test", "start": 2.0, "end": 3.0},
    ]

    result = _enforce_word_timing_constraints(words)

    assert result[0]["end"] == 1.0  # Clamped to next word's start
    assert result[1]["end"] == 2.0  # Clamped to next word's start
    assert result[2]["end"] == 3.0  # Last word unchanged


def test_enforce_word_timing_constraints_empty():
    """Verify timing enforcement handles empty and single-word lists."""
    from reflector.processors.file_transcript_whisper import (
        _enforce_word_timing_constraints,
    )

    assert _enforce_word_timing_constraints([]) == []
    assert _enforce_word_timing_constraints([{"word": "a", "start": 0, "end": 1}]) == [
        {"word": "a", "start": 0, "end": 1}
    ]


def test_pad_audio_short():
    """Verify short audio gets padded with silence."""
    import numpy as np

    from reflector.processors.file_transcript_whisper import _pad_audio

    short_audio = np.zeros(100, dtype=np.float32)  # Very short
    result = _pad_audio(short_audio, sample_rate=16000)

    # Should be padded to at least silence_padding duration
    assert len(result) > len(short_audio)


def test_pad_audio_long():
    """Verify long audio is not padded."""
    import numpy as np

    from reflector.processors.file_transcript_whisper import _pad_audio

    long_audio = np.zeros(32000, dtype=np.float32)  # 2 seconds
    result = _pad_audio(long_audio, sample_rate=16000)

    assert len(result) == len(long_audio)


# ── Translator Service Tests ────────────────────────────────────────────


def test_translator_service_resolve_model():
    """Verify model resolution for known and unknown language pairs."""
    from reflector.processors._marian_translator_service import MarianTranslatorService

    svc = MarianTranslatorService()

    assert svc._resolve_model_name("en", "fr") == "Helsinki-NLP/opus-mt-en-fr"
    assert svc._resolve_model_name("es", "en") == "Helsinki-NLP/opus-mt-es-en"
    assert svc._resolve_model_name("en", "de") == "Helsinki-NLP/opus-mt-en-de"
    # Unknown pair falls back to en->fr
    assert svc._resolve_model_name("ja", "ko") == "Helsinki-NLP/opus-mt-en-fr"


# ── Diarization Service Tests ───────────────────────────────────────────


def test_diarization_service_singleton():
    """Verify diarization_service is a module-level singleton."""
    from reflector.processors._pyannote_diarization_service import (
        PyannoteDiarizationService,
        diarization_service,
    )

    assert isinstance(diarization_service, PyannoteDiarizationService)
    assert diarization_service._pipeline is None  # Not loaded until first use


def test_translator_service_singleton():
    """Verify translator_service is a module-level singleton."""
    from reflector.processors._marian_translator_service import (
        MarianTranslatorService,
        translator_service,
    )

    assert isinstance(translator_service, MarianTranslatorService)
    assert translator_service._pipeline is None  # Not loaded until first use
