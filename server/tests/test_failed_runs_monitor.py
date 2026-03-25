"""
Tests for FailedRunsMonitor Hatchet cron workflow.

Tests cover:
- No Zulip message sent when no failures found
- Messages sent for failed main pipeline runs
- Child workflow failures filtered out
- Errors in the monitor itself are caught and logged
"""

from datetime import timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from hatchet_sdk.clients.rest.models import V1TaskStatus


def _make_task_summary(
    workflow_name: str,
    workflow_run_external_id: str = "run-123",
    status: V1TaskStatus = V1TaskStatus.FAILED,
):
    """Create a mock V1TaskSummary."""
    mock = MagicMock()
    mock.workflow_name = workflow_name
    mock.workflow_run_external_id = workflow_run_external_id
    mock.status = status
    return mock


@pytest.mark.asyncio
class TestCheckFailedRuns:
    async def test_no_failures_sends_no_message(self):
        mock_result = MagicMock()
        mock_result.rows = []

        mock_client = MagicMock()
        mock_client.runs.aio_list = AsyncMock(return_value=mock_result)

        with (
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.HatchetClientManager.get_client",
                return_value=mock_client,
            ),
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.send_message_to_zulip",
                new_callable=AsyncMock,
            ) as mock_send,
        ):
            from reflector.hatchet.workflows.failed_runs_monitor import (
                _check_failed_runs,
            )

            result = await _check_failed_runs()

            assert result["checked"] == 0
            assert result["reported"] == 0
            mock_send.assert_not_called()

    async def test_reports_failed_main_pipeline_runs(self):
        failed_runs = [
            _make_task_summary("DiarizationPipeline", "run-1"),
            _make_task_summary("FilePipeline", "run-2"),
        ]
        mock_result = MagicMock()
        mock_result.rows = failed_runs

        mock_details = MagicMock()
        mock_client = MagicMock()
        mock_client.runs.aio_list = AsyncMock(return_value=mock_result)
        mock_client.runs.aio_get = AsyncMock(return_value=mock_details)

        with (
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.HatchetClientManager.get_client",
                return_value=mock_client,
            ),
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.render_run_detail",
                return_value="**rendered DAG**",
            ),
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.send_message_to_zulip",
                new_callable=AsyncMock,
                return_value={"id": 1},
            ) as mock_send,
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.settings"
            ) as mock_settings,
        ):
            mock_settings.ZULIP_DAG_STREAM = "dag-stream"
            mock_settings.ZULIP_DAG_TOPIC = "dag-topic"

            from reflector.hatchet.workflows.failed_runs_monitor import (
                _check_failed_runs,
            )

            result = await _check_failed_runs()

            assert result["checked"] == 2
            assert result["reported"] == 2
            assert mock_send.call_count == 2
            mock_send.assert_any_call("dag-stream", "dag-topic", "**rendered DAG**")

    async def test_filters_out_child_workflows(self):
        runs = [
            _make_task_summary("DiarizationPipeline", "run-1"),
            _make_task_summary("TrackProcessing", "run-2"),
            _make_task_summary("TopicChunkProcessing", "run-3"),
            _make_task_summary("SubjectProcessing", "run-4"),
        ]
        mock_result = MagicMock()
        mock_result.rows = runs

        mock_details = MagicMock()
        mock_client = MagicMock()
        mock_client.runs.aio_list = AsyncMock(return_value=mock_result)
        mock_client.runs.aio_get = AsyncMock(return_value=mock_details)

        with (
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.HatchetClientManager.get_client",
                return_value=mock_client,
            ),
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.render_run_detail",
                return_value="**rendered**",
            ),
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.send_message_to_zulip",
                new_callable=AsyncMock,
                return_value={"id": 1},
            ) as mock_send,
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.settings"
            ) as mock_settings,
        ):
            mock_settings.ZULIP_DAG_STREAM = "dag-stream"
            mock_settings.ZULIP_DAG_TOPIC = "dag-topic"

            from reflector.hatchet.workflows.failed_runs_monitor import (
                _check_failed_runs,
            )

            result = await _check_failed_runs()

            # Only DiarizationPipeline should be reported
            assert result["checked"] == 4
            assert result["reported"] == 1
            assert mock_send.call_count == 1

    async def test_all_three_pipelines_reported(self):
        runs = [
            _make_task_summary("DiarizationPipeline", "run-1"),
            _make_task_summary("FilePipeline", "run-2"),
            _make_task_summary("LivePostProcessingPipeline", "run-3"),
        ]
        mock_result = MagicMock()
        mock_result.rows = runs

        mock_details = MagicMock()
        mock_client = MagicMock()
        mock_client.runs.aio_list = AsyncMock(return_value=mock_result)
        mock_client.runs.aio_get = AsyncMock(return_value=mock_details)

        with (
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.HatchetClientManager.get_client",
                return_value=mock_client,
            ),
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.render_run_detail",
                return_value="**rendered**",
            ),
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.send_message_to_zulip",
                new_callable=AsyncMock,
                return_value={"id": 1},
            ) as mock_send,
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.settings"
            ) as mock_settings,
        ):
            mock_settings.ZULIP_DAG_STREAM = "dag-stream"
            mock_settings.ZULIP_DAG_TOPIC = "dag-topic"

            from reflector.hatchet.workflows.failed_runs_monitor import (
                _check_failed_runs,
            )

            result = await _check_failed_runs()

            assert result["reported"] == 3
            assert mock_send.call_count == 3

    async def test_continues_on_individual_run_failure(self):
        """If one run fails to report, the others should still be reported."""
        runs = [
            _make_task_summary("DiarizationPipeline", "run-1"),
            _make_task_summary("FilePipeline", "run-2"),
        ]
        mock_result = MagicMock()
        mock_result.rows = runs

        mock_client = MagicMock()
        mock_client.runs.aio_list = AsyncMock(return_value=mock_result)
        # First call raises, second succeeds
        mock_client.runs.aio_get = AsyncMock(
            side_effect=[Exception("Hatchet API error"), MagicMock()]
        )

        with (
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.HatchetClientManager.get_client",
                return_value=mock_client,
            ),
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.render_run_detail",
                return_value="**rendered**",
            ),
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.send_message_to_zulip",
                new_callable=AsyncMock,
                return_value={"id": 1},
            ) as mock_send,
            patch(
                "reflector.hatchet.workflows.failed_runs_monitor.settings"
            ) as mock_settings,
        ):
            mock_settings.ZULIP_DAG_STREAM = "dag-stream"
            mock_settings.ZULIP_DAG_TOPIC = "dag-topic"

            from reflector.hatchet.workflows.failed_runs_monitor import (
                _check_failed_runs,
            )

            result = await _check_failed_runs()

            # First run failed to report, second succeeded
            assert result["reported"] == 1
            assert mock_send.call_count == 1

    async def test_handles_list_api_failure(self):
        """If aio_list fails, should return error and not crash."""
        mock_client = MagicMock()
        mock_client.runs.aio_list = AsyncMock(
            side_effect=Exception("Connection refused")
        )

        with patch(
            "reflector.hatchet.workflows.failed_runs_monitor.HatchetClientManager.get_client",
            return_value=mock_client,
        ):
            from reflector.hatchet.workflows.failed_runs_monitor import (
                _check_failed_runs,
            )

            result = await _check_failed_runs()

            assert result["checked"] == 0
            assert result["reported"] == 0
            assert "error" in result

    async def test_uses_correct_time_window(self):
        """Verify the correct since/until parameters are passed to aio_list."""
        mock_result = MagicMock()
        mock_result.rows = []

        mock_client = MagicMock()
        mock_client.runs.aio_list = AsyncMock(return_value=mock_result)

        with patch(
            "reflector.hatchet.workflows.failed_runs_monitor.HatchetClientManager.get_client",
            return_value=mock_client,
        ):
            from reflector.hatchet.workflows.failed_runs_monitor import (
                _check_failed_runs,
            )

            await _check_failed_runs()

            call_kwargs = mock_client.runs.aio_list.call_args
            assert call_kwargs.kwargs["statuses"] == [V1TaskStatus.FAILED]
            since = call_kwargs.kwargs["since"]
            until = call_kwargs.kwargs["until"]
            assert since.tzinfo == timezone.utc
            assert until.tzinfo == timezone.utc
            # Window should be ~1 hour
            delta = until - since
            assert 3590 < delta.total_seconds() < 3610
