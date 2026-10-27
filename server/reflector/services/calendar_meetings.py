"""Keep meetings in step with their calendar events.

A calendar event gets one active meeting. It is created shortly before the
event starts (or as soon as Reflector learns about an event that is already
running), moved when the event is rescheduled, and replaced when the previous
meeting was ended before the event was over.

Called from two places:
- the ICS sync, right after it stores events, so a freshly added event gets its
  meeting without waiting for the next beat tick;
- the periodic `create_upcoming_meetings` task, as a backup.
"""

from datetime import datetime, timedelta, timezone

import structlog

from reflector.db.calendar_events import CalendarEvent
from reflector.db.meetings import Meeting, meetings_controller
from reflector.db.rooms import Room
from reflector.redis_cache import RedisAsyncLock
from reflector.video_platforms.factory import create_platform_client

logger = structlog.get_logger()

# A meeting is created this long before its event starts.
PRECREATE_LOOKAHEAD_MINUTES = 7
PRECREATE_LOOKAHEAD = timedelta(minutes=PRECREATE_LOOKAHEAD_MINUTES)

# Rejoin window of a scheduled meeting, anchored to the event start. Matches
# on-the-fly meetings; the calendar DTEND stays in calendar_event.end_time.
MEETING_DURATION = timedelta(hours=8)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _calendar_metadata(event: CalendarEvent) -> dict:
    return {
        "title": event.title,
        "description": event.description,
        "attendees": event.attendees,
    }


async def sync_meeting_for_event(
    event: CalendarEvent, room: Room, now: datetime | None = None
) -> Meeting | None:
    """Create or move the meeting for `event`. Returns the active meeting, if any.

    - Deleted or finished events: nothing.
    - An active meeting already exists: it is moved to the event's current
      times and metadata when they differ.
    - No active meeting and the event starts within PRECREATE_LOOKAHEAD, or has
      already started: a meeting is created. An ended meeting for the same
      event does not block a new one.

    Platform errors are logged and leave things as they were; the next sync or
    tick retries.
    """
    now = now or datetime.now(timezone.utc)
    if event.is_deleted or _as_utc(event.end_time) <= now:
        return None

    async with RedisAsyncLock(
        f"calendar_event_meeting:{event.id}", timeout=60, skip_if_locked=True
    ) as lock:
        if not lock.acquired:
            logger.debug("Meeting sync already running for event", event_id=event.id)
            return None

        meeting = await meetings_controller.get_active_by_calendar_event(
            room, event.id, now
        )
        if meeting:
            return await _move_if_rescheduled(meeting, event, room, now)

        if _as_utc(event.start_time) > now + PRECREATE_LOOKAHEAD:
            return None

        return await _create_meeting(event, room)


async def _create_meeting(event: CalendarEvent, room: Room) -> Meeting | None:
    log = logger.bind(room_id=room.id, event_id=event.id, event_title=event.title)
    log.info("Pre-creating meeting for calendar event")
    end_date = _as_utc(event.start_time) + MEETING_DURATION
    try:
        client = create_platform_client(room.platform)
        meeting_data = await client.create_meeting(
            room.name, end_date=end_date, room=room
        )
        await client.upload_logo(meeting_data.room_name, "./images/logo.png")
        meeting = await meetings_controller.create(
            id=meeting_data.meeting_id,
            room_name=meeting_data.room_name,
            room_url=meeting_data.room_url,
            host_room_url=meeting_data.host_room_url,
            start_date=event.start_time,
            end_date=end_date,
            room=room,
            calendar_event_id=event.id,
            calendar_metadata=_calendar_metadata(event),
        )
    except Exception as e:
        log.error("Failed to pre-create meeting", error=str(e))
        return None

    log.info("Meeting pre-created successfully", meeting_id=meeting.id)
    return meeting


async def _move_if_rescheduled(
    meeting: Meeting, event: CalendarEvent, room: Room, now: datetime
) -> Meeting:
    """Update a meeting whose event changed times or metadata since creation."""
    changes: dict = {}

    metadata = _calendar_metadata(event)
    if meeting.calendar_metadata != metadata:
        changes["calendar_metadata"] = metadata

    new_start = _as_utc(event.start_time)
    if _as_utc(meeting.start_date) != new_start:
        new_end = new_start + MEETING_DURATION
        # Never shorten a meeting into the past: people may be in it right now.
        if new_end > now:
            changes["start_date"] = new_start
            changes["end_date"] = new_end

    if not changes:
        return meeting

    log = logger.bind(meeting_id=meeting.id, event_id=event.id)
    if "end_date" in changes:
        try:
            client = create_platform_client(room.platform)
            await client.extend_meeting_expiration(
                meeting.room_name, changes["end_date"]
            )
        except Exception as e:
            # The DB is still updated: the join endpoint and the room page
            # follow the DB, and the platform retains its previous expiry.
            log.warning("Failed to move platform meeting expiry", error=str(e))

    await meetings_controller.update_meeting(meeting.id, **changes)
    log.info(
        "Meeting updated from rescheduled calendar event",
        previous_start=meeting.start_date.isoformat(),
        new_start=new_start.isoformat(),
    )
    return meeting.model_copy(update=changes)
