import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import sqlalchemy as sa
from conftest import authenticated_client2_ctx, authenticated_client_ctx

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


async def seed_search_data():
    private_room = await create_room(name="private-room", user_id="owner-a")
    other_private_room = await create_room(name="other-private", user_id="owner-a")
    shared_room = await create_room(
        name="shared-room", user_id="owner-a", is_shared=True
    )
    own_room = await create_room(name="own-room", user_id="randomuserid")
    attended = await create_meeting(private_room, "attended-1")
    attended_2 = await create_meeting(private_room, "attended-2")
    shared = await create_meeting(shared_room, "shared")
    not_attended = await create_meeting(other_private_room, "not-attended")
    own_attended = await create_meeting(own_room, "own-attended")
    for meeting in (attended, attended_2, own_attended):
        await meeting_attendees_controller.add(meeting.id, "randomuserid")
    await meeting_attendees_controller.add(shared.id, "someone-else")
    await meeting_attendees_controller.add(not_attended.id, "someone-else")

    async def add(title, meeting, user_id="owner-a", share_mode="private"):
        transcript = await transcripts_controller.add(
            name=title,
            source_kind=SourceKind.ROOM if meeting else SourceKind.FILE,
            user_id=user_id,
            share_mode=share_mode,
            meeting_id=meeting.id if meeting else None,
            room_id=meeting.room_id if meeting else None,
        )
        await transcripts_controller.update(transcript, {"title": title})
        return transcript

    t = {
        "attended": await add("Budget planning", attended),
        "attended_2": await add("Hiring review", attended_2),
        "shared": await add("Shared roadmap", shared),
        "own_upload": await add("My upload", None, user_id="randomuserid"),
        "own_attended": await add(
            "Own room sync", own_attended, user_id="randomuserid"
        ),
    }
    await add("Not attended", not_attended, share_mode="semi-private")
    return t


async def search_ids(client, **params) -> list[str]:
    response = await client.get("/transcripts/search", params={"q": "", **params})
    assert response.status_code == 200, response.text
    return [r["id"] for r in response.json()["results"]]


async def list_ids(client, **params) -> list[str]:
    response = await client.get("/transcripts", params=params)
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


@pytest.mark.asyncio
@pytest.mark.parametrize("fetch", [search_ids, list_ids])
async def test_scope_filters(fetch, client):
    t = await seed_search_data()
    owned_or_shared = {t["shared"].id, t["own_upload"].id, t["own_attended"].id}
    attended = {t["attended"].id, t["attended_2"].id, t["own_attended"].id}

    async with authenticated_client_ctx():
        default_ids = await fetch(client)
        all_ids = await fetch(client, scope="all")
        owned_or_shared_ids = await fetch(client, scope="owned_or_shared")
        attended_ids = await fetch(client, scope="attended")

    assert sorted(default_ids) == sorted(all_ids)
    assert sorted(all_ids) == sorted(owned_or_shared | attended)
    assert sorted(owned_or_shared_ids) == sorted(owned_or_shared)
    assert sorted(attended_ids) == sorted(attended)


@pytest.mark.asyncio
async def test_search_attended_with_query_and_pagination(client):
    t = await seed_search_data()

    async with authenticated_client_ctx():
        ids = await search_ids(client, scope="attended", q="budget")
        assert ids == [t["attended"].id]

        page_1 = await search_ids(client, scope="attended", limit=2)
        page_2 = await search_ids(client, scope="attended", limit=2, offset=2)
        response = await client.get(
            "/transcripts/search", params={"q": "", "scope": "attended", "limit": 2}
        )

    assert response.json()["total"] == 3
    assert len(page_1) == 2 and len(page_2) == 1
    assert {*page_1, *page_2} == {
        t["attended"].id,
        t["attended_2"].id,
        t["own_attended"].id,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/transcripts/search", "/transcripts"])
async def test_scope_attended_requires_user(path, client):
    response = await client.get(path, params={"q": "", "scope": "attended"})
    assert response.status_code == 401, response.text


@pytest.mark.asyncio
async def test_search_attended_rejects_include_deleted(client):
    async with authenticated_client_ctx():
        response = await client.get(
            "/transcripts/search",
            params={"q": "", "scope": "attended", "include_deleted": True},
        )
    assert response.status_code == 400, response.text


async def private_attended_transcript():
    room = await create_room(name="private-read", user_id="owner-a")
    meeting = await create_meeting(room, "private-read-meeting")
    await meeting_attendees_controller.add(meeting.id, "randomuserid")
    return await transcripts_controller.add(
        name="private",
        source_kind=SourceKind.ROOM,
        user_id="owner-a",
        share_mode="private",
        meeting_id=meeting.id,
        room_id=room.id,
    )


@pytest.mark.asyncio
async def test_attendee_reads_private_transcript(client):
    transcript = await private_attended_transcript()

    async with authenticated_client_ctx():
        for path in ["", "/topics", "/participants"]:
            response = await client.get(f"/transcripts/{transcript.id}{path}")
            assert response.status_code == 200, (path, response.text)


@pytest.mark.asyncio
async def test_non_attendee_cannot_read_private_transcript(client):
    transcript = await private_attended_transcript()

    async with authenticated_client2_ctx():
        for path in ["", "/topics", "/participants"]:
            response = await client.get(f"/transcripts/{transcript.id}{path}")
            assert response.status_code == 403, (path, response.text)


@pytest.mark.asyncio
async def test_attendee_cannot_mutate_private_transcript(client):
    transcript = await private_attended_transcript()

    async with authenticated_client_ctx():
        patch_response = await client.patch(
            f"/transcripts/{transcript.id}", json={"share_mode": "public"}
        )
        delete_response = await client.delete(f"/transcripts/{transcript.id}")

    assert patch_response.status_code == 403, patch_response.text
    assert delete_response.status_code == 403, delete_response.text
