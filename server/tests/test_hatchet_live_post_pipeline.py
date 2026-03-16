"""
Tests for the LivePostProcessingPipeline Hatchet workflow.

Tests verify:
1. with_error_handling behavior for live post pipeline input model
2. on_workflow_failure logic (don't overwrite 'ended' status)
3. Input model validation
4. pipeline_post() now triggers Hatchet instead of Celery chord
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
def live_pipeline_module():
    """Import live_post_pipeline with Hatchet client mocked."""
    mock_client = MagicMock()
    mock_client.workflow.return_value = MagicMock()
    with patch(
        "reflector.hatchet.client.HatchetClientManager.get_client",
        return_value=mock_client,
    ):
        from reflector.hatchet.workflows import live_post_pipeline

        return live_post_pipeline


@pytest.fixture
def mock_live_input():
    """Minimal LivePostPipelineInput for tests."""
    from reflector.hatchet.workflows.live_post_pipeline import LivePostPipelineInput

    return LivePostPipelineInput(
        transcript_id="ts-live-789",
        room_id="room-abc",
    )


@pytest.fixture
def mock_ctx():
    """Minimal Context-like object."""
    ctx = MagicMock()
    ctx.log = MagicMock()
    return ctx


def test_live_post_pipeline_input_model():
    """Test LivePostPipelineInput validation."""
    from reflector.hatchet.workflows.live_post_pipeline import LivePostPipelineInput

    # Valid input with room_id
    input_with_room = LivePostPipelineInput(transcript_id="ts-123", room_id="room-456")
    assert input_with_room.transcript_id == "ts-123"
    assert input_with_room.room_id == "room-456"

    # Valid input without room_id
    input_no_room = LivePostPipelineInput(transcript_id="ts-123")
    assert input_no_room.room_id is None


@pytest.mark.asyncio
async def test_live_pipeline_error_handling_transient(
    live_pipeline_module, mock_live_input, mock_ctx
):
    """Transient exception must NOT set error status."""
    from reflector.hatchet.workflows.daily_multitrack_pipeline import (
        TaskName,
        with_error_handling,
    )

    async def failing_task(input, ctx):
        raise httpx.TimeoutException("timed out")

    wrapped = with_error_handling(TaskName.WAVEFORM)(failing_task)

    with patch(
        "reflector.hatchet.workflows.daily_multitrack_pipeline.set_workflow_error_status",
        new_callable=AsyncMock,
    ) as mock_set_error:
        with pytest.raises(httpx.TimeoutException):
            await wrapped(mock_live_input, mock_ctx)

        mock_set_error.assert_not_called()


@pytest.mark.asyncio
async def test_live_pipeline_error_handling_hard_fail(
    live_pipeline_module, mock_live_input, mock_ctx
):
    """Hard-fail must set error status and raise NonRetryableException."""
    from reflector.hatchet.workflows.daily_multitrack_pipeline import (
        TaskName,
        with_error_handling,
    )

    async def failing_task(input, ctx):
        raise ValueError("Transcript not found")

    wrapped = with_error_handling(TaskName.WAVEFORM)(failing_task)

    with patch(
        "reflector.hatchet.workflows.daily_multitrack_pipeline.set_workflow_error_status",
        new_callable=AsyncMock,
    ) as mock_set_error:
        with pytest.raises(NonRetryableException) as exc_info:
            await wrapped(mock_live_input, mock_ctx)

        assert "Transcript not found" in str(exc_info.value)
        mock_set_error.assert_called_once_with("ts-live-789")


@pytest.mark.asyncio
async def test_live_pipeline_on_failure_sets_error_status(
    live_pipeline_module, mock_live_input, mock_ctx
):
    """on_workflow_failure sets error status when transcript is processing."""
    from reflector.hatchet.workflows.live_post_pipeline import on_workflow_failure

    transcript_processing = MagicMock()
    transcript_processing.status = "processing"

    with patch(
        "reflector.hatchet.workflows.live_post_pipeline.fresh_db_connection",
        _noop_db_context,
    ):
        with patch(
            "reflector.db.transcripts.transcripts_controller.get_by_id",
            new_callable=AsyncMock,
            return_value=transcript_processing,
        ):
            with patch(
                "reflector.hatchet.workflows.live_post_pipeline.set_workflow_error_status",
                new_callable=AsyncMock,
            ) as mock_set_error:
                await on_workflow_failure(mock_live_input, mock_ctx)
                mock_set_error.assert_called_once_with(mock_live_input.transcript_id)


@pytest.mark.asyncio
async def test_live_pipeline_on_failure_does_not_overwrite_ended(
    live_pipeline_module, mock_live_input, mock_ctx
):
    """on_workflow_failure must NOT overwrite 'ended' status."""
    from reflector.hatchet.workflows.live_post_pipeline import on_workflow_failure

    transcript_ended = MagicMock()
    transcript_ended.status = "ended"

    with patch(
        "reflector.hatchet.workflows.live_post_pipeline.fresh_db_connection",
        _noop_db_context,
    ):
        with patch(
            "reflector.db.transcripts.transcripts_controller.get_by_id",
            new_callable=AsyncMock,
            return_value=transcript_ended,
        ):
            with patch(
                "reflector.hatchet.workflows.live_post_pipeline.set_workflow_error_status",
                new_callable=AsyncMock,
            ) as mock_set_error:
                await on_workflow_failure(mock_live_input, mock_ctx)
                mock_set_error.assert_not_called()


@pytest.mark.asyncio
async def test_pipeline_post_triggers_hatchet():
    """pipeline_post() should trigger Hatchet LivePostProcessingPipeline workflow."""
    with patch(
        "reflector.hatchet.client.HatchetClientManager.start_workflow",
        new_callable=AsyncMock,
        return_value="workflow-run-id",
    ) as mock_start:
        from reflector.pipelines.main_live_pipeline import pipeline_post

        await pipeline_post(transcript_id="ts-test-123", room_id="room-test")

        mock_start.assert_called_once_with(
            "LivePostProcessingPipeline",
            {
                "transcript_id": "ts-test-123",
                "room_id": "room-test",
            },
            additional_metadata={"transcript_id": "ts-test-123"},
        )


@pytest.mark.asyncio
async def test_pipeline_post_triggers_hatchet_without_room_id():
    """pipeline_post() should handle None room_id."""
    with patch(
        "reflector.hatchet.client.HatchetClientManager.start_workflow",
        new_callable=AsyncMock,
        return_value="workflow-run-id",
    ) as mock_start:
        from reflector.pipelines.main_live_pipeline import pipeline_post

        await pipeline_post(transcript_id="ts-test-456")

        mock_start.assert_called_once_with(
            "LivePostProcessingPipeline",
            {
                "transcript_id": "ts-test-456",
                "room_id": None,
            },
            additional_metadata={"transcript_id": "ts-test-456"},
        )
