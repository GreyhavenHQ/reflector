"""
LLM/I/O worker pool for all non-CPU tasks.
Handles: all tasks except mixdown_tracks (transcription, LLM inference, orchestration)
"""

import asyncio

import reflector._warnings_filter  # noqa: F401 -- side effect: suppress pydantic validate_default warning
from reflector.hatchet.client import HatchetClientManager
from reflector.hatchet.workflows.daily_multitrack_pipeline import (
    daily_multitrack_pipeline,
)
from reflector.hatchet.workflows.failed_runs_monitor import failed_runs_monitor
from reflector.hatchet.workflows.file_pipeline import file_pipeline
from reflector.hatchet.workflows.live_post_pipeline import live_post_pipeline
from reflector.hatchet.workflows.subject_processing import subject_workflow
from reflector.hatchet.workflows.topic_chunk_processing import topic_chunk_workflow
from reflector.hatchet.workflows.track_processing import track_workflow
from reflector.logger import logger
from reflector.settings import settings

SLOTS = 10
WORKER_NAME = "llm-worker-pool"
POOL = "llm-io"


def main():
    hatchet = HatchetClientManager.get_client()

    try:
        asyncio.run(HatchetClientManager.ensure_rate_limit())
    except Exception as e:
        logger.warning(
            "[Hatchet] Rate limit initialization failed, but continuing. "
            "If workflows fail to register, rate limits may need to be created manually.",
            error=str(e),
        )

    workflows = [
        daily_multitrack_pipeline,
        file_pipeline,
        live_post_pipeline,
        topic_chunk_workflow,
        subject_workflow,
        track_workflow,
    ]

    _zulip_dag_enabled = all(
        [
            settings.ZULIP_REALM,
            settings.ZULIP_API_KEY,
            settings.ZULIP_BOT_EMAIL,
            settings.ZULIP_DAG_STREAM,
            settings.ZULIP_DAG_TOPIC,
        ]
    )
    if _zulip_dag_enabled:
        workflows.append(failed_runs_monitor)
        logger.info(
            "FailedRunsMonitor cron enabled",
            stream=settings.ZULIP_DAG_STREAM,
            topic=settings.ZULIP_DAG_TOPIC,
        )
    else:
        logger.info("FailedRunsMonitor cron disabled (Zulip DAG not configured)")

    logger.info(
        "Starting Hatchet LLM worker pool (all tasks except mixdown)",
        worker_name=WORKER_NAME,
        slots=SLOTS,
        labels={"pool": POOL},
    )

    llm_worker = hatchet.worker(
        WORKER_NAME,
        slots=SLOTS,  # not all slots are probably used
        labels={
            "pool": POOL,
        },
        workflows=workflows,
    )

    try:
        llm_worker.start()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal, stopping LLM workers...")


if __name__ == "__main__":
    main()
