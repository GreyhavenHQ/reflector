"""
Hatchet workflow: FilePipeline

Processing pipeline for file uploads and Whereby recordings.
Orchestrates: extract audio → upload → transcribe/diarize/waveform (parallel)
→ assemble → detect topics → title/summaries (parallel) → finalize
→ cleanup consent → post zulip / send webhook.

Note: This file uses deferred imports (inside functions/tasks) intentionally.
Hatchet workers run in forked processes; fresh imports per task ensure DB connections
are not shared across forks, avoiding connection pooling issues.
"""

import json
from datetime import timedelta
from pathlib import Path

from hatchet_sdk import Context
from pydantic import BaseModel

from reflector.email import is_email_configured, send_transcript_email
from reflector.hatchet.broadcast import (
    append_event_and_broadcast,
    set_status_and_broadcast,
)
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
    TopicsResult,
    WaveformResult,
    WebhookResult,
    ZulipResult,
)
from reflector.logger import logger
from reflector.pipelines import topic_processing
from reflector.settings import settings
from reflector.utils.audio_constants import WAVEFORM_SEGMENTS
from reflector.utils.audio_waveform import get_audio_waveform


class FilePipelineInput(BaseModel):
    transcript_id: str
    room_id: str | None = None


# --- Result models specific to file pipeline ---


class ExtractAudioResult(BaseModel):
    audio_path: str
    duration_ms: float = 0.0


class UploadAudioResult(BaseModel):
    audio_url: str
    audio_path: str


class TranscribeResult(BaseModel):
    words: list[dict]
    translation: str | None = None


class DiarizeResult(BaseModel):
    diarization: list[dict] | None = None


class AssembleTranscriptResult(BaseModel):
    assembled: bool


class SummariesResult(BaseModel):
    generated: bool


class FinalizeResult(BaseModel):
    status: str


hatchet = HatchetClientManager.get_client()

file_pipeline = hatchet.workflow(name="FilePipeline", input_validator=FilePipelineInput)


@file_pipeline.task(
    execution_timeout=timedelta(seconds=TIMEOUT_MEDIUM),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=10,
)
@with_error_handling(TaskName.EXTRACT_AUDIO)
async def extract_audio(input: FilePipelineInput, ctx: Context) -> ExtractAudioResult:
    """Extract audio from upload file, convert to MP3."""
    ctx.log(f"extract_audio: starting for transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.db.transcripts import transcripts_controller  # noqa: PLC0415

        await set_status_and_broadcast(input.transcript_id, "processing", logger=logger)

        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if not transcript:
            raise ValueError(f"Transcript {input.transcript_id} not found")

        # Clear transcript as we're going to regenerate everything
        await transcripts_controller.update(
            transcript,
            {
                "events": [],
                "topics": [],
            },
        )

        # Find upload file
        audio_file = next(transcript.data_path.glob("upload.*"), None)
        if not audio_file:
            audio_file = next(transcript.data_path.glob("audio.*"), None)
        if not audio_file:
            raise ValueError("No audio file found to process")

        ctx.log(f"extract_audio: processing {audio_file}")

        # Extract audio and write as MP3
        import av  # noqa: PLC0415

        from reflector.processors import AudioFileWriterProcessor  # noqa: PLC0415

        duration_ms_container = [0.0]

        async def capture_duration(d):
            duration_ms_container[0] = d

        mp3_writer = AudioFileWriterProcessor(
            path=transcript.audio_mp3_filename,
            on_duration=capture_duration,
        )
        input_container = av.open(str(audio_file))
        for frame in input_container.decode(audio=0):
            await mp3_writer.push(frame)
        await mp3_writer.flush()
        input_container.close()

        duration_ms = duration_ms_container[0]
        audio_path = str(transcript.audio_mp3_filename)

        # Persist duration to database and broadcast to websocket clients
        from reflector.db.transcripts import TranscriptDuration  # noqa: PLC0415
        from reflector.db.transcripts import transcripts_controller as tc

        await tc.update(transcript, {"duration": duration_ms})
        await append_event_and_broadcast(
            input.transcript_id,
            transcript,
            "DURATION",
            TranscriptDuration(duration=duration_ms),
            logger=logger,
        )

    ctx.log(f"extract_audio complete: {audio_path}, duration={duration_ms}ms")
    return ExtractAudioResult(audio_path=audio_path, duration_ms=duration_ms)


@file_pipeline.task(
    parents=[extract_audio],
    execution_timeout=timedelta(seconds=TIMEOUT_MEDIUM),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=10,
)
@with_error_handling(TaskName.UPLOAD_AUDIO)
async def upload_audio(input: FilePipelineInput, ctx: Context) -> UploadAudioResult:
    """Upload audio to S3/storage, return audio_url."""
    ctx.log(f"upload_audio: starting for transcript_id={input.transcript_id}")

    extract_result = ctx.task_output(extract_audio)
    audio_path = extract_result.audio_path

    from reflector.storage import get_transcripts_storage  # noqa: PLC0415

    storage = get_transcripts_storage()
    if not storage:
        raise ValueError(
            "Storage backend required for file processing. "
            "Configure TRANSCRIPT_STORAGE_* settings."
        )

    with open(audio_path, "rb") as f:
        audio_data = f.read()

    storage_path = f"file_pipeline/{input.transcript_id}/audio.mp3"
    await storage.put_file(storage_path, audio_data)
    audio_url = await storage.get_file_url(storage_path)

    ctx.log(f"upload_audio complete: {audio_url}")
    return UploadAudioResult(audio_url=audio_url, audio_path=audio_path)


@file_pipeline.task(
    parents=[upload_audio],
    execution_timeout=timedelta(seconds=TIMEOUT_HEAVY),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=30,
)
@with_error_handling(TaskName.TRANSCRIBE)
async def transcribe(input: FilePipelineInput, ctx: Context) -> TranscribeResult:
    """Transcribe the audio file using the configured backend."""
    ctx.log(f"transcribe: starting for transcript_id={input.transcript_id}")

    upload_result = ctx.task_output(upload_audio)
    audio_url = upload_result.audio_url

    async with fresh_db_connection():
        from reflector.db.transcripts import transcripts_controller  # noqa: PLC0415

        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if not transcript:
            raise ValueError(f"Transcript {input.transcript_id} not found")
        source_language = transcript.source_language

    from reflector.pipelines.transcription_helpers import (  # noqa: PLC0415
        transcribe_file_with_processor,
    )

    result = await transcribe_file_with_processor(audio_url, source_language)

    ctx.log(f"transcribe complete: {len(result.words)} words")
    return TranscribeResult(
        words=[w.model_dump() for w in result.words],
        translation=result.translation,
    )


@file_pipeline.task(
    parents=[upload_audio],
    execution_timeout=timedelta(seconds=TIMEOUT_HEAVY),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=30,
)
@with_error_handling(TaskName.DIARIZE)
async def diarize(input: FilePipelineInput, ctx: Context) -> DiarizeResult:
    """Diarize the audio file (speaker identification)."""
    ctx.log(f"diarize: starting for transcript_id={input.transcript_id}")

    if not settings.DIARIZATION_BACKEND:
        ctx.log("diarize: diarization disabled, skipping")
        return DiarizeResult(diarization=None)

    upload_result = ctx.task_output(upload_audio)
    audio_url = upload_result.audio_url

    from reflector.processors.file_diarization import (  # noqa: PLC0415
        FileDiarizationInput,
    )
    from reflector.processors.file_diarization_auto import (  # noqa: PLC0415
        FileDiarizationAutoProcessor,
    )

    processor = FileDiarizationAutoProcessor()
    input_data = FileDiarizationInput(audio_url=audio_url)

    result = None

    async def capture_result(diarization_output):
        nonlocal result
        result = diarization_output.diarization

    try:
        processor.on(capture_result)
        await processor.push(input_data)
        await processor.flush()
    except Exception as e:
        logger.error(f"Diarization failed: {e}")
        return DiarizeResult(diarization=None)

    ctx.log(f"diarize complete: {len(result) if result else 0} segments")
    return DiarizeResult(diarization=list(result) if result else None)


@file_pipeline.task(
    parents=[upload_audio],
    execution_timeout=timedelta(seconds=TIMEOUT_MEDIUM),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=10,
)
@with_error_handling(TaskName.GENERATE_WAVEFORM)
async def generate_waveform(input: FilePipelineInput, ctx: Context) -> WaveformResult:
    """Generate audio waveform visualization."""
    ctx.log(f"generate_waveform: starting for transcript_id={input.transcript_id}")

    upload_result = ctx.task_output(upload_audio)
    audio_path = upload_result.audio_path

    from reflector.db.transcripts import (  # noqa: PLC0415
        TranscriptWaveform,
        transcripts_controller,
    )

    waveform = get_audio_waveform(
        path=Path(audio_path), segments_count=WAVEFORM_SEGMENTS
    )

    async with fresh_db_connection():
        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if transcript:
            transcript.data_path.mkdir(parents=True, exist_ok=True)
            with open(transcript.audio_waveform_filename, "w") as f:
                json.dump(waveform, f)

            waveform_data = TranscriptWaveform(waveform=waveform)
            await append_event_and_broadcast(
                input.transcript_id,
                transcript,
                "WAVEFORM",
                waveform_data,
                logger=logger,
            )

    ctx.log("generate_waveform complete")
    return WaveformResult(waveform_generated=True)


@file_pipeline.task(
    parents=[transcribe, diarize, generate_waveform],
    execution_timeout=timedelta(seconds=TIMEOUT_MEDIUM),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=10,
)
@with_error_handling(TaskName.ASSEMBLE_TRANSCRIPT)
async def assemble_transcript(
    input: FilePipelineInput, ctx: Context
) -> AssembleTranscriptResult:
    """Merge transcription + diarization results."""
    ctx.log(f"assemble_transcript: starting for transcript_id={input.transcript_id}")

    transcribe_result = ctx.task_output(transcribe)
    diarize_result = ctx.task_output(diarize)

    from reflector.processors.transcript_diarization_assembler import (  # noqa: PLC0415
        TranscriptDiarizationAssemblerInput,
        TranscriptDiarizationAssemblerProcessor,
    )
    from reflector.processors.types import (  # noqa: PLC0415
        DiarizationSegment,
        Word,
    )
    from reflector.processors.types import (  # noqa: PLC0415
        Transcript as TranscriptType,
    )

    words = [Word(**w) for w in transcribe_result.words]
    transcript_data = TranscriptType(
        words=words, translation=transcribe_result.translation
    )

    diarization = None
    if diarize_result.diarization:
        diarization = [DiarizationSegment(**s) for s in diarize_result.diarization]

    processor = TranscriptDiarizationAssemblerProcessor()
    assembler_input = TranscriptDiarizationAssemblerInput(
        transcript=transcript_data, diarization=diarization or []
    )

    diarized_transcript = None

    async def capture_result(transcript):
        nonlocal diarized_transcript
        diarized_transcript = transcript

    processor.on(capture_result)
    await processor.push(assembler_input)
    await processor.flush()

    if not diarized_transcript:
        raise ValueError("No diarized transcript captured")

    # Save the assembled transcript events to the database
    async with fresh_db_connection():
        from reflector.db.transcripts import (  # noqa: PLC0415
            TranscriptText,
            transcripts_controller,
        )

        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if transcript:
            assembled_text = diarized_transcript.text if diarized_transcript else ""
            assembled_translation = (
                diarized_transcript.translation if diarized_transcript else None
            )
            await append_event_and_broadcast(
                input.transcript_id,
                transcript,
                "TRANSCRIPT",
                TranscriptText(text=assembled_text, translation=assembled_translation),
                logger=logger,
            )

    ctx.log("assemble_transcript complete")
    return AssembleTranscriptResult(assembled=True)


@file_pipeline.task(
    parents=[assemble_transcript],
    execution_timeout=timedelta(seconds=TIMEOUT_HEAVY),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=30,
)
@with_error_handling(TaskName.DETECT_TOPICS)
async def detect_topics(input: FilePipelineInput, ctx: Context) -> TopicsResult:
    """Detect topics from the assembled transcript."""
    ctx.log(f"detect_topics: starting for transcript_id={input.transcript_id}")

    # Re-read the transcript to get the diarized words
    transcribe_result = ctx.task_output(transcribe)
    diarize_result = ctx.task_output(diarize)

    from reflector.db.transcripts import (  # noqa: PLC0415
        TranscriptTopic,
        transcripts_controller,
    )
    from reflector.processors.transcript_diarization_assembler import (  # noqa: PLC0415
        TranscriptDiarizationAssemblerInput,
        TranscriptDiarizationAssemblerProcessor,
    )
    from reflector.processors.types import (  # noqa: PLC0415
        DiarizationSegment,
        Word,
    )
    from reflector.processors.types import (  # noqa: PLC0415
        Transcript as TranscriptType,
    )

    words = [Word(**w) for w in transcribe_result.words]
    transcript_data = TranscriptType(
        words=words, translation=transcribe_result.translation
    )

    diarization = None
    if diarize_result.diarization:
        diarization = [DiarizationSegment(**s) for s in diarize_result.diarization]

    # Re-assemble to get the diarized transcript for topic detection
    processor = TranscriptDiarizationAssemblerProcessor()
    assembler_input = TranscriptDiarizationAssemblerInput(
        transcript=transcript_data, diarization=diarization or []
    )

    diarized_transcript = None

    async def capture_result(transcript):
        nonlocal diarized_transcript
        diarized_transcript = transcript

    processor.on(capture_result)
    await processor.push(assembler_input)
    await processor.flush()

    if not diarized_transcript:
        raise ValueError("No diarized transcript for topic detection")

    async with fresh_db_connection():
        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if not transcript:
            raise ValueError(f"Transcript {input.transcript_id} not found")
        target_language = transcript.target_language

        empty_pipeline = topic_processing.EmptyPipeline(logger=logger)

        async def on_topic_callback(data):
            topic = TranscriptTopic(
                title=data.title,
                summary=data.summary,
                timestamp=data.timestamp,
                transcript=data.transcript.text
                if hasattr(data.transcript, "text")
                else "",
                words=data.transcript.words
                if hasattr(data.transcript, "words")
                else [],
            )
            await transcripts_controller.upsert_topic(transcript, topic)
            await append_event_and_broadcast(
                input.transcript_id, transcript, "TOPIC", topic, logger=logger
            )

        topics = await topic_processing.detect_topics(
            diarized_transcript,
            target_language,
            on_topic_callback=on_topic_callback,
            empty_pipeline=empty_pipeline,
        )

    ctx.log(f"detect_topics complete: {len(topics)} topics")
    return TopicsResult(topics=topics)


@file_pipeline.task(
    parents=[detect_topics],
    execution_timeout=timedelta(seconds=TIMEOUT_TITLE),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=15,
)
@with_error_handling(TaskName.GENERATE_TITLE)
async def generate_title(input: FilePipelineInput, ctx: Context) -> TitleResult:
    """Generate meeting title using LLM."""
    ctx.log(f"generate_title: starting for transcript_id={input.transcript_id}")

    topics_result = ctx.task_output(detect_topics)
    topics = topics_result.topics

    from reflector.db.transcripts import (  # noqa: PLC0415
        TranscriptFinalTitle,
        transcripts_controller,
    )

    empty_pipeline = topic_processing.EmptyPipeline(logger=logger)
    title_result = None

    async with fresh_db_connection():
        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if not transcript:
            raise ValueError(f"Transcript {input.transcript_id} not found")

        async def on_title_callback(data):
            nonlocal title_result
            title_result = data.title
            final_title = TranscriptFinalTitle(title=data.title)
            if not transcript.title:
                await transcripts_controller.update(
                    transcript, {"title": final_title.title}
                )
            await append_event_and_broadcast(
                input.transcript_id,
                transcript,
                "FINAL_TITLE",
                final_title,
                logger=logger,
            )

        await topic_processing.generate_title(
            topics,
            on_title_callback=on_title_callback,
            empty_pipeline=empty_pipeline,
            logger=logger,
        )

    ctx.log(f"generate_title complete: '{title_result}'")
    return TitleResult(title=title_result)


@file_pipeline.task(
    parents=[detect_topics],
    execution_timeout=timedelta(seconds=TIMEOUT_HEAVY),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=30,
)
@with_error_handling(TaskName.GENERATE_SUMMARIES)
async def generate_summaries(input: FilePipelineInput, ctx: Context) -> SummariesResult:
    """Generate long/short summaries and action items."""
    ctx.log(f"generate_summaries: starting for transcript_id={input.transcript_id}")

    topics_result = ctx.task_output(detect_topics)
    topics = topics_result.topics

    from reflector.db.transcripts import (  # noqa: PLC0415
        TranscriptActionItems,
        TranscriptFinalLongSummary,
        TranscriptFinalShortSummary,
        transcripts_controller,
    )

    empty_pipeline = topic_processing.EmptyPipeline(logger=logger)

    async with fresh_db_connection():
        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if not transcript:
            raise ValueError(f"Transcript {input.transcript_id} not found")

        async def on_long_summary_callback(data):
            final_long = TranscriptFinalLongSummary(long_summary=data.long_summary)
            await transcripts_controller.update(
                transcript, {"long_summary": final_long.long_summary}
            )
            await append_event_and_broadcast(
                input.transcript_id,
                transcript,
                "FINAL_LONG_SUMMARY",
                final_long,
                logger=logger,
            )

        async def on_short_summary_callback(data):
            final_short = TranscriptFinalShortSummary(short_summary=data.short_summary)
            await transcripts_controller.update(
                transcript, {"short_summary": final_short.short_summary}
            )
            await append_event_and_broadcast(
                input.transcript_id,
                transcript,
                "FINAL_SHORT_SUMMARY",
                final_short,
                logger=logger,
            )

        async def on_action_items_callback(data):
            action_items = TranscriptActionItems(action_items=data.action_items)
            await transcripts_controller.update(
                transcript, {"action_items": action_items.action_items}
            )
            await append_event_and_broadcast(
                input.transcript_id,
                transcript,
                "ACTION_ITEMS",
                action_items,
                logger=logger,
            )

        await topic_processing.generate_summaries(
            topics,
            transcript,
            on_long_summary_callback=on_long_summary_callback,
            on_short_summary_callback=on_short_summary_callback,
            on_action_items_callback=on_action_items_callback,
            empty_pipeline=empty_pipeline,
            logger=logger,
        )

    ctx.log("generate_summaries complete")
    return SummariesResult(generated=True)


@file_pipeline.task(
    parents=[generate_title, generate_summaries],
    execution_timeout=timedelta(seconds=TIMEOUT_SHORT),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=5,
)
@with_error_handling(TaskName.FINALIZE)
async def finalize(input: FilePipelineInput, ctx: Context) -> FinalizeResult:
    """Set transcript status to 'ended' and broadcast."""
    ctx.log("finalize: setting status to 'ended'")

    async with fresh_db_connection():
        await set_status_and_broadcast(input.transcript_id, "ended", logger=logger)

    ctx.log("finalize complete")
    return FinalizeResult(status="COMPLETED")


@file_pipeline.task(
    parents=[finalize],
    execution_timeout=timedelta(seconds=TIMEOUT_SHORT),
    retries=3,
    backoff_factor=2.0,
    backoff_max_seconds=10,
)
@with_error_handling(TaskName.CLEANUP_CONSENT, set_error_status=False)
async def cleanup_consent(input: FilePipelineInput, ctx: Context) -> ConsentResult:
    """Check consent and delete audio files if any participant denied."""
    ctx.log(f"cleanup_consent: transcript_id={input.transcript_id}")

    async with fresh_db_connection():
        from reflector.db.meetings import (  # noqa: PLC0415
            meeting_consent_controller,
            meetings_controller,
        )
        from reflector.db.recordings import recordings_controller  # noqa: PLC0415
        from reflector.db.transcripts import transcripts_controller  # noqa: PLC0415
        from reflector.storage import get_transcripts_storage  # noqa: PLC0415

        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if not transcript:
            ctx.log("cleanup_consent: transcript not found")
            return ConsentResult()

        consent_denied = False
        recording = None
        if transcript.recording_id:
            recording = await recordings_controller.get_by_id(transcript.recording_id)
            if recording and recording.meeting_id:
                meeting = await meetings_controller.get_by_id(recording.meeting_id)
                if meeting:
                    consent_denied = await meeting_consent_controller.has_any_denial(
                        meeting.id
                    )

        if not consent_denied:
            ctx.log("cleanup_consent: consent approved, keeping all files")
            return ConsentResult()

        ctx.log("cleanup_consent: consent denied, deleting audio files")

        deletion_errors = []
        if recording and recording.bucket_name:
            keys_to_delete = []
            if recording.track_keys:
                keys_to_delete = recording.track_keys
            elif recording.object_key:
                keys_to_delete = [recording.object_key]

            master_storage = get_transcripts_storage()
            for key in keys_to_delete:
                try:
                    await master_storage.delete_file(key, bucket=recording.bucket_name)
                    ctx.log(f"Deleted recording file: {recording.bucket_name}/{key}")
                except Exception as e:
                    error_msg = f"Failed to delete {key}: {e}"
                    logger.error(error_msg, exc_info=True)
                    deletion_errors.append(error_msg)

        if transcript.audio_location == "storage":
            storage = get_transcripts_storage()
            try:
                await storage.delete_file(transcript.storage_audio_path)
                ctx.log(f"Deleted processed audio: {transcript.storage_audio_path}")
            except Exception as e:
                error_msg = f"Failed to delete processed audio: {e}"
                logger.error(error_msg, exc_info=True)
                deletion_errors.append(error_msg)

        try:
            if (
                hasattr(transcript, "audio_mp3_filename")
                and transcript.audio_mp3_filename
            ):
                transcript.audio_mp3_filename.unlink(missing_ok=True)
            if (
                hasattr(transcript, "audio_wav_filename")
                and transcript.audio_wav_filename
            ):
                transcript.audio_wav_filename.unlink(missing_ok=True)
        except Exception as e:
            error_msg = f"Failed to delete local audio files: {e}"
            logger.error(error_msg, exc_info=True)
            deletion_errors.append(error_msg)

        if deletion_errors:
            logger.warning(
                "[Hatchet] cleanup_consent completed with errors",
                transcript_id=input.transcript_id,
                error_count=len(deletion_errors),
            )
        else:
            await transcripts_controller.update(transcript, {"audio_deleted": True})
            ctx.log("cleanup_consent: all audio deleted successfully")

    return ConsentResult()


@file_pipeline.task(
    parents=[cleanup_consent],
    execution_timeout=timedelta(seconds=TIMEOUT_SHORT),
    retries=5,
    backoff_factor=2.0,
    backoff_max_seconds=15,
)
@with_error_handling(TaskName.POST_ZULIP, set_error_status=False)
async def post_zulip(input: FilePipelineInput, ctx: Context) -> ZulipResult:
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


@file_pipeline.task(
    parents=[cleanup_consent],
    execution_timeout=timedelta(seconds=TIMEOUT_MEDIUM),
    retries=5,
    backoff_factor=2.0,
    backoff_max_seconds=15,
)
@with_error_handling(TaskName.SEND_WEBHOOK, set_error_status=False)
async def send_webhook(input: FilePipelineInput, ctx: Context) -> WebhookResult:
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


@file_pipeline.task(
    parents=[cleanup_consent],
    execution_timeout=timedelta(seconds=TIMEOUT_SHORT),
    retries=5,
    backoff_factor=2.0,
    backoff_max_seconds=15,
)
@with_error_handling(TaskName.SEND_EMAIL, set_error_status=False)
async def send_email(input: FilePipelineInput, ctx: Context) -> EmailResult:
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

        # Try transcript.meeting_id first, then fall back to recording.meeting_id
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


async def on_workflow_failure(input: FilePipelineInput, ctx: Context) -> None:
    """Set transcript status to 'error' only if not already 'ended'."""
    async with fresh_db_connection():
        from reflector.db.transcripts import transcripts_controller  # noqa: PLC0415

        transcript = await transcripts_controller.get_by_id(input.transcript_id)
        if transcript and transcript.status == "ended":
            logger.info(
                "[Hatchet] FilePipeline on_workflow_failure: transcript already ended, skipping error status",
                transcript_id=input.transcript_id,
            )
            ctx.log(
                "on_workflow_failure: transcript already ended, skipping error status"
            )
            return
    await set_workflow_error_status(input.transcript_id)


@file_pipeline.on_failure_task()
async def _register_on_workflow_failure(input: FilePipelineInput, ctx: Context) -> None:
    await on_workflow_failure(input, ctx)
