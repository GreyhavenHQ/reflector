"""
Tests for the FilePipeline Hatchet workflow.

Tests verify:
1. with_error_handling behavior for file pipeline input model
2. on_workflow_failure logic (don't overwrite 'ended' status)
3. Input model validation
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from hatchet_sdk import NonRetryableException


@asynccontextmanager
async def _noop_db_context():
    """Async context manager that yields without touching the DB."""
    yield None


@pytest.fixture(scope="module")
def file_pipeline_module():
    """Import file_pipeline with Hatchet client mocked."""
    mock_client = MagicMock()
    mock_client.workflow.return_value = MagicMock()
    with patch(
        "reflector.hatchet.client.HatchetClientManager.get_client",
        return_value=mock_client,
    ):
        from reflector.hatchet.workflows import file_pipeline

        return file_pipeline


@pytest.fixture
def mock_file_input():
    """Minimal FilePipelineInput for tests."""
    from reflector.hatchet.workflows.file_pipeline import FilePipelineInput

    return FilePipelineInput(
        transcript_id="ts-file-123",
        room_id="room-456",
    )


@pytest.fixture
def mock_ctx():
    """Minimal Context-like object."""
    ctx = MagicMock()
    ctx.log = MagicMock()
    return ctx


def test_file_pipeline_input_model():
    """Test FilePipelineInput validation."""
    from reflector.hatchet.workflows.file_pipeline import FilePipelineInput

    # Valid input with room_id
    input_with_room = FilePipelineInput(transcript_id="ts-123", room_id="room-456")
    assert input_with_room.transcript_id == "ts-123"
    assert input_with_room.room_id == "room-456"

    # Valid input without room_id
    input_no_room = FilePipelineInput(transcript_id="ts-123")
    assert input_no_room.room_id is None


@pytest.mark.asyncio
async def test_file_pipeline_error_handling_transient(
    file_pipeline_module, mock_file_input, mock_ctx
):
    """Transient exception must NOT set error status."""
    from reflector.hatchet.workflows.daily_multitrack_pipeline import (
        TaskName,
        with_error_handling,
    )

    async def failing_task(input, ctx):
        raise httpx.TimeoutException("timed out")

    wrapped = with_error_handling(TaskName.EXTRACT_AUDIO)(failing_task)

    with patch(
        "reflector.hatchet.workflows.daily_multitrack_pipeline.set_workflow_error_status",
        new_callable=AsyncMock,
    ) as mock_set_error:
        with pytest.raises(httpx.TimeoutException):
            await wrapped(mock_file_input, mock_ctx)

        mock_set_error.assert_not_called()


@pytest.mark.asyncio
async def test_file_pipeline_error_handling_hard_fail(
    file_pipeline_module, mock_file_input, mock_ctx
):
    """Hard-fail (ValueError) must set error status and raise NonRetryableException."""
    from reflector.hatchet.workflows.daily_multitrack_pipeline import (
        TaskName,
        with_error_handling,
    )

    async def failing_task(input, ctx):
        raise ValueError("No audio file found")

    wrapped = with_error_handling(TaskName.EXTRACT_AUDIO)(failing_task)

    with patch(
        "reflector.hatchet.workflows.daily_multitrack_pipeline.set_workflow_error_status",
        new_callable=AsyncMock,
    ) as mock_set_error:
        with pytest.raises(NonRetryableException) as exc_info:
            await wrapped(mock_file_input, mock_ctx)

        assert "No audio file found" in str(exc_info.value)
        mock_set_error.assert_called_once_with("ts-file-123")


def test_diarize_result_uses_plain_dicts():
    """DiarizationSegment is a TypedDict (plain dict), not a Pydantic model.

    The diarize task must serialize segments as plain dicts (not call .model_dump()),
    and assemble_transcript must be able to reconstruct them with DiarizationSegment(**s).
    This was a real bug: 'dict' object has no attribute 'model_dump'.
    """
    from reflector.hatchet.workflows.file_pipeline import DiarizeResult
    from reflector.processors.types import DiarizationSegment

    # DiarizationSegment is a TypedDict — instances are plain dicts
    segments = [
        DiarizationSegment(start=0.0, end=1.5, speaker=0),
        DiarizationSegment(start=1.5, end=3.0, speaker=1),
    ]
    assert isinstance(segments[0], dict), "DiarizationSegment should be a plain dict"

    # DiarizeResult should accept list[dict] directly (no model_dump needed)
    result = DiarizeResult(diarization=segments)
    assert result.diarization is not None
    assert len(result.diarization) == 2

    # Consumer (assemble_transcript) reconstructs via DiarizationSegment(**s)
    reconstructed = [DiarizationSegment(**s) for s in result.diarization]
    assert reconstructed[0]["start"] == 0.0
    assert reconstructed[0]["speaker"] == 0
    assert reconstructed[1]["end"] == 3.0
    assert reconstructed[1]["speaker"] == 1


def test_diarize_result_handles_none():
    """DiarizeResult with no diarization data (diarization disabled)."""
    from reflector.hatchet.workflows.file_pipeline import DiarizeResult

    result = DiarizeResult(diarization=None)
    assert result.diarization is None

    result_default = DiarizeResult()
    assert result_default.diarization is None


def test_transcribe_result_words_are_pydantic():
    """TranscribeResult words come from Pydantic Word.model_dump() — verify roundtrip."""
    from reflector.hatchet.workflows.file_pipeline import TranscribeResult
    from reflector.processors.types import Word

    words = [
        Word(text="hello", start=0.0, end=0.5),
        Word(text="world", start=0.5, end=1.0),
    ]
    # Words are Pydantic models, so model_dump() works
    word_dicts = [w.model_dump() for w in words]
    result = TranscribeResult(words=word_dicts)

    # Consumer reconstructs via Word(**w)
    reconstructed = [Word(**w) for w in result.words]
    assert reconstructed[0].text == "hello"
    assert reconstructed[1].start == 0.5


@pytest.mark.asyncio
async def test_file_pipeline_on_failure_sets_error_status(
    file_pipeline_module, mock_file_input, mock_ctx
):
    """on_workflow_failure sets error status when transcript is processing."""
    from reflector.hatchet.workflows.file_pipeline import on_workflow_failure

    transcript_processing = MagicMock()
    transcript_processing.status = "processing"

    with patch(
        "reflector.hatchet.workflows.file_pipeline.fresh_db_connection",
        _noop_db_context,
    ):
        with patch(
            "reflector.db.transcripts.transcripts_controller.get_by_id",
            new_callable=AsyncMock,
            return_value=transcript_processing,
        ):
            with patch(
                "reflector.hatchet.workflows.file_pipeline.set_workflow_error_status",
                new_callable=AsyncMock,
            ) as mock_set_error:
                await on_workflow_failure(mock_file_input, mock_ctx)
                mock_set_error.assert_called_once_with(mock_file_input.transcript_id)


@pytest.mark.asyncio
async def test_file_pipeline_on_failure_does_not_overwrite_ended(
    file_pipeline_module, mock_file_input, mock_ctx
):
    """on_workflow_failure must NOT overwrite 'ended' status."""
    from reflector.hatchet.workflows.file_pipeline import on_workflow_failure

    transcript_ended = MagicMock()
    transcript_ended.status = "ended"

    with patch(
        "reflector.hatchet.workflows.file_pipeline.fresh_db_connection",
        _noop_db_context,
    ):
        with patch(
            "reflector.db.transcripts.transcripts_controller.get_by_id",
            new_callable=AsyncMock,
            return_value=transcript_ended,
        ):
            with patch(
                "reflector.hatchet.workflows.file_pipeline.set_workflow_error_status",
                new_callable=AsyncMock,
            ) as mock_set_error:
                await on_workflow_failure(mock_file_input, mock_ctx)
                mock_set_error.assert_not_called()
