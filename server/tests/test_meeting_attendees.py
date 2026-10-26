import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import sqlalchemy as sa

from reflector.db import get_database
from reflector.db.daily_participant_sessions import (
    DailyParticipantSession,
    daily_participant_sessions_controller,
)
from reflector.db.meeting_attendees import (
    meeting_attendees,
    meeting_attendees_controller,
)
from reflector.db.meetings import (
    MeetingConsent,
    meeting_consent_controller,
    meetings_controller,
)
from reflector.db.rooms import rooms_controller
from reflector.db.transcripts import (
    SourceKind,
    TranscriptParticipant,
    transcripts_controller,
)


async def create_room(name="attendee-room", user_id="owner", is_shared=False):
    return await rooms_controller.add(
        name=name,
        user_id=user_id,
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=is_shared,
        webhook_url="",
        webhook_secret="",
    )


async def create_meeting(room, meeting_id="meeting-1"):
    now = datetime.now(timezone.utc)
    return await meetings_controller.create(
        id=meeting_id,
        room_name=f"{room.name}-{meeting_id}",
        room_url="https://example.com/room",
        host_room_url="https://example.com/room?host",
        start_date=now - timedelta(minutes=5),
        end_date=now + timedelta(hours=1),
        room=room,
    )


async def count_rows(meeting_id: str) -> int:
    rows = await get_database().fetch_all(
        meeting_attendees.select().where(meeting_attendees.c.meeting_id == meeting_id)
    )
    return len(rows)


@pytest.mark.asyncio
async def test_add_is_idempotent():
    room = await create_room()
    meeting = await create_meeting(room)

    await meeting_attendees_controller.add(meeting.id, "user-b")
    await meeting_attendees_controller.add(meeting.id, "user-b")

    assert await count_rows(meeting.id) == 1


@pytest.mark.asyncio
async def test_is_attendee():
    room = await create_room()
    meeting = await create_meeting(room)
    await meeting_attendees_controller.add(meeting.id, "user-b")

    assert await meeting_attendees_controller.is_attendee(meeting.id, "user-b")
    assert not await meeting_attendees_controller.is_attendee(meeting.id, "user-c")


def load_backfill_sql() -> str:
    path = (
        Path(__file__).parent.parent
        / "migrations/versions/6fd3bc2d4207_add_meeting_attendee.py"
    )
    spec = importlib.util.spec_from_file_location("attendee_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BACKFILL_SQL


async def attendee_pairs() -> set[tuple[str, str]]:
    rows = await get_database().fetch_all(meeting_attendees.select())
    return {(row["meeting_id"], row["user_id"]) for row in rows}


async def add_transcript_with_participants(meeting_id, participants):
    transcript = await transcripts_controller.add(
        name=f"t-{meeting_id}", source_kind=SourceKind.ROOM, meeting_id=meeting_id
    )
    await transcripts_controller.update(
        transcript, {"participants": [p.model_dump() for p in participants]}
    )


@pytest.mark.asyncio
async def test_backfill_from_existing_data():
    room = await create_room()
    m1 = await create_meeting(room, "m1")
    m2 = await create_meeting(room, "m2")
    m3 = await create_meeting(room, "m3")
    now = datetime.now(timezone.utc)

    for session in [
        ("s1", m1.id, "user-daily", "sess-1"),
        ("s2", m1.id, "user-daily", "sess-2"),
        ("s3", m1.id, None, "sess-3"),
        ("s4", m1.id, "sess-4", "sess-4"),
    ]:
        await daily_participant_sessions_controller.upsert_joined(
            DailyParticipantSession(
                id=session[0],
                meeting_id=session[1],
                room_id=room.id,
                session_id=session[3],
                user_id=session[2],
                user_name="name",
                joined_at=now,
            )
        )

    await add_transcript_with_participants(
        m2.id,
        [
            TranscriptParticipant(speaker=0, name="A", user_id="user-speaker"),
            TranscriptParticipant(speaker=1, name="B", user_id=None),
            TranscriptParticipant(speaker=2, name="C", user_id="user-daily"),
        ],
    )
    await add_transcript_with_participants(
        "gone", [TranscriptParticipant(speaker=0, name="X", user_id="user-x")]
    )
    await transcripts_controller.add(
        name="t-none", source_kind=SourceKind.ROOM, meeting_id=m3.id
    )

    await meeting_consent_controller.upsert(
        MeetingConsent(
            meeting_id=m3.id,
            user_id="user-consent",
            consent_given=True,
            consent_timestamp=now,
        )
    )
    await meeting_consent_controller.upsert(
        MeetingConsent(meeting_id=m3.id, consent_given=False, consent_timestamp=now)
    )
    await meeting_attendees_controller.add(m3.id, "user-consent")

    sql = load_backfill_sql()
    await get_database().execute(sa.text(sql))
    await get_database().execute(sa.text(sql))

    assert await attendee_pairs() == {
        (m1.id, "user-daily"),
        (m2.id, "user-speaker"),
        (m2.id, "user-daily"),
        (m3.id, "user-consent"),
    }
