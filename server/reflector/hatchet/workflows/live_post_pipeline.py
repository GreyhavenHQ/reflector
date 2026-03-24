"""
Hatchet workflow: LivePostProcessingPipeline

Post-processing pipeline for live WebRTC meetings.
Triggered after a live meeting ends. Orchestrates:
  Left branch:  waveform → convert_mp3 → upload_mp3 → remove_upload → diarize → cleanup_consent
  Right branch: generate_title (parallel with left branch)
  Fan-in:       final_summaries → post_zulip → send_webhook

Note: This file uses deferred imports (inside functions/tasks) intentionally.
Hatchet workers run in forked processes; fresh imports per task ensure DB connections
are not shared across forks, avoiding connection pooling issues.
"""

from datetime import timedelta

from hatchet_sdk import Context
from pydantic import BaseModel

from reflector.email import is_email_configured, send_transcript_email
from reflector.hatchet.client import HatchetClientManager
from reflector.hatchet.constants import (
    TIMEOUT_HEAVY,
    TIMEOUT_MEDIUM,
    TIMEOUT_SHORT,
    TIMEOUT_TITLE,
    TaskName,
)
from reflector.hatchet.workflows.daily_multitrack_pipeline import (
    fresh_db_connection,
    set_workflow_error_status,
    with_error_handling,
)
from reflector.hatchet.workflows.models import (
    ConsentResult,
    EmailResult,
    TitleResult,
    WaveformResult,
    WebhookResult,
    ZulipResult,
)
from reflector.logger import logger
from reflector.settings import settings


class LivePostPipelineInput(BaseModel):
    transcript_id: str
    room_id: str | None = None


# --- Result models specific to live post pipeline ---


class ConvertMp3Result(BaseModel):
    converted: bool


class UploadMp3Result(BaseModel):
    uploaded: bool


class RemoveUploadResult(BaseModel):
    removed: bool


class DiarizeResult(BaseModel):
    diarized: bool


class FinalSummariesResult(BaseModel):
    generated: bool


hatchet = HatchetClientManager.get_client()

live_post_pipeline = hatchet.workflow(
    name="LivePostProcessingPipeline", input_validator=LivePostPipelineInput
)


@live_post_pipeline.task(
    execution_timeout=timedelta(seconds=TIMEOUT_MEDIUM),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=10,
)
@with_error_handling(TaskName.WAVEFORM)
async def waveform(input: LivePostPipelineInput, ctx: Context) -> WaveformResult:
    """Generate waveform visualization from recorded audio."""
    ctx.log(f"waveform: starting for transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.db.transcripts import transcripts_controller  # noqa: PLC0415
        from reflector.pipelines.main_live_pipeline import (  # noqa: PLC0415
            PipelineMainWaveform,
        )

        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if not transcript:
            raise ValueError(f"Transcript {input.transcript_id} not found")

        runner = PipelineMainWaveform(transcript_id=transcript.id)
        await runner.run()

    ctx.log("waveform complete")
    return WaveformResult(waveform_generated=True)


@live_post_pipeline.task(
    execution_timeout=timedelta(seconds=TIMEOUT_TITLE),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=15,
)
@with_error_handling(TaskName.GENERATE_TITLE)
async def generate_title(input: LivePostPipelineInput, ctx: Context) -> TitleResult:
    """Generate meeting title from topics (runs in parallel with audio chain)."""
    ctx.log(f"generate_title: starting for transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.pipelines.main_live_pipeline import (  # noqa: PLC0415
            PipelineMainTitle,
        )

        runner = PipelineMainTitle(transcript_id=input.transcript_id)
        await runner.run()

    ctx.log("generate_title complete")
    return TitleResult(title=None)


@live_post_pipeline.task(
    parents=[waveform],
    execution_timeout=timedelta(seconds=TIMEOUT_MEDIUM),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=10,
)
@with_error_handling(TaskName.CONVERT_MP3)
async def convert_mp3(input: LivePostPipelineInput, ctx: Context) -> ConvertMp3Result:
    """Convert WAV recording to MP3."""
    ctx.log(f"convert_mp3: starting for transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.pipelines.main_live_pipeline import (  # noqa: PLC0415
            pipeline_convert_to_mp3,
        )

        await pipeline_convert_to_mp3(transcript_id=input.transcript_id)

    ctx.log("convert_mp3 complete")
    return ConvertMp3Result(converted=True)


@live_post_pipeline.task(
    parents=[convert_mp3],
    execution_timeout=timedelta(seconds=TIMEOUT_MEDIUM),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=10,
)
@with_error_handling(TaskName.UPLOAD_MP3)
async def upload_mp3(input: LivePostPipelineInput, ctx: Context) -> UploadMp3Result:
    """Upload MP3 to external storage."""
    ctx.log(f"upload_mp3: starting for transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.pipelines.main_live_pipeline import (  # noqa: PLC0415
            pipeline_upload_mp3,
        )

        await pipeline_upload_mp3(transcript_id=input.transcript_id)

    ctx.log("upload_mp3 complete")
    return UploadMp3Result(uploaded=True)


@live_post_pipeline.task(
    parents=[upload_mp3],
    execution_timeout=timedelta(seconds=TIMEOUT_SHORT),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=5,
)
@with_error_handling(TaskName.REMOVE_UPLOAD)
async def remove_upload(
    input: LivePostPipelineInput, ctx: Context
) -> RemoveUploadResult:
    """Remove the original upload file."""
    ctx.log(f"remove_upload: starting for transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.pipelines.main_live_pipeline import (  # noqa: PLC0415
            pipeline_remove_upload,
        )

        await pipeline_remove_upload(transcript_id=input.transcript_id)

    ctx.log("remove_upload complete")
    return RemoveUploadResult(removed=True)


@live_post_pipeline.task(
    parents=[remove_upload],
    execution_timeout=timedelta(seconds=TIMEOUT_HEAVY),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=30,
)
@with_error_handling(TaskName.DIARIZE)
async def diarize(input: LivePostPipelineInput, ctx: Context) -> DiarizeResult:
    """Run diarization on the recorded audio."""
    ctx.log(f"diarize: starting for transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.pipelines.main_live_pipeline import (  # noqa: PLC0415
            pipeline_diarization,
        )

        await pipeline_diarization(transcript_id=input.transcript_id)

    ctx.log("diarize complete")
    return DiarizeResult(diarized=True)


@live_post_pipeline.task(
    parents=[diarize],
    execution_timeout=timedelta(seconds=TIMEOUT_SHORT),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=10,
)
@with_error_handling(TaskName.CLEANUP_CONSENT, set_error_status=False)
async def cleanup_consent(input: LivePostPipelineInput, ctx: Context) -> ConsentResult:
    """Check consent and delete audio files if any participant denied."""
    ctx.log(f"cleanup_consent: transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.pipelines.main_live_pipeline import (  # noqa: PLC0415
            cleanup_consent as _cleanup_consent,
        )

        await _cleanup_consent(transcript_id=input.transcript_id)

    ctx.log("cleanup_consent complete")
    return ConsentResult()


@live_post_pipeline.task(
    parents=[cleanup_consent, generate_title],
    execution_timeout=timedelta(seconds=TIMEOUT_HEAVY),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=30,
)
@with_error_handling(TaskName.FINAL_SUMMARIES)
async def final_summaries(
    input: LivePostPipelineInput, ctx: Context
) -> FinalSummariesResult:
    """Generate final summaries (fan-in after audio chain + title)."""
    ctx.log(f"final_summaries: starting for transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.pipelines.main_live_pipeline import (  # noqa: PLC0415
            pipeline_summaries,
        )

        await pipeline_summaries(transcript_id=input.transcript_id)

    ctx.log("final_summaries complete")
    return FinalSummariesResult(generated=True)


@live_post_pipeline.task(
    parents=[final_summaries],
    execution_timeout=timedelta(seconds=TIMEOUT_SHORT),
    retries=5,
    backoff_factor=2.0,
    backoff_max_seconds=15,
)
@with_error_handling(TaskName.POST_ZULIP, set_error_status=False)
async def post_zulip(input: LivePostPipelineInput, ctx: Context) -> ZulipResult:
    """Post notification to Zulip."""
    ctx.log(f"post_zulip: transcript_id={input.transcript_id}")

    if not settings.ZULIP_REALM:
        ctx.log("post_zulip skipped (Zulip not configured)")
        return ZulipResult(zulip_message_id=None, skipped=True)

    async with fresh_db_connection():
        from reflector.db.transcripts import transcripts_controller  # noqa: PLC0415
        from reflector.zulip import post_transcript_notification  # noqa: PLC0415

        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if transcript:
            message_id = await post_transcript_notification(transcript)
            ctx.log(f"post_zulip complete: zulip_message_id={message_id}")
        else:
            message_id = None

    return ZulipResult(zulip_message_id=message_id)


@live_post_pipeline.task(
    parents=[final_summaries],
    execution_timeout=timedelta(seconds=TIMEOUT_MEDIUM),
    retries=5,
    backoff_factor=2.0,
    backoff_max_seconds=15,
)
@with_error_handling(TaskName.SEND_WEBHOOK, set_error_status=False)
async def send_webhook(input: LivePostPipelineInput, ctx: Context) -> WebhookResult:
    """Send completion webhook to external service."""
    ctx.log(f"send_webhook: transcript_id={input.transcript_id}")

    if not input.room_id:
        ctx.log("send_webhook skipped (no room_id)")
        return WebhookResult(webhook_sent=False, skipped=True)

    async with fresh_db_connection():
        from reflector.db.rooms import rooms_controller  # noqa: PLC0415
        from reflector.utils.webhook import (  # noqa: PLC0415
            fetch_transcript_webhook_payload,
            send_webhook_request,
        )

        room = await rooms_controller.get_by_id(input.room_id)
        if not room or not room.webhook_url:
            ctx.log("send_webhook skipped (no webhook_url configured)")
            return WebhookResult(webhook_sent=False, skipped=True)

        payload = await fetch_transcript_webhook_payload(
            transcript_id=input.transcript_id,
            room_id=input.room_id,
        )

        if isinstance(payload, str):
            ctx.log(f"send_webhook skipped (could not build payload): {payload}")
            return WebhookResult(webhook_sent=False, skipped=True)

        import httpx  # noqa: PLC0415

        try:
            response = await send_webhook_request(
                url=room.webhook_url,
                payload=payload,
                event_type="transcript.completed",
                webhook_secret=room.webhook_secret,
                timeout=30.0,
            )
            ctx.log(f"send_webhook complete: status_code={response.status_code}")
            return WebhookResult(webhook_sent=True, response_code=response.status_code)
        except httpx.HTTPStatusError as e:
            ctx.log(f"send_webhook failed (HTTP {e.response.status_code}), continuing")
            return WebhookResult(
                webhook_sent=False, response_code=e.response.status_code
            )
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            ctx.log(f"send_webhook failed ({e}), continuing")
            return WebhookResult(webhook_sent=False)
        except Exception as e:
            ctx.log(f"send_webhook unexpected error: {e}")
            return WebhookResult(webhook_sent=False)


@live_post_pipeline.task(
    parents=[final_summaries],
    execution_timeout=timedelta(seconds=TIMEOUT_SHORT),
    retries=5,
    backoff_factor=2.0,
    backoff_max_seconds=15,
)
@with_error_handling(TaskName.SEND_EMAIL, set_error_status=False)
async def send_email(input: LivePostPipelineInput, ctx: Context) -> EmailResult:
    """Send transcript email to collected recipients."""
    ctx.log(f"send_email: transcript_id={input.transcript_id}")

    if not is_email_configured():
        ctx.log("send_email skipped (SMTP not configured)")
        return EmailResult(skipped=True)

    async with fresh_db_connection():
        from reflector.db.meetings import meetings_controller  # noqa: PLC0415
        from reflector.db.recordings import recordings_controller  # noqa: PLC0415
        from reflector.db.transcripts import transcripts_controller  # noqa: PLC0415

        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if not transcript:
            ctx.log("send_email skipped (transcript not found)")
            return EmailResult(skipped=True)

        meeting = None
        if transcript.meeting_id:
            meeting = await meetings_controller.get_by_id(transcript.meeting_id)
        if not meeting and transcript.recording_id:
            recording = await recordings_controller.get_by_id(transcript.recording_id)
            if recording and recording.meeting_id:
                meeting = await meetings_controller.get_by_id(recording.meeting_id)

        recipients = (
            list(meeting.email_recipients)
            if meeting and meeting.email_recipients
            else []
        )

        # Also check room-level email
        from reflector.db.rooms import rooms_controller  # noqa: PLC0415

        if transcript.room_id:
            room = await rooms_controller.get_by_id(transcript.room_id)
            if room and room.email_transcript_to:
                if room.email_transcript_to not in recipients:
                    recipients.append(room.email_transcript_to)

        if not recipients:
            ctx.log("send_email skipped (no email recipients)")
            return EmailResult(skipped=True)

        # For room-level emails, do NOT change share_mode (only set public if meeting had recipients)
        if meeting and meeting.email_recipients:
            await transcripts_controller.update(transcript, {"share_mode": "public"})

        count = await send_transcript_email(recipients, transcript)
        ctx.log(f"send_email complete: sent {count} emails")

    return EmailResult(emails_sent=count)


# --- On failure handler ---


async def on_workflow_failure(input: LivePostPipelineInput, ctx: Context) -> None:
    """Set transcript status to 'error' only if not already 'ended'."""
    async with fresh_db_connection():
        from reflector.db.transcripts import transcripts_controller  # noqa: PLC0415

        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if transcript and transcript.status == "ended":
            logger.info(
                "[Hatchet] LivePostProcessingPipeline on_workflow_failure: transcript already ended",
                transcript_id=input.transcript_id,
            )
            ctx.log(
                "on_workflow_failure: transcript already ended, skipping error status"
            )
            return
    await set_workflow_error_status(input.transcript_id)


@live_post_pipeline.on_failure_task()
async def _register_on_workflow_failure(
    input: LivePostPipelineInput, ctx: Context
) -> None:
    await on_workflow_failure(input, ctx)
