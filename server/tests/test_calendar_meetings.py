"""Meetings follow their calendar events.

Created shortly before the start, created late when the event was seen late,
moved when the event is rescheduled, never blocked by an ended meeting, and
created by the sync itself right after the event is stored.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from icalendar import Calendar, Event

from reflector.db.calendar_events import CalendarEvent, calendar_events_controller
from reflector.db.meetings import meetings_controller
from reflector.db.rooms import rooms_controller
from reflector.services.calendar_meetings import (
    MEETING_DURATION,
    sync_meeting_for_event,
)
from reflector.services.ics_sync import ics_sync_service
from reflector.settings import settings
from reflector.video_platforms.models import MeetingData

CLIENT_PATH = "reflector.services.calendar_meetings.create_platform_client"


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
        ics_url="https://calendar.example.com/room.ics",
        ics_enabled=True,
        platform="daily",
    )


def _client(meeting_id: str = "meeting-1"):
    client = MagicMock()
    client.create_meeting = AsyncMock(
        return_value=MeetingData(
            meeting_id=meeting_id,
            room_name=f"room-{meeting_id}",
            room_url=f"https://daily.example/{meeting_id}",
            host_room_url=f"https://daily.example/{meeting_id}",
            platform="daily",
            extra_data={},
        )
    )
    client.upload_logo = AsyncMock(return_value=True)
    client.extend_meeting_expiration = AsyncMock(return_value=True)
    return client


async def _event(room, start, end, uid="evt-1", title="Weekly sync"):
    return await calendar_events_controller.upsert(
        CalendarEvent(
            room_id=room.id,
            ics_uid=uid,
            title=title,
            start_time=start,
            end_time=end,
        )
    )


@pytest.mark.asyncio
async def test_creates_meeting_inside_lookahead():
    room = await _room("cm-lookahead")
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=5)
    event = await _event(room, start, start + timedelta(minutes=30))

    with patch(CLIENT_PATH, return_value=_client()):
        meeting = await sync_meeting_for_event(event, room, now)

    assert meeting is not None
    stored = await meetings_controller.get_by_id(meeting.id)
    assert stored.calendar_event_id == event.id
    assert stored.start_date == start
    assert stored.end_date == start + MEETING_DURATION
    assert stored.calendar_metadata["title"] == "Weekly sync"


@pytest.mark.asyncio
async def test_no_meeting_before_lookahead():
    room = await _room("cm-early")
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=30)
    event = await _event(room, start, start + timedelta(minutes=30))

    client = _client()
    with patch(CLIENT_PATH, return_value=client):
        assert await sync_meeting_for_event(event, room, now) is None

    client.create_meeting.assert_not_awaited()
    assert await meetings_controller.get_by_calendar_event(event.id, room) is None


@pytest.mark.asyncio
async def test_creates_meeting_for_event_seen_late():
    """Regression: an event first seen 20 minutes after its start used to be
    skipped forever (6-minute cutoff). It is still running, so it gets a
    meeting."""
    room = await _room("cm-late")
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=20)
    event = await _event(room, start, now + timedelta(minutes=10))

    with patch(CLIENT_PATH, return_value=_client()):
        meeting = await sync_meeting_for_event(event, room, now)

    assert meeting is not None
    assert meeting.start_date == start
    assert meeting.end_date == start + MEETING_DURATION


@pytest.mark.asyncio
async def test_no_meeting_for_finished_or_deleted_event():
    room = await _room("cm-finished")
    now = datetime.now(timezone.utc)
    finished = await _event(
        room, now - timedelta(hours=2), now - timedelta(hours=1), uid="done"
    )
    deleted = await _event(
        room, now + timedelta(minutes=1), now + timedelta(minutes=30), uid="gone"
    )
    await calendar_events_controller.soft_delete_missing(room.id, ["done"])
    deleted = await calendar_events_controller.get_by_id(deleted.id)
    assert deleted.is_deleted

    client = _client()
    with patch(CLIENT_PATH, return_value=client):
        assert await sync_meeting_for_event(finished, room, now) is None
        assert await sync_meeting_for_event(deleted, room, now) is None

    client.create_meeting.assert_not_awaited()


@pytest.mark.asyncio
async def test_ended_meeting_does_not_block_a_new_one():
    """Regression: once the first meeting was ended (early visitor left, owner
    clicked cancel), the event never got another one."""
    room = await _room("cm-ended")
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=2)
    event = await _event(room, start, start + timedelta(minutes=30))

    with patch(CLIENT_PATH, return_value=_client("first")):
        first = await sync_meeting_for_event(event, room, now)
    await meetings_controller.update_meeting(first.id, is_active=False)

    with patch(CLIENT_PATH, return_value=_client("second")):
        second = await sync_meeting_for_event(event, room, now)

    assert second is not None and second.id != first.id
    active = await meetings_controller.get_active_by_calendar_event(room, event.id, now)
    assert active.id == second.id
    # the lookup used by callers prefers the active meeting
    preferred = await meetings_controller.get_by_calendar_event(event.id, room)
    assert preferred.id == second.id


@pytest.mark.asyncio
async def test_existing_active_meeting_is_reused():
    room = await _room("cm-reuse")
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=2)
    event = await _event(room, start, start + timedelta(minutes=30))

    client = _client()
    with patch(CLIENT_PATH, return_value=client):
        first = await sync_meeting_for_event(event, room, now)
        again = await sync_meeting_for_event(event, room, now)

    assert again.id == first.id
    client.create_meeting.assert_awaited_once()


@pytest.mark.asyncio
async def test_rescheduled_event_moves_its_meeting():
    """Regression: moving the event in the calendar left the meeting at the old
    time, and the new slot had no meeting."""
    room = await _room("cm-move")
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=3)
    event = await _event(room, start, start + timedelta(minutes=30))

    client = _client()
    with patch(CLIENT_PATH, return_value=client):
        meeting = await sync_meeting_for_event(event, room, now)

    new_start = now + timedelta(hours=1)
    moved = await calendar_events_controller.upsert(
        CalendarEvent(
            room_id=room.id,
            ics_uid="evt-1",
            title="Weekly sync (moved)",
            start_time=new_start,
            end_time=new_start + timedelta(minutes=30),
        )
    )

    with patch(CLIENT_PATH, return_value=client):
        updated = await sync_meeting_for_event(moved, room, now)

    assert updated.id == meeting.id
    client.create_meeting.assert_awaited_once()
    stored = await meetings_controller.get_by_id(meeting.id)
    assert stored.start_date == new_start
    assert stored.end_date == new_start + MEETING_DURATION
    assert stored.calendar_metadata["title"] == "Weekly sync (moved)"
    client.extend_meeting_expiration.assert_awaited_once()
    room_name, end_date = client.extend_meeting_expiration.call_args.args
    assert room_name == meeting.room_name
    assert end_date == new_start + MEETING_DURATION


@pytest.mark.asyncio
async def test_platform_failure_is_logged_not_raised():
    room = await _room("cm-fail")
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=1)
    event = await _event(room, start, start + timedelta(minutes=30))

    client = _client()
    client.create_meeting = AsyncMock(side_effect=Exception("daily down"))
    with patch(CLIENT_PATH, return_value=client):
        assert await sync_meeting_for_event(event, room, now) is None

    assert await meetings_controller.get_by_calendar_event(event.id, room) is None


@pytest.mark.asyncio
async def test_sync_creates_meeting_right_after_storing_the_event():
    """Regression: an event added a couple of minutes before its start had to
    wait for the next create tick; with a throttled beat that was minutes, and
    past the old cutoff it was never created at all."""
    room = await _room("cm-sync")
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=2)

    cal = Calendar()
    ev = Event()
    ev.add("uid", "sync-evt")
    ev.add("summary", "Quick call")
    ev.add("location", f"{settings.UI_BASE_URL}/{room.name}")
    ev.add("dtstart", start)
    ev.add("dtend", start + timedelta(minutes=30))
    cal.add_component(ev)

    client = _client("from-sync")
    with (
        patch(
            "reflector.services.ics_sync.ICSFetchService.fetch_ics",
            new_callable=AsyncMock,
            return_value=cal.to_ical().decode("utf-8"),
        ),
        patch(CLIENT_PATH, return_value=client),
    ):
        result = await ics_sync_service.sync_room_calendar(room)

    assert result["status"] == "success"
    assert result["events_created"] == 1
    event = await calendar_events_controller.get_by_ics_uid(room.id, "sync-evt")
    meeting = await meetings_controller.get_by_calendar_event(event.id, room)
    assert meeting is not None
    assert meeting.is_active
    client.create_meeting.assert_awaited_once()
