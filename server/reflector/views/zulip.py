import logging
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import reflector.auth as auth
from reflector.zulip import get_zulip_streams, get_zulip_topics

logger = logging.getLogger(__name__)
router = APIRouter()


class Stream(BaseModel):
    stream_id: int
    name: str


class Topic(BaseModel):
    name: str


@router.get("/zulip/streams")
async def zulip_get_streams(
    user: Annotated[Optional[auth.UserInfo], Depends(auth.current_user_optional)],
) -> list[Stream]:
    """
    Get all Zulip streams. Returns [] if the upstream Zulip API is unreachable
    or the server credentials are invalid — the client treats Zulip as an
    optional integration and renders gracefully without a hard error.
    """
    if not user:
        raise HTTPException(status_code=403, detail="Authentication required")

    try:
        return await get_zulip_streams()
    except (httpx.HTTPStatusError, httpx.RequestError, Exception) as exc:
        logger.warning("zulip get_streams failed, returning []: %s", exc)
        return []


@router.get("/zulip/streams/{stream_id}/topics")
async def zulip_get_topics(
    stream_id: int,
    user: Annotated[Optional[auth.UserInfo], Depends(auth.current_user_optional)],
) -> list[Topic]:
    """
    Get all topics for a specific Zulip stream. Returns [] on upstream failure
    for the same reason as /zulip/streams above.
    """
    if not user:
        raise HTTPException(status_code=403, detail="Authentication required")

    try:
        return await get_zulip_topics(stream_id)
    except (httpx.HTTPStatusError, httpx.RequestError, Exception) as exc:
        logger.warning("zulip get_topics(%s) failed, returning []: %s", stream_id, exc)
        return []
