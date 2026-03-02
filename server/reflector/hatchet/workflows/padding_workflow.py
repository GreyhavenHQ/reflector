"""
Hatchet child workflow: PaddingWorkflow
Handles individual audio track padding via Modal.com backend.
"""

from datetime import timedelta

import av
from hatchet_sdk import Context
from pydantic import BaseModel

from reflector.hatchet.client import HatchetClientManager
from reflector.hatchet.constants import TIMEOUT_AUDIO
from reflector.hatchet.workflows.models import PadTrackResult
from reflector.logger import logger
from reflector.utils.audio_constants import PRESIGNED_URL_EXPIRATION_SECONDS
from reflector.utils.audio_padding import extract_stream_start_time_from_container


class PaddingInput(BaseModel):
    """Input for individual track padding."""

    track_index: int
    s3_key: str
    bucket_name: str
    transcript_id: str
    source_platform: str = "daily"


hatchet = HatchetClientManager.get_client()

padding_workflow = hatchet.workflow(
    name="PaddingWorkflow", input_validator=PaddingInput
)


@padding_workflow.task(execution_timeout=timedelta(seconds=TIMEOUT_AUDIO), retries=3)
async def pad_track(input: PaddingInput, ctx: Context) -> PadTrackResult:
    """Pad audio track with silence based on WebM container start_time."""
    ctx.log(f"pad_track: track {input.track_index}, s3_key={input.s3_key}")
    logger.info(
        "[Hatchet] pad_track",
        track_index=input.track_index,
        s3_key=input.s3_key,
        transcript_id=input.transcript_id,
    )

    try:
        from reflector.storage import (  # noqa: PLC0415
            get_source_storage,
            get_transcripts_storage,
        )

        # Source reads: use platform-specific credentials
        source_storage = get_source_storage(input.source_platform)
        source_url = await source_storage.get_file_url(
            input.s3_key,
            operation="get_object",
            expires_in=PRESIGNED_URL_EXPIRATION_SECONDS,
            bucket=input.bucket_name,
        )

        # Extract start_time to determine if padding needed
        with av.open(source_url) as in_container:
            if in_container.duration:
                try:
                    duration = timedelta(seconds=in_container.duration // 1_000_000)
                    ctx.log(
                        f"pad_track: track {input.track_index}, duration={duration}"
                    )
                except (ValueError, TypeError, OverflowError) as e:
                    ctx.log(
                        f"pad_track: track {input.track_index}, duration error: {str(e)}"
                    )

            start_time_seconds = extract_stream_start_time_from_container(
                in_container, input.track_index, logger=logger
            )

        if start_time_seconds <= 0:
            logger.info(
                f"Track {input.track_index} requires no padding",
                track_index=input.track_index,
            )
            return PadTrackResult(
                padded_key=input.s3_key,
                bucket_name=input.bucket_name,
                size=0,
                track_index=input.track_index,
            )

        storage_path = f"file_pipeline_hatchet/{input.transcript_id}/tracks/padded_{input.track_index}.webm"

        # Output writes: use transcript storage (our own bucket)
        output_storage = get_transcripts_storage()
        output_url = await output_storage.get_file_url(
            storage_path,
            operation="put_object",
            expires_in=PRESIGNED_URL_EXPIRATION_SECONDS,
        )

        from reflector.processors.audio_padding_auto import (  # noqa: PLC0415
            AudioPaddingAutoProcessor,
        )

        processor = AudioPaddingAutoProcessor()
        result = await processor.pad_track(
            track_url=source_url,
            output_url=output_url,
            start_time_seconds=start_time_seconds,
            track_index=input.track_index,
        )
        file_size = result.size

        ctx.log(f"pad_track: padding returned size={file_size}")

        logger.info(
            "[Hatchet] pad_track complete",
            track_index=input.track_index,
            padded_key=storage_path,
        )

        return PadTrackResult(
            padded_key=storage_path,
            bucket_name=None,  # None = use default transcript storage bucket
            size=file_size,
            track_index=input.track_index,
        )

    except Exception as e:
        logger.error(
            "[Hatchet] pad_track failed",
            transcript_id=input.transcript_id,
            track_index=input.track_index,
            error=str(e),
            exc_info=True,
        )
        raise
