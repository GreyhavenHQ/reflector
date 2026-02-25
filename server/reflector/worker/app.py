import celery
import structlog
from celery import Celery
from celery.schedules import crontab

from reflector.settings import settings

logger = structlog.get_logger(__name__)

# Polling intervals (seconds)
# CELERY_BEAT_POLL_INTERVAL overrides all sub-5-min intervals (e.g. 300 for selfhosted)
_override = (
    float(settings.CELERY_BEAT_POLL_INTERVAL)
    if settings.CELERY_BEAT_POLL_INTERVAL > 0
    else 0
)

# Webhook-aware: 180s when webhook configured (backup mode), 15s when no webhook (primary discovery)
POLL_DAILY_RECORDINGS_INTERVAL_SEC = _override or (
    180.0 if settings.DAILY_WEBHOOK_SECRET else 15.0
)
SQS_POLL_INTERVAL = _override or float(settings.SQS_POLLING_TIMEOUT_SECONDS)
RECONCILIATION_INTERVAL = _override or 30.0
ICS_SYNC_INTERVAL = _override or 60.0
UPCOMING_MEETINGS_INTERVAL = _override or 30.0


def build_beat_schedule(
    *,
    whereby_api_key=None,
    aws_process_recording_queue_url=None,
    daily_api_key=None,
    public_mode=False,
    public_data_retention_days=None,
    healthcheck_url=None,
):
    """Build the Celery beat schedule based on configured services.

    Only registers tasks for services that are actually configured,
    avoiding unnecessary worker wake-ups in selfhosted deployments.
    """
    beat_schedule = {}

    _whereby_enabled = bool(whereby_api_key) or bool(aws_process_recording_queue_url)
    if _whereby_enabled:
        beat_schedule["process_messages"] = {
            "task": "reflector.worker.process.process_messages",
            "schedule": SQS_POLL_INTERVAL,
        }
        beat_schedule["reprocess_failed_recordings"] = {
            "task": "reflector.worker.process.reprocess_failed_recordings",
            "schedule": crontab(hour=5, minute=0),  # Midnight EST
        }
        logger.info(
            "Whereby beat tasks enabled",
            tasks=["process_messages", "reprocess_failed_recordings"],
        )
    else:
        logger.info("Whereby beat tasks disabled (no WHEREBY_API_KEY or SQS URL)")

    _daily_enabled = bool(daily_api_key)
    if _daily_enabled:
        beat_schedule["poll_daily_recordings"] = {
            "task": "reflector.worker.process.poll_daily_recordings",
            "schedule": POLL_DAILY_RECORDINGS_INTERVAL_SEC,
        }
        beat_schedule["trigger_daily_reconciliation"] = {
            "task": "reflector.worker.process.trigger_daily_reconciliation",
            "schedule": RECONCILIATION_INTERVAL,
        }
        beat_schedule["reprocess_failed_daily_recordings"] = {
            "task": "reflector.worker.process.reprocess_failed_daily_recordings",
            "schedule": crontab(hour=5, minute=0),  # Midnight EST
        }
        logger.info(
            "Daily.co beat tasks enabled",
            tasks=[
                "poll_daily_recordings",
                "trigger_daily_reconciliation",
                "reprocess_failed_daily_recordings",
            ],
        )
    else:
        logger.info("Daily.co beat tasks disabled (no DAILY_API_KEY)")

    _any_platform = _whereby_enabled or _daily_enabled
    if _any_platform:
        beat_schedule["process_meetings"] = {
            "task": "reflector.worker.process.process_meetings",
            "schedule": SQS_POLL_INTERVAL,
        }
        beat_schedule["sync_all_ics_calendars"] = {
            "task": "reflector.worker.ics_sync.sync_all_ics_calendars",
            "schedule": ICS_SYNC_INTERVAL,
        }
        beat_schedule["create_upcoming_meetings"] = {
            "task": "reflector.worker.ics_sync.create_upcoming_meetings",
            "schedule": UPCOMING_MEETINGS_INTERVAL,
        }
        logger.info(
            "Platform tasks enabled",
            tasks=[
                "process_meetings",
                "sync_all_ics_calendars",
                "create_upcoming_meetings",
            ],
        )
    else:
        logger.info("Platform tasks disabled (no video platform configured)")

    if public_mode:
        beat_schedule["cleanup_old_public_data"] = {
            "task": "reflector.worker.cleanup.cleanup_old_public_data_task",
            "schedule": crontab(hour=3, minute=0),
        }
        logger.info(
            "Public mode cleanup enabled",
            retention_days=public_data_retention_days,
        )

    if healthcheck_url:
        beat_schedule["healthcheck_ping"] = {
            "task": "reflector.worker.healthcheck.healthcheck_ping",
            "schedule": 60.0 * 10,
        }
        logger.info("Healthcheck enabled", url=healthcheck_url)
    else:
        logger.warning("Healthcheck disabled, no url configured")

    logger.info(
        "Beat schedule configured",
        total_tasks=len(beat_schedule),
        task_names=sorted(beat_schedule.keys()),
    )

    return beat_schedule


if celery.current_app.main != "default":
    logger.info(f"Celery already configured ({celery.current_app})")
    app = celery.current_app
else:
    app = Celery(__name__)
    app.conf.broker_url = settings.CELERY_BROKER_URL
    app.conf.result_backend = settings.CELERY_RESULT_BACKEND
    app.conf.broker_connection_retry_on_startup = True
    app.autodiscover_tasks(
        [
            "reflector.pipelines.main_live_pipeline",
            "reflector.worker.healthcheck",
            "reflector.worker.process",
            "reflector.worker.cleanup",
            "reflector.worker.ics_sync",
        ]
    )

    app.conf.beat_schedule = build_beat_schedule(
        whereby_api_key=settings.WHEREBY_API_KEY,
        aws_process_recording_queue_url=settings.AWS_PROCESS_RECORDING_QUEUE_URL,
        daily_api_key=settings.DAILY_API_KEY,
        public_mode=settings.PUBLIC_MODE,
        public_data_retention_days=settings.PUBLIC_DATA_RETENTION_DAYS,
        healthcheck_url=settings.HEALTHCHECK_URL,
    )
