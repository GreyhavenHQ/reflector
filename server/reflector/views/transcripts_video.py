"""
Transcript cloud video endpoint — returns a presigned URL for streaming playback.
"""

from typing import Annotated, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import reflector.auth as auth
from reflector.db.meetings import meetings_controller
from reflector.db.transcripts import transcripts_controller
from reflector.settings import settings
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
    user: Annotated[Optional[auth.UserInfo], Depends(auth.current_user_optional)],
    token: str | None = None,
):
    user_id = user["sub"] if user else None
    if not user_id and token:
        try:
            token_user = await auth.verify_raw_token(token)
        except Exception:
            token_user = None
        if not token_user:
            try:
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
                user_id = payload.get("sub")
            except jwt.PyJWTError:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token",
                )
        else:
            user_id = token_user["sub"]

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
        expires_in=3600,
    )

    return VideoUrlResponse(
        url=url,
        duration=meeting.daily_composed_video_duration,
    )
