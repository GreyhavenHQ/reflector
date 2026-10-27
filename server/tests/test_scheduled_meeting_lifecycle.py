"""A scheduled meeting is not ended because an early visitor left.

`process_meetings` used to deactivate any meeting that had a session and had
none active. For calendar meetings that rule now waits for the calendar end
plus a grace period.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from reflector.db.calendar_events import CalendarEvent, calendar_events_controller
from reflector.db.meetings import meetings_controller
from reflector.db.rooms import rooms_controller
from reflector.video_platforms.models import SessionData
from reflector.worker import process
from reflector.worker.process import SCHEDULED_MEETING_GRACE


def _process_meetings_fn():
    fn = process.process_meetings
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


process_meetings = _process_meetings_fn()


async def _room(name: str):
    return await rooms_controller.add(
        name=name,
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        platform="daily",
    )


def _platform_client(sessions: list[SessionData]):
    client = MagicMock()
    client.get_room_sessions = AsyncMock(return_value=sessions)
    client.extend_meeting_expiration = AsyncMock(return_value=True)
    return client


def _ended_session(now: datetime):
    """One visitor who came 6 minutes ago and left after a minute."""
    return SessionData(
        session_id="early-visitor",
        started_at=now - timedelta(minutes=6),
        ended_at=now - timedelta(minutes=5),
    )


async def _scheduled_meeting(room, name: str, event_start, event_end):
    event = await calendar_events_controller.upsert(
        CalendarEvent(
            room_id=room.id,
            ics_uid=f"{name}-uid",
            title=name,
            start_time=event_start,
            end_time=event_end,
        )
    )
    meeting = await meetings_controller.create(
        id=f"{name}-meeting",
        room_name=f"{room.name}-{name}",
        room_url=f"https://daily.example/{name}",
        host_room_url=f"https://daily.example/{name}",
        start_date=event_start,
        end_date=event_start + timedelta(hours=8),
        room=room,
        calendar_event_id=event.id,
        calendar_metadata={"title": name},
    )
    return event, meeting


@pytest.mark.asyncio
@patch("reflector.worker.process.create_platform_client")
async def test_scheduled_meeting_survives_an_early_visitor_leaving(mock_client):
    """Prod case: someone opened the pre-created meeting before the start,
    left, and the meeting was ended 30 seconds later."""
    room = await _room("lifecycle-early")
    now = datetime.now(timezone.utc)
    _, meeting = await _scheduled_meeting(
        room, "standup", now + timedelta(minutes=20), now + timedelta(minutes=50)
    )
    mock_client.return_value = _platform_client([_ended_session(now)])

    await process_meetings()

    assert (await meetings_controller.get_by_id(meeting.id)).is_active is True


@pytest.mark.asyncio
@patch("reflector.worker.process.create_platform_client")
async def test_scheduled_meeting_kept_while_the_event_is_running(mock_client):
    """Everybody dropped during the meeting: they can come back until the
    calendar end plus grace."""
    room = await _room("lifecycle-running")
    now = datetime.now(timezone.utc)
    _, meeting = await _scheduled_meeting(
        room, "review", now - timedelta(minutes=20), now + timedelta(minutes=10)
    )
    mock_client.return_value = _platform_client([_ended_session(now)])

    await process_meetings()

    assert (await meetings_controller.get_by_id(meeting.id)).is_active is True


@pytest.mark.asyncio
@patch("reflector.worker.process.create_platform_client")
async def test_scheduled_meeting_ends_after_calendar_end_plus_grace(mock_client):
    room = await _room("lifecycle-over")
    now = datetime.now(timezone.utc)
    event_end = now - SCHEDULED_MEETING_GRACE - timedelta(minutes=1)
    _, meeting = await _scheduled_meeting(
        room, "retro", event_end - timedelta(minutes=30), event_end
    )
    mock_client.return_value = _platform_client([_ended_session(now)])

    await process_meetings()

    assert (await meetings_controller.get_by_id(meeting.id)).is_active is False


@pytest.mark.asyncio
@patch("reflector.worker.process.create_platform_client")
async def test_adhoc_meeting_still_ends_when_everyone_left(mock_client):
    room = await _room("lifecycle-adhoc")
    now = datetime.now(timezone.utc)
    meeting = await meetings_controller.create(
        id="adhoc-meeting",
        room_name=f"{room.name}-adhoc",
        room_url="https://daily.example/adhoc",
        host_room_url="https://daily.example/adhoc",
        start_date=now - timedelta(minutes=30),
        end_date=now + timedelta(hours=7),
        room=room,
    )
    mock_client.return_value = _platform_client([_ended_session(now)])

    await process_meetings()

    assert (await meetings_controller.get_by_id(meeting.id)).is_active is False
