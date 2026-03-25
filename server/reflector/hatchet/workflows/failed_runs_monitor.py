"""
Hatchet cron workflow: FailedRunsMonitor

Runs hourly, queries Hatchet for failed pipeline runs in the last hour,
and posts details to Zulip for visibility.

Only registered with the worker when Zulip DAG settings are configured.
"""

from datetime import datetime, timedelta, timezone

from hatchet_sdk import Context
from hatchet_sdk.clients.rest.models import V1TaskStatus

from reflector.hatchet.client import HatchetClientManager
from reflector.logger import logger
from reflector.settings import settings

MONITORED_PIPELINES = {
    "DiarizationPipeline",
    "FilePipeline",
    "LivePostProcessingPipeline",
}

LOOKBACK_HOURS = 1

hatchet = HatchetClientManager.get_client()

failed_runs_monitor = hatchet.workflow(
    name="FailedRunsMonitor",
    on_crons=["0 * * * *"],
)


async def _check_failed_runs() -> dict:
    """Core logic: query for failed pipeline runs and post each to Zulip.

    Extracted from the Hatchet task for testability.
    """
    now = datetime.now(tz=timezone.utc)
    since = now - timedelta(hours=LOOKBACK_HOURS)

    client = HatchetClientManager.get_client()

    try:
        result = await client.runs.aio_list(
            statuses=[V1TaskStatus.FAILED],
            since=since,
            until=now,
        )
    except Exception:
        logger.exception("[FailedRunsMonitor] Failed to list runs from Hatchet")
        return {"checked": 0, "reported": 0, "error": "failed to list runs"}

    rows = result.rows or []

    # Filter to main pipelines only (skip child workflows like TrackProcessing, etc.)
    failed_main_runs = [run for run in rows if run.workflow_name in MONITORED_PIPELINES]

    if not failed_main_runs:
        logger.info(
            "[FailedRunsMonitor] No failed pipeline runs in the last hour",
            total_failed=len(rows),
            since=since.isoformat(),
        )
        return {"checked": len(rows), "reported": 0}

    logger.info(
        "[FailedRunsMonitor] Found failed pipeline runs",
        count=len(failed_main_runs),
        since=since.isoformat(),
    )

    # Deferred imports for fork-safety
    from reflector.tools.render_hatchet_run import render_run_detail  # noqa: PLC0415
    from reflector.zulip import send_message_to_zulip  # noqa: PLC0415

    reported = 0
    for run in failed_main_runs:
        try:
            details = await client.runs.aio_get(run.workflow_run_external_id)
            content = render_run_detail(details)
            await send_message_to_zulip(
                settings.ZULIP_DAG_STREAM,
                settings.ZULIP_DAG_TOPIC,
                content,
            )
            reported += 1
        except Exception:
            logger.exception(
                "[FailedRunsMonitor] Failed to report run",
                workflow_run_id=run.workflow_run_external_id,
                workflow_name=run.workflow_name,
            )

    logger.info(
        "[FailedRunsMonitor] Finished reporting",
        reported=reported,
        total_failed_main=len(failed_main_runs),
    )
    return {"checked": len(rows), "reported": reported}


@failed_runs_monitor.task(
    execution_timeout=timedelta(seconds=120),
    retries=1,
)
async def check_failed_runs(ctx: Context) -> dict:
    """Hatchet task entry point — delegates to _check_failed_runs."""
    return await _check_failed_runs()
