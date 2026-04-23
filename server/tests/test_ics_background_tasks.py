from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from icalendar import Calendar, Event

from reflector.db import get_database
from reflector.db.calendar_events import CalendarEvent, calendar_events_controller
from reflector.db.meetings import meetings_controller
from reflector.db.rooms import rooms, rooms_controller
from reflector.services.ics_sync import ics_sync_service
from reflector.video_platforms.models import MeetingData
from reflector.worker.ics_sync import (
    _should_sync,
    create_upcoming_meetings_for_event,
    sync_room_ics,
)


@pytest.mark.asyncio
async def test_sync_room_ics_task():
    room = await rooms_controller.add(
        name="task-test-room",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        ics_url="https://calendar.example.com/task.ics",
        ics_enabled=True,
    )

    cal = Calendar()
    event = Event()
    event.add("uid", "task-event-1")
    event.add("summary", "Task Test Meeting")
    from reflector.settings import settings

    event.add("location", f"{settings.UI_BASE_URL}/{room.name}")
    now = datetime.now(timezone.utc)
    event.add("dtstart", now + timedelta(hours=1))
    event.add("dtend", now + timedelta(hours=2))
    cal.add_component(event)
    ics_content = cal.to_ical().decode("utf-8")

    with patch(
        "reflector.services.ics_sync.ICSFetchService.fetch_ics", new_callable=AsyncMock
    ) as mock_fetch:
        mock_fetch.return_value = ics_content

        # Call the service directly instead of the Celery task to avoid event loop issues
        await ics_sync_service.sync_room_calendar(room)

        events = await calendar_events_controller.get_by_room(room.id)
        assert len(events) == 1
        assert events[0].ics_uid == "task-event-1"


@pytest.mark.asyncio
async def test_sync_room_ics_disabled():
    room = await rooms_controller.add(
        name="disabled-room",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        ics_enabled=False,
    )

    # Test that disabled rooms are skipped by the service
    result = await ics_sync_service.sync_room_calendar(room)

    events = await calendar_events_controller.get_by_room(room.id)
    assert len(events) == 0


@pytest.mark.asyncio
async def test_sync_all_ics_calendars():
    room1 = await rooms_controller.add(
        name="sync-all-1",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        ics_url="https://calendar.example.com/1.ics",
        ics_enabled=True,
    )

    room2 = await rooms_controller.add(
        name="sync-all-2",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        ics_url="https://calendar.example.com/2.ics",
        ics_enabled=True,
    )

    room3 = await rooms_controller.add(
        name="sync-all-3",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        ics_enabled=False,
    )

    with patch("reflector.worker.ics_sync.sync_room_ics.delay") as mock_delay:
        # Directly call the sync_all logic without the Celery wrapper
        query = rooms.select().where(
            rooms.c.ics_enabled == True, rooms.c.ics_url != None
        )
        all_rooms = await get_database().fetch_all(query)

        for room_data in all_rooms:
            room_id = room_data["id"]
            room = await rooms_controller.get_by_id(room_id)
            if room and _should_sync(room):
                sync_room_ics.delay(room_id)

        assert mock_delay.call_count == 2
        called_room_ids = [call.args[0] for call in mock_delay.call_args_list]
        assert room1.id in called_room_ids
        assert room2.id in called_room_ids
        assert room3.id not in called_room_ids


@pytest.mark.asyncio
async def test_should_sync_logic():
    room = MagicMock()

    room.ics_last_sync = None
    assert _should_sync(room) is True

    room.ics_last_sync = datetime.now(timezone.utc) - timedelta(seconds=100)
    room.ics_fetch_interval = 300
    assert _should_sync(room) is False

    room.ics_last_sync = datetime.now(timezone.utc) - timedelta(seconds=400)
    room.ics_fetch_interval = 300
    assert _should_sync(room) is True


@pytest.mark.asyncio
async def test_sync_respects_fetch_interval():
    now = datetime.now(timezone.utc)

    room1 = await rooms_controller.add(
        name="interval-test-1",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        ics_url="https://calendar.example.com/interval.ics",
        ics_enabled=True,
        ics_fetch_interval=300,
    )

    await rooms_controller.update(
        room1,
        {"ics_last_sync": now - timedelta(seconds=100)},
    )

    room2 = await rooms_controller.add(
        name="interval-test-2",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        ics_url="https://calendar.example.com/interval2.ics",
        ics_enabled=True,
        ics_fetch_interval=60,
    )

    await rooms_controller.update(
        room2,
        {"ics_last_sync": now - timedelta(seconds=100)},
    )

    with patch("reflector.worker.ics_sync.sync_room_ics.delay") as mock_delay:
        # Test the sync logic without the Celery wrapper
        query = rooms.select().where(
            rooms.c.ics_enabled == True, rooms.c.ics_url != None
        )
        all_rooms = await get_database().fetch_all(query)

        for room_data in all_rooms:
            room_id = room_data["id"]
            room = await rooms_controller.get_by_id(room_id)
            if room and _should_sync(room):
                sync_room_ics.delay(room_id)

        assert mock_delay.call_count == 1
        assert mock_delay.call_args[0][0] == room2.id


@pytest.mark.asyncio
async def test_create_upcoming_meeting_uses_8h_end_date():
    # ICS-pre-created meetings get an 8h rejoin window anchored to the
    # scheduled start, ignoring the calendar event's DTEND. Regression
    # guard for the "Meeting has ended" bug when participants run over a
    # short scheduled window.
    room = await rooms_controller.add(
        name="ics-8h-room",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        ics_url="https://calendar.example.com/ics-8h.ics",
        ics_enabled=True,
    )

    now = datetime.now(timezone.utc)
    event_start = now + timedelta(minutes=1)
    event_end = event_start + timedelta(minutes=30)

    event = await calendar_events_controller.upsert(
        CalendarEvent(
            room_id=room.id,
            ics_uid="ics-8h-evt",
            title="Short meeting that runs over",
            start_time=event_start,
            end_time=event_end,
        )
    )

    create_window = now - timedelta(minutes=6)

    fake_client = MagicMock()
    fake_client.create_meeting = AsyncMock(
        return_value=MeetingData(
            meeting_id="ics-8h-meeting",
            room_name=room.name,
            room_url="https://daily.example/ics-8h",
            host_room_url="https://daily.example/ics-8h",
            platform=room.platform,
            extra_data={},
        )
    )
    fake_client.upload_logo = AsyncMock(return_value=True)

    with patch(
        "reflector.worker.ics_sync.create_platform_client",
        return_value=fake_client,
    ):
        await create_upcoming_meetings_for_event(event, create_window, room)

    meeting = await meetings_controller.get_by_calendar_event(event.id, room)
    assert meeting is not None
    assert meeting.start_date == event_start
    assert meeting.end_date == event_start + timedelta(hours=8)


@pytest.mark.asyncio
async def test_sync_handles_errors_gracefully():
    room = await rooms_controller.add(
        name="error-task-room",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        ics_url="https://calendar.example.com/error.ics",
        ics_enabled=True,
    )

    with patch(
        "reflector.services.ics_sync.ICSFetchService.fetch_ics", new_callable=AsyncMock
    ) as mock_fetch:
        mock_fetch.side_effect = Exception("Network error")

        # Call the service directly to test error handling
        result = await ics_sync_service.sync_room_calendar(room)
        assert result["status"] == "error"

        events = await calendar_events_controller.get_by_room(room.id)
        assert len(events) == 0
