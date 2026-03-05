"""
Tests for Hatchet error handling: NonRetryable classification and error status.

These tests encode the desired behavior from the Hatchet Workflow Analysis doc:
- Transient exceptions: do NOT set error status (let Hatchet retry; user stays on "processing").
- Hard-fail exceptions: set error status and re-raise as NonRetryableException (stop retries).
- on_failure_task: sets error status when workflow is truly dead.

Run before the fix: some tests fail (reproducing the issues).
Run after the fix: all tests pass.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from hatchet_sdk import NonRetryableException

from reflector.hatchet.error_classification import is_non_retryable
from reflector.llm import LLMParseError


# --- Tests for is_non_retryable() (pass once error_classification exists) ---


def test_is_non_retryable_returns_true_for_value_error():
    """ValueError (e.g. missing config) should stop retries."""
    assert is_non_retryable(ValueError("DAILY_API_KEY must be set")) is True


def test_is_non_retryable_returns_true_for_type_error():
    """TypeError (bad input) should stop retries."""
    assert is_non_retryable(TypeError("expected str")) is True


def test_is_non_retryable_returns_true_for_http_401():
    """HTTP 401 auth error should stop retries."""
    resp = MagicMock()
    resp.status_code = 401
    err = httpx.HTTPStatusError("Unauthorized", request=MagicMock(), response=resp)
    assert is_non_retryable(err) is True


def test_is_non_retryable_returns_true_for_http_402():
    """HTTP 402 (no credits) should stop retries."""
    resp = MagicMock()
    resp.status_code = 402
    err = httpx.HTTPStatusError("Payment Required", request=MagicMock(), response=resp)
    assert is_non_retryable(err) is True


def test_is_non_retryable_returns_true_for_http_404():
    """HTTP 404 should stop retries."""
    resp = MagicMock()
    resp.status_code = 404
    err = httpx.HTTPStatusError("Not Found", request=MagicMock(), response=resp)
    assert is_non_retryable(err) is True


def test_is_non_retryable_returns_false_for_http_503():
    """HTTP 503 is transient; retries are useful."""
    resp = MagicMock()
    resp.status_code = 503
    err = httpx.HTTPStatusError("Service Unavailable", request=MagicMock(), response=resp)
    assert is_non_retryable(err) is False


def test_is_non_retryable_returns_false_for_timeout():
    """Timeout is transient."""
    assert is_non_retryable(httpx.TimeoutException("timed out")) is False


def test_is_non_retryable_returns_true_for_llm_parse_error():
    """LLMParseError after internal retries should stop."""
    from pydantic import BaseModel

    class _Dummy(BaseModel):
        pass

    assert is_non_retryable(LLMParseError(_Dummy, "Failed to parse", 3)) is True


def test_is_non_retryable_returns_true_for_non_retryable_exception():
    """Already-wrapped NonRetryableException should stay non-retryable."""
    assert is_non_retryable(NonRetryableException("custom")) is True


# --- Tests for with_error_handling (need pipeline module with patch) ---


@pytest.fixture(scope="module")
def pipeline_module():
    """Import daily_multitrack_pipeline with Hatchet client mocked."""
    with patch("reflector.hatchet.client.settings") as s:
        s.HATCHET_CLIENT_TOKEN = "test-token"
        s.HATCHET_DEBUG = False
    mock_client = MagicMock()
    mock_client.workflow.return_value = MagicMock()
    with patch(
        "reflector.hatchet.client.HatchetClientManager.get_client",
        return_value=mock_client,
    ):
        from reflector.hatchet.workflows import daily_multitrack_pipeline

        return daily_multitrack_pipeline


@pytest.fixture
def mock_input():
    """Minimal PipelineInput for decorator tests."""
    from reflector.hatchet.workflows.daily_multitrack_pipeline import PipelineInput

    return PipelineInput(
        recording_id="rec-1",
        tracks=[],
        bucket_name="bucket",
        transcript_id="ts-123",
        room_id=None,
    )


@pytest.fixture
def mock_ctx():
    """Minimal Context-like object."""
    ctx = MagicMock()
    ctx.log = MagicMock()
    return ctx


@pytest.mark.asyncio
async def test_with_error_handling_transient_does_not_set_error_status(
    pipeline_module, mock_input, mock_ctx
):
    """Transient exception must NOT set error status (so user stays on 'processing' during retries).

    Before fix: set_workflow_error_status is called on every exception → FAIL.
    After fix: not called for transient → PASS.
    """
    from reflector.hatchet.workflows.daily_multitrack_pipeline import (
        TaskName,
        set_workflow_error_status,
        with_error_handling,
    )

    async def failing_task(input, ctx):
        raise httpx.TimeoutException("timed out")

    wrapped = with_error_handling(TaskName.GET_RECORDING)(failing_task)

    with patch(
        "reflector.hatchet.workflows.daily_multitrack_pipeline.set_workflow_error_status",
        new_callable=AsyncMock,
    ) as mock_set_error:
        with pytest.raises(httpx.TimeoutException):
            await wrapped(mock_input, mock_ctx)

        # Desired: do NOT set error status for transient (Hatchet will retry)
        mock_set_error.assert_not_called()


@pytest.mark.asyncio
async def test_with_error_handling_hard_fail_raises_non_retryable_and_sets_status(
    pipeline_module, mock_input, mock_ctx
):
    """Hard-fail (e.g. ValueError) must set error status and re-raise NonRetryableException.

    Before fix: raises ValueError, set_workflow_error_status called → test would need to expect ValueError.
    After fix: raises NonRetryableException, set_workflow_error_status called → PASS.
    """
    from reflector.hatchet.workflows.daily_multitrack_pipeline import (
        TaskName,
        set_workflow_error_status,
        with_error_handling,
    )

    async def failing_task(input, ctx):
        raise ValueError("PADDING_URL must be set")

    wrapped = with_error_handling(TaskName.GET_RECORDING)(failing_task)

    with patch(
        "reflector.hatchet.workflows.daily_multitrack_pipeline.set_workflow_error_status",
        new_callable=AsyncMock,
    ) as mock_set_error:
        with pytest.raises(NonRetryableException) as exc_info:
            await wrapped(mock_input, mock_ctx)

        assert "PADDING_URL" in str(exc_info.value)
        mock_set_error.assert_called_once_with("ts-123")


@pytest.mark.asyncio
async def test_with_error_handling_set_error_status_false_never_sets_status(
    pipeline_module, mock_input, mock_ctx
):
    """When set_error_status=False, we must never set error status (e.g. cleanup_consent)."""
    from reflector.hatchet.workflows.daily_multitrack_pipeline import (
        TaskName,
        with_error_handling,
    )

    async def failing_task(input, ctx):
        raise ValueError("something went wrong")

    wrapped = with_error_handling(TaskName.CLEANUP_CONSENT, set_error_status=False)(
        failing_task
    )

    with patch(
        "reflector.hatchet.workflows.daily_multitrack_pipeline.set_workflow_error_status",
        new_callable=AsyncMock,
    ) as mock_set_error:
        with pytest.raises((ValueError, NonRetryableException)):
            await wrapped(mock_input, mock_ctx)

        mock_set_error.assert_not_called()


@pytest.mark.asyncio
async def test_on_failure_task_sets_error_status(
    pipeline_module, mock_input, mock_ctx
):
    """Workflow must have an on_failure handler that sets transcript status to 'error'.

    Before fix: no on_workflow_failure in module → test fails (AttributeError).
    After fix: handler exists and sets status when called → PASS.
    """
    from reflector.hatchet.workflows.daily_multitrack_pipeline import (
        on_workflow_failure,
        set_workflow_error_status,
    )

    with patch(
        "reflector.hatchet.workflows.daily_multitrack_pipeline.set_workflow_error_status",
        new_callable=AsyncMock,
    ) as mock_set_error:
        await on_workflow_failure(mock_input, mock_ctx)
        mock_set_error.assert_called_once_with(mock_input.transcript_id)


# --- Tests for fan-out partial failure (Issue 3: aio_run_many return_exceptions=True) ---


def test_successful_run_results_filters_exceptions():
    """_successful_run_results returns only non-exception items (used for partial fan-out)."""
    from reflector.hatchet.workflows.daily_multitrack_pipeline import (
        _successful_run_results,
    )

    results = [
        {"key": "ok1"},
        ValueError("child failed"),
        {"key": "ok2"},
        RuntimeError("another"),
    ]
    successful = _successful_run_results(results)
    assert len(successful) == 2
    assert successful[0] == {"key": "ok1"}
    assert successful[1] == {"key": "ok2"}
