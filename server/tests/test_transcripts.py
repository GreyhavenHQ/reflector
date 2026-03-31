from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from reflector.db.meetings import meetings_controller
from reflector.db.recordings import Recording, recordings_controller
from reflector.db.rooms import rooms_controller
from reflector.db.transcripts import SourceKind, transcripts_controller


@pytest.mark.asyncio
async def test_transcript_create(monkeypatch, client):
    from reflector.settings import settings

    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test
    response = await client.post("/transcripts", json={"name": "test"})
    assert response.status_code == 200
    assert response.json()["name"] == "test"
    assert response.json()["status"] == "idle"
    assert response.json()["locked"] is False
    assert response.json()["id"] is not None
    assert response.json()["created_at"] is not None

    # ensure some fields are not returned
    assert "topics" not in response.json()
    assert "events" not in response.json()


@pytest.mark.asyncio
async def test_transcript_get_update_name(authenticated_client, client):
    response = await client.post("/transcripts", json={"name": "test"})
    assert response.status_code == 200
    assert response.json()["name"] == "test"

    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["name"] == "test"

    response = await client.patch(f"/transcripts/{tid}", json={"name": "test2"})
    assert response.status_code == 200
    assert response.json()["name"] == "test2"

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["name"] == "test2"


@pytest.mark.asyncio
async def test_transcript_get_update_locked(authenticated_client, client):
    response = await client.post("/transcripts", json={"name": "test"})
    assert response.status_code == 200
    assert response.json()["locked"] is False

    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["locked"] is False

    response = await client.patch(f"/transcripts/{tid}", json={"locked": True})
    assert response.status_code == 200
    assert response.json()["locked"] is True

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["locked"] is True


@pytest.mark.asyncio
async def test_transcript_get_update_summary(authenticated_client, client):
    response = await client.post("/transcripts", json={"name": "test"})
    assert response.status_code == 200
    assert response.json()["long_summary"] is None
    assert response.json()["short_summary"] is None

    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["long_summary"] is None
    assert response.json()["short_summary"] is None

    response = await client.patch(
        f"/transcripts/{tid}",
        json={"long_summary": "test_long", "short_summary": "test_short"},
    )
    assert response.status_code == 200
    assert response.json()["long_summary"] == "test_long"
    assert response.json()["short_summary"] == "test_short"

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["long_summary"] == "test_long"
    assert response.json()["short_summary"] == "test_short"


@pytest.mark.asyncio
async def test_transcript_get_update_title(authenticated_client, client):
    response = await client.post("/transcripts", json={"name": "test"})
    assert response.status_code == 200
    assert response.json()["title"] is None

    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["title"] is None

    response = await client.patch(f"/transcripts/{tid}", json={"title": "test_title"})
    assert response.status_code == 200
    assert response.json()["title"] == "test_title"

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["title"] == "test_title"


@pytest.mark.asyncio
async def test_set_status_emits_status_event_and_updates_transcript(
    monkeypatch, client
):
    """set_status adds a STATUS event and updates the transcript status (broadcast for WebSocket)."""
    from reflector.settings import settings

    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test
    response = await client.post("/transcripts", json={"name": "Status test"})
    assert response.status_code == 200
    transcript_id = response.json()["id"]

    transcript = await transcripts_controller.get_by_id(transcript_id)
    assert transcript is not None
    assert transcript.status == "idle"

    event = await transcripts_controller.set_status(transcript_id, "processing")
    assert event is not None
    assert event.event == "STATUS"
    assert event.data.get("value") == "processing"

    updated = await transcripts_controller.get_by_id(transcript_id)
    assert updated.status == "processing"


@pytest.mark.asyncio
async def test_transcripts_list_anonymous(client):
    # XXX this test is a bit fragile, as it depends on the storage which
    #     is shared between tests
    from reflector.settings import settings

    response = await client.get("/transcripts")
    assert response.status_code == 401

    # if public mode, it should be allowed
    try:
        settings.PUBLIC_MODE = True
        response = await client.get("/transcripts")
        assert response.status_code == 200
    finally:
        settings.PUBLIC_MODE = False


@pytest.mark.asyncio
async def test_transcripts_list_authenticated(authenticated_client, client):
    # XXX this test is a bit fragile, as it depends on the storage which
    #     is shared between tests

    response = await client.post("/transcripts", json={"name": "testxx1"})
    assert response.status_code == 200
    assert response.json()["name"] == "testxx1"

    response = await client.post("/transcripts", json={"name": "testxx2"})
    assert response.status_code == 200
    assert response.json()["name"] == "testxx2"

    response = await client.get("/transcripts")
    assert response.status_code == 200
    assert len(response.json()["items"]) >= 2
    names = [t["name"] for t in response.json()["items"]]
    assert "testxx1" in names
    assert "testxx2" in names


@pytest.mark.asyncio
async def test_transcript_delete(authenticated_client, client):
    response = await client.post("/transcripts", json={"name": "testdel1"})
    assert response.status_code == 200
    assert response.json()["name"] == "testdel1"

    tid = response.json()["id"]
    response = await client.delete(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # API returns 404 for soft-deleted transcripts
    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 404

    # But the transcript still exists in DB with deleted_at set
    transcript = await transcripts_controller.get_by_id(tid)
    assert transcript is not None
    assert transcript.deleted_at is not None


@pytest.mark.asyncio
async def test_deleted_transcript_not_in_list(authenticated_client, client):
    """Soft-deleted transcripts should not appear in the list endpoint."""
    response = await client.post("/transcripts", json={"name": "testdel_list"})
    assert response.status_code == 200
    tid = response.json()["id"]

    # Verify it appears in the list
    response = await client.get("/transcripts")
    assert response.status_code == 200
    ids = [t["id"] for t in response.json()["items"]]
    assert tid in ids

    # Delete it
    response = await client.delete(f"/transcripts/{tid}")
    assert response.status_code == 200

    # Verify it no longer appears in the list
    response = await client.get("/transcripts")
    assert response.status_code == 200
    ids = [t["id"] for t in response.json()["items"]]
    assert tid not in ids


@pytest.mark.asyncio
async def test_delete_already_deleted_is_idempotent(authenticated_client, client):
    """Deleting an already-deleted transcript is idempotent (returns 200)."""
    response = await client.post("/transcripts", json={"name": "testdel_idem"})
    assert response.status_code == 200
    tid = response.json()["id"]

    # First delete
    response = await client.delete(f"/transcripts/{tid}")
    assert response.status_code == 200

    # Second delete — idempotent, still returns ok
    response = await client.delete(f"/transcripts/{tid}")
    assert response.status_code == 200

    # But deleted_at was only set once (not updated)
    transcript = await transcripts_controller.get_by_id(tid)
    assert transcript is not None
    assert transcript.deleted_at is not None


@pytest.mark.asyncio
async def test_deleted_transcript_recording_soft_deleted(authenticated_client, client):
    """Soft-deleting a transcript also soft-deletes its recording."""
    from datetime import datetime, timezone

    recording = await recordings_controller.create(
        Recording(
            bucket_name="test-bucket",
            object_key="test.mp4",
            recorded_at=datetime.now(timezone.utc),
        )
    )
    transcript = await transcripts_controller.add(
        name="with-recording",
        source_kind=SourceKind.ROOM,
        recording_id=recording.id,
        user_id="randomuserid",
    )

    response = await client.delete(f"/transcripts/{transcript.id}")
    assert response.status_code == 200

    # Recording still in DB with deleted_at set
    rec = await recordings_controller.get_by_id(recording.id)
    assert rec is not None
    assert rec.deleted_at is not None

    # Transcript still in DB with deleted_at set
    tr = await transcripts_controller.get_by_id(transcript.id)
    assert tr is not None
    assert tr.deleted_at is not None


@pytest.mark.asyncio
async def test_transcript_mark_reviewed(authenticated_client, client):
    response = await client.post("/transcripts", json={"name": "test"})
    assert response.status_code == 200
    assert response.json()["name"] == "test"
    assert response.json()["reviewed"] is False

    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["name"] == "test"
    assert response.json()["reviewed"] is False

    response = await client.patch(f"/transcripts/{tid}", json={"reviewed": True})
    assert response.status_code == 200
    assert response.json()["reviewed"] is True

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["reviewed"] is True


@pytest.mark.asyncio
async def test_transcript_get_returns_room_name(authenticated_client, client):
    """Test that getting a transcript returns its room_name when linked to a room."""
    # Create a room
    room = await rooms_controller.add(
        name="test-room-for-transcript",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        webhook_url="",
        webhook_secret="",
    )

    # Create a transcript linked to the room
    transcript = await transcripts_controller.add(
        name="transcript-with-room",
        source_kind="file",
        room_id=room.id,
    )

    # Get the transcript and verify room_name is returned
    response = await client.get(f"/transcripts/{transcript.id}")
    assert response.status_code == 200
    assert response.json()["room_id"] == room.id
    assert response.json()["room_name"] == "test-room-for-transcript"


@pytest.mark.asyncio
async def test_transcript_get_returns_null_room_name_when_no_room(
    authenticated_client, client
):
    """Test that room_name is null when transcript has no room."""
    response = await client.post("/transcripts", json={"name": "no-room-transcript"})
    assert response.status_code == 200
    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["room_id"] is None
    assert response.json()["room_name"] is None


@pytest.mark.asyncio
async def test_transcripts_list_filtered_by_room_id(authenticated_client, client):
    """GET /transcripts?room_id=X returns only transcripts for that room."""
    # Use same user as authenticated_client (conftest uses "randomuserid")
    user_id = "randomuserid"
    room = await rooms_controller.add(
        name="room-for-list-filter",
        user_id=user_id,
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        webhook_url="",
        webhook_secret="",
    )
    in_room = await transcripts_controller.add(
        name="in-room",
        source_kind="file",
        room_id=room.id,
        user_id=user_id,
    )
    other = await transcripts_controller.add(
        name="no-room",
        source_kind="file",
        room_id=None,
        user_id=user_id,
    )

    response = await client.get("/transcripts", params={"room_id": room.id})
    assert response.status_code == 200
    items = response.json()["items"]
    ids = [t["id"] for t in items]
    assert in_room.id in ids
    assert other.id not in ids


# ---------------------------------------------------------------------------
# Restore tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transcript_restore(authenticated_client, client):
    """Soft-delete then restore, verify accessible again."""
    response = await client.post("/transcripts", json={"name": "restore-me"})
    assert response.status_code == 200
    tid = response.json()["id"]

    # Soft-delete
    response = await client.delete(f"/transcripts/{tid}")
    assert response.status_code == 200

    # 404 while deleted
    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 404

    # Restore
    response = await client.post(f"/transcripts/{tid}/restore")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # Accessible again
    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["name"] == "restore-me"

    # deleted_at is cleared
    transcript = await transcripts_controller.get_by_id(tid)
    assert transcript.deleted_at is None


@pytest.mark.asyncio
async def test_transcript_restore_recording_also_restored(authenticated_client, client):
    """Restoring a transcript also restores its recording."""
    recording = await recordings_controller.create(
        Recording(
            bucket_name="test-bucket",
            object_key="restore-test.mp4",
            recorded_at=datetime.now(timezone.utc),
        )
    )
    transcript = await transcripts_controller.add(
        name="restore-with-recording",
        source_kind=SourceKind.ROOM,
        recording_id=recording.id,
        user_id="randomuserid",
    )

    # Soft-delete
    response = await client.delete(f"/transcripts/{transcript.id}")
    assert response.status_code == 200

    # Both should be soft-deleted
    rec = await recordings_controller.get_by_id(recording.id)
    assert rec.deleted_at is not None

    # Restore
    response = await client.post(f"/transcripts/{transcript.id}/restore")
    assert response.status_code == 200

    # Recording also restored
    rec = await recordings_controller.get_by_id(recording.id)
    assert rec.deleted_at is None

    tr = await transcripts_controller.get_by_id(transcript.id)
    assert tr.deleted_at is None


@pytest.mark.asyncio
async def test_transcript_restore_not_deleted(authenticated_client, client):
    """Restoring a non-deleted transcript returns 400."""
    response = await client.post("/transcripts", json={"name": "not-deleted"})
    assert response.status_code == 200
    tid = response.json()["id"]

    response = await client.post(f"/transcripts/{tid}/restore")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_transcript_restore_not_found(authenticated_client, client):
    """Restoring a nonexistent transcript returns 404."""
    response = await client.post("/transcripts/nonexistent-id/restore")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_transcript_restore_forbidden(authenticated_client, client):
    """Cannot restore another user's deleted transcript."""
    # Create transcript owned by a different user
    transcript = await transcripts_controller.add(
        name="other-user-restore",
        source_kind=SourceKind.FILE,
        user_id="some-other-user",
    )
    # Soft-delete directly in DB
    await transcripts_controller.remove_by_id(transcript.id, user_id="some-other-user")

    # Try to restore as randomuserid (authenticated_client)
    response = await client.post(f"/transcripts/{transcript.id}/restore")
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Destroy tests
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_destroy_storage():
    """Mock storage backends so hard_delete doesn't require S3 credentials."""
    with (
        patch(
            "reflector.db.transcripts.get_transcripts_storage",
            return_value=AsyncMock(delete_file=AsyncMock()),
        ),
        patch(
            "reflector.db.transcripts.get_source_storage",
            return_value=AsyncMock(delete_file=AsyncMock()),
        ),
    ):
        yield


@pytest.mark.asyncio
async def test_transcript_destroy(authenticated_client, client, mock_destroy_storage):
    """Soft-delete then destroy, verify transcript gone from DB."""
    response = await client.post("/transcripts", json={"name": "destroy-me"})
    assert response.status_code == 200
    tid = response.json()["id"]

    # Soft-delete first
    response = await client.delete(f"/transcripts/{tid}")
    assert response.status_code == 200

    # Destroy
    response = await client.delete(f"/transcripts/{tid}/destroy")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # Gone from DB entirely
    transcript = await transcripts_controller.get_by_id(tid)
    assert transcript is None


@pytest.mark.asyncio
async def test_transcript_destroy_not_soft_deleted(authenticated_client, client):
    """Cannot destroy a transcript that hasn't been soft-deleted."""
    response = await client.post("/transcripts", json={"name": "not-soft-deleted"})
    assert response.status_code == 200
    tid = response.json()["id"]

    response = await client.delete(f"/transcripts/{tid}/destroy")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_transcript_destroy_with_recording(
    authenticated_client, client, mock_destroy_storage
):
    """Destroying a transcript also hard-deletes its recording from DB."""
    recording = await recordings_controller.create(
        Recording(
            bucket_name="test-bucket",
            object_key="destroy-test.mp4",
            recorded_at=datetime.now(timezone.utc),
        )
    )
    transcript = await transcripts_controller.add(
        name="destroy-with-recording",
        source_kind=SourceKind.ROOM,
        recording_id=recording.id,
        user_id="randomuserid",
    )

    # Soft-delete
    response = await client.delete(f"/transcripts/{transcript.id}")
    assert response.status_code == 200

    # Destroy
    response = await client.delete(f"/transcripts/{transcript.id}/destroy")
    assert response.status_code == 200

    # Both gone from DB
    assert await transcripts_controller.get_by_id(transcript.id) is None
    assert await recordings_controller.get_by_id(recording.id) is None


@pytest.mark.asyncio
async def test_transcript_destroy_forbidden(authenticated_client, client):
    """Cannot destroy another user's deleted transcript."""
    transcript = await transcripts_controller.add(
        name="other-user-destroy",
        source_kind=SourceKind.FILE,
        user_id="some-other-user",
    )
    await transcripts_controller.remove_by_id(transcript.id, user_id="some-other-user")

    # Try to destroy as randomuserid (authenticated_client)
    response = await client.delete(f"/transcripts/{transcript.id}/destroy")
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Isolation tests — verify unrelated data is NOT deleted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transcript_destroy_does_not_delete_meeting(
    authenticated_client, client, mock_destroy_storage
):
    """Destroying a transcript must NOT delete its associated meeting."""
    room = await rooms_controller.add(
        name="room-for-meeting-isolation",
        user_id="randomuserid",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        webhook_url="",
        webhook_secret="",
    )
    now = datetime.now(timezone.utc)
    meeting = await meetings_controller.create(
        id="meeting-isolation-test",
        room_name=room.name,
        room_url="https://example.com/room",
        host_room_url="https://example.com/room-host",
        start_date=now,
        end_date=now + timedelta(hours=1),
        room=room,
    )
    recording = await recordings_controller.create(
        Recording(
            bucket_name="test-bucket",
            object_key="meeting-iso.mp4",
            recorded_at=now,
            meeting_id=meeting.id,
        )
    )
    transcript = await transcripts_controller.add(
        name="transcript-with-meeting",
        source_kind=SourceKind.ROOM,
        recording_id=recording.id,
        meeting_id=meeting.id,
        room_id=room.id,
        user_id="randomuserid",
    )

    # Soft-delete then destroy
    await transcripts_controller.remove_by_id(transcript.id, user_id="randomuserid")
    response = await client.delete(f"/transcripts/{transcript.id}/destroy")
    assert response.status_code == 200

    # Transcript and recording are gone
    assert await transcripts_controller.get_by_id(transcript.id) is None
    assert await recordings_controller.get_by_id(recording.id) is None

    # Meeting still exists
    m = await meetings_controller.get_by_id(meeting.id)
    assert m is not None
    assert m.id == meeting.id


@pytest.mark.asyncio
async def test_transcript_destroy_does_not_affect_other_transcripts(
    authenticated_client, client, mock_destroy_storage
):
    """Destroying one transcript must not affect another transcript or its recording."""
    user_id = "randomuserid"
    rec1 = await recordings_controller.create(
        Recording(
            bucket_name="test-bucket",
            object_key="sibling1.mp4",
            recorded_at=datetime.now(timezone.utc),
        )
    )
    rec2 = await recordings_controller.create(
        Recording(
            bucket_name="test-bucket",
            object_key="sibling2.mp4",
            recorded_at=datetime.now(timezone.utc),
        )
    )
    t1 = await transcripts_controller.add(
        name="sibling-1",
        source_kind=SourceKind.FILE,
        recording_id=rec1.id,
        user_id=user_id,
    )
    t2 = await transcripts_controller.add(
        name="sibling-2",
        source_kind=SourceKind.FILE,
        recording_id=rec2.id,
        user_id=user_id,
    )

    # Soft-delete and destroy t1
    await transcripts_controller.remove_by_id(t1.id, user_id=user_id)
    response = await client.delete(f"/transcripts/{t1.id}/destroy")
    assert response.status_code == 200

    # t1 and rec1 gone
    assert await transcripts_controller.get_by_id(t1.id) is None
    assert await recordings_controller.get_by_id(rec1.id) is None

    # t2 and rec2 untouched
    t2_after = await transcripts_controller.get_by_id(t2.id)
    assert t2_after is not None
    assert t2_after.deleted_at is None
    rec2_after = await recordings_controller.get_by_id(rec2.id)
    assert rec2_after is not None
    assert rec2_after.deleted_at is None


@pytest.mark.asyncio
async def test_transcript_destroy_meeting_with_multiple_transcripts(
    authenticated_client, client, mock_destroy_storage
):
    """Destroying one transcript from a meeting must not affect the other
    transcript, its recording, or the shared meeting."""
    user_id = "randomuserid"
    room = await rooms_controller.add(
        name="room-multi-transcript",
        user_id=user_id,
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        webhook_url="",
        webhook_secret="",
    )
    now = datetime.now(timezone.utc)
    meeting = await meetings_controller.create(
        id="meeting-multi-transcript-test",
        room_name=room.name,
        room_url="https://example.com/room",
        host_room_url="https://example.com/room-host",
        start_date=now,
        end_date=now + timedelta(hours=1),
        room=room,
    )
    rec1 = await recordings_controller.create(
        Recording(
            bucket_name="test-bucket",
            object_key="multi1.mp4",
            recorded_at=now,
            meeting_id=meeting.id,
        )
    )
    rec2 = await recordings_controller.create(
        Recording(
            bucket_name="test-bucket",
            object_key="multi2.mp4",
            recorded_at=now,
            meeting_id=meeting.id,
        )
    )
    t1 = await transcripts_controller.add(
        name="multi-t1",
        source_kind=SourceKind.ROOM,
        recording_id=rec1.id,
        meeting_id=meeting.id,
        room_id=room.id,
        user_id=user_id,
    )
    t2 = await transcripts_controller.add(
        name="multi-t2",
        source_kind=SourceKind.ROOM,
        recording_id=rec2.id,
        meeting_id=meeting.id,
        room_id=room.id,
        user_id=user_id,
    )

    # Soft-delete and destroy t1
    await transcripts_controller.remove_by_id(t1.id, user_id=user_id)
    response = await client.delete(f"/transcripts/{t1.id}/destroy")
    assert response.status_code == 200

    # t1 + rec1 gone
    assert await transcripts_controller.get_by_id(t1.id) is None
    assert await recordings_controller.get_by_id(rec1.id) is None

    # t2 + rec2 + meeting all still exist
    assert (await transcripts_controller.get_by_id(t2.id)) is not None
    assert (await recordings_controller.get_by_id(rec2.id)) is not None
    assert (await meetings_controller.get_by_id(meeting.id)) is not None


# ---------------------------------------------------------------------------
# Search tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_include_deleted(authenticated_client, client):
    """Search with include_deleted=true returns only deleted transcripts."""
    response = await client.post("/transcripts", json={"name": "search-deleted"})
    assert response.status_code == 200
    tid = response.json()["id"]

    # Soft-delete
    response = await client.delete(f"/transcripts/{tid}")
    assert response.status_code == 200

    # Normal search should not include it
    response = await client.get("/transcripts/search", params={"q": ""})
    assert response.status_code == 200
    ids = [r["id"] for r in response.json()["results"]]
    assert tid not in ids

    # Search with include_deleted should include it
    response = await client.get(
        "/transcripts/search", params={"q": "", "include_deleted": True}
    )
    assert response.status_code == 200
    ids = [r["id"] for r in response.json()["results"]]
    assert tid in ids


@pytest.mark.asyncio
async def test_search_exclude_deleted_by_default(authenticated_client, client):
    """Normal search excludes deleted transcripts by default."""
    response = await client.post(
        "/transcripts", json={"name": "search-exclude-deleted"}
    )
    assert response.status_code == 200
    tid = response.json()["id"]

    # Verify it appears in search
    response = await client.get("/transcripts/search", params={"q": ""})
    assert response.status_code == 200
    ids = [r["id"] for r in response.json()["results"]]
    assert tid in ids

    # Soft-delete
    response = await client.delete(f"/transcripts/{tid}")
    assert response.status_code == 200

    # Verify it no longer appears in default search
    response = await client.get("/transcripts/search", params={"q": ""})
    assert response.status_code == 200
    ids = [r["id"] for r in response.json()["results"]]
    assert tid not in ids
