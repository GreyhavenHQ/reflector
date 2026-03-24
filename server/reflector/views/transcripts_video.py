"""
Transcript cloud video endpoint — returns a presigned URL for streaming playback.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import reflector.auth as auth
from reflector.db.meetings import meetings_controller
from reflector.db.transcripts import transcripts_controller
from reflector.storage import get_source_storage

router = APIRouter()


class VideoUrlResponse(BaseModel):
    url: str
    duration: int | None = None
    content_type: str = "video/mp4"


@router.get(
    "/transcripts/{transcript_id}/video/url",
    operation_id="transcript_get_video_url",
    response_model=VideoUrlResponse,
)
async def transcript_get_video_url(
    transcript_id: str,
    user: Annotated[auth.UserInfo, Depends(auth.current_user)],
):
    user_id = user["sub"]

    transcript = await transcripts_controller.get_by_id_for_http(
        transcript_id, user_id=user_id
    )

    if not transcript.meeting_id:
        raise HTTPException(status_code=404, detail="No video available")

    meeting = await meetings_controller.get_by_id(transcript.meeting_id)
    if not meeting or not meeting.daily_composed_video_s3_key:
        raise HTTPException(status_code=404, detail="No video available")

    source_storage = get_source_storage("daily")
    url = await source_storage.get_file_url(
        meeting.daily_composed_video_s3_key,
        operation="get_object",
        expires_in=900,
        extra_params={
            "ResponseContentDisposition": "inline",
            "ResponseContentType": "video/mp4",
        },
    )

    return VideoUrlResponse(
        url=url,
        duration=meeting.daily_composed_video_duration,
    )
