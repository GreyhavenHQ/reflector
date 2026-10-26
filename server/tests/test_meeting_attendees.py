import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import sqlalchemy as sa
from conftest import authenticated_client_ctx

from reflector.dailyco_api.responses import (
    RoomPresenceParticipant,
    RoomPresenceResponse,
)
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
from reflector.worker.process import poll_daily_room_presence


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


@pytest.fixture
def platform_client():
    client = MagicMock()
    client.create_meeting_token = AsyncMock(return_value="token")
    client.create_access_token = MagicMock(return_value="token")
    client.close = AsyncMock()
    redis_client = MagicMock()
    redis_client.hset = AsyncMock()
    redis_client.expire = AsyncMock()
    with (
        patch("reflector.views.rooms.create_platform_client", return_value=client),
        patch(
            "reflector.views.rooms.get_async_redis_client",
            AsyncMock(return_value=redis_client),
        ),
    ):
        yield client


async def create_platform_meeting(platform: str):
    room = await create_room(name=f"room-{platform}")
    await rooms_controller.update(room, {"platform": platform})
    room = await rooms_controller.get_by_id(room.id)
    return room, await create_meeting(room, f"meeting-{platform}")


@pytest.mark.asyncio
@pytest.mark.parametrize("platform", ["daily", "livekit", "whereby"])
async def test_join_records_logged_in_user(platform, platform_client, client):
    room, meeting = await create_platform_meeting(platform)

    async with authenticated_client_ctx():
        for _ in range(2):
            response = await client.post(
                f"/rooms/{room.name}/meetings/{meeting.id}/join"
            )
            assert response.status_code == 200, response.text

    assert await count_rows(meeting.id) == 1
    assert await meeting_attendees_controller.is_attendee(meeting.id, "randomuserid")


@pytest.mark.asyncio
async def test_anonymous_join_records_nothing(platform_client, client):
    room, meeting = await create_platform_meeting("whereby")

    response = await client.post(f"/rooms/{room.name}/meetings/{meeting.id}/join")
    assert response.status_code == 200, response.text

    assert await count_rows(meeting.id) == 0


@pytest.mark.asyncio
async def test_join_succeeds_when_attendee_write_fails(platform_client, client):
    room, meeting = await create_platform_meeting("whereby")

    with patch(
        "reflector.views.rooms.meeting_attendees_controller.add",
        AsyncMock(side_effect=RuntimeError("db down")),
    ):
        async with authenticated_client_ctx():
            response = await client.post(
                f"/rooms/{room.name}/meetings/{meeting.id}/join"
            )

    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_presence_poll_records_users_with_user_id():
    room = await create_room()
    meeting = await create_meeting(room)
    now = datetime.now(timezone.utc).isoformat()
    presence = RoomPresenceResponse(
        total_count=3,
        data=[
            RoomPresenceParticipant(
                room=meeting.room_name,
                id=participant_id,
                userId=user_id,
                userName="name",
                joinTime=now,
                duration=10,
            )
            for participant_id, user_id in [
                ("p1", "user-alice"),
                ("p2", None),
                ("p3", "p3"),
            ]
        ],
    )
    daily_client = AsyncMock()
    daily_client.get_room_presence = AsyncMock(return_value=presence)

    lock = AsyncMock()
    lock.acquired = True
    lock.__aenter__ = AsyncMock(return_value=lock)
    lock.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("reflector.worker.process.RedisAsyncLock", return_value=lock),
        patch("reflector.worker.process.create_platform_client") as create_client,
    ):
        create_client.return_value.__aenter__ = AsyncMock(return_value=daily_client)
        create_client.return_value.__aexit__ = AsyncMock()
        await poll_daily_room_presence(meeting.id)

    assert await attendee_pairs() == {(meeting.id, "user-alice")}
