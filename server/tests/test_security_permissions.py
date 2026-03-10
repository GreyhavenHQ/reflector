import asyncio
import shutil
import threading
import time
from pathlib import Path

import pytest
from conftest import authenticated_client_ctx
from httpx_ws import aconnect_ws
from uvicorn import Config, Server

from reflector import zulip as zulip_module
from reflector.app import app
from reflector.db import get_database
from reflector.db.meetings import meetings_controller
from reflector.db.rooms import Room, rooms_controller
from reflector.db.transcripts import (
    SourceKind,
    TranscriptTopic,
    transcripts_controller,
)
from reflector.processors.types import Word
from reflector.settings import settings
from reflector.views.transcripts import create_access_token


@pytest.mark.asyncio
async def test_anonymous_cannot_delete_transcript_in_shared_room(client):
    # Create a shared room with a fake owner id so meeting has a room_id
    room = await rooms_controller.add(
        name="shared-room-test",
        user_id="owner-1",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=True,
        webhook_url="",
        webhook_secret="",
    )

    # Create a meeting for that room (so transcript.meeting_id links to the shared room)
    meeting = await meetings_controller.create(
        id="meeting-sec-test",
        room_name="room-sec-test",
        room_url="room-url",
        host_room_url="host-url",
        start_date=Room.model_fields["created_at"].default_factory(),
        end_date=Room.model_fields["created_at"].default_factory(),
        room=room,
    )

    # Create a transcript owned by someone else and link it to meeting
    t = await transcripts_controller.add(
        name="to-delete",
        source_kind=SourceKind.LIVE,
        user_id="owner-2",
        meeting_id=meeting.id,
        room_id=room.id,
        share_mode="private",
    )

    # Anonymous DELETE should be rejected
    del_resp = await client.delete(f"/transcripts/{t.id}")
    assert del_resp.status_code == 401, del_resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_mutate_participants_on_public_transcript(client):
    # Create a public transcript with no owner
    t = await transcripts_controller.add(
        name="public-transcript",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="public",
    )

    # Anonymous POST participant must be rejected
    resp = await client.post(
        f"/transcripts/{t.id}/participants",
        json={"name": "AnonUser", "speaker": 0},
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_update_and_delete_room(client):
    # Create room as owner id "owner-3" via controller
    room = await rooms_controller.add(
        name="room-anon-update-delete",
        user_id="owner-3",
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

    # Anonymous PATCH via API (no auth)
    resp = await client.patch(
        f"/rooms/{room.id}",
        json={
            "name": "room-anon-updated",
            "zulip_auto_post": False,
            "zulip_stream": "",
            "zulip_topic": "",
            "is_locked": False,
            "room_mode": "normal",
            "recording_type": "cloud",
            "recording_trigger": "automatic-2nd-participant",
            "is_shared": False,
            "webhook_url": "",
            "webhook_secret": "",
        },
    )
    # Expect authentication required
    assert resp.status_code == 401, resp.text

    # Anonymous DELETE via API
    del_resp = await client.delete(f"/rooms/{room.id}")
    assert del_resp.status_code == 401, del_resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_post_transcript_to_zulip(client, monkeypatch):
    # Create a public transcript with some content
    t = await transcripts_controller.add(
        name="zulip-public",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="public",
    )

    # Mock send/update calls
    def _fake_send_message_to_zulip(stream, topic, content):
        return {"id": 12345}

    async def _fake_update_message(message_id, stream, topic, content):
        return {"result": "success"}

    monkeypatch.setattr(
        zulip_module, "send_message_to_zulip", _fake_send_message_to_zulip
    )
    monkeypatch.setattr(zulip_module, "update_zulip_message", _fake_update_message)

    # Anonymous POST to Zulip endpoint
    resp = await client.post(
        f"/transcripts/{t.id}/zulip",
        params={"stream": "general", "topic": "Updates", "include_topics": False},
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_assign_speaker_on_public_transcript(client):
    # Create public transcript
    t = await transcripts_controller.add(
        name="public-assign",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="public",
    )

    # Add a topic with words to be reassigned
    topic = TranscriptTopic(
        title="T1",
        summary="S1",
        timestamp=0.0,
        transcript="Hello",
        words=[Word(start=0.0, end=1.0, text="Hello", speaker=0)],
    )
    transcript = await transcripts_controller.get_by_id(t.id)
    await transcripts_controller.upsert_topic(transcript, topic)

    # Anonymous assign speaker over time range covering the word
    resp = await client.patch(
        f"/transcripts/{t.id}/speaker/assign",
        json={
            "speaker": 1,
            "timestamp_from": 0.0,
            "timestamp_to": 1.0,
        },
    )
    assert resp.status_code == 401, resp.text


# Minimal server fixture for websocket tests
@pytest.fixture
def appserver_ws_simple(setup_database):
    host = "127.0.0.1"
    port = 1256
    server_started = threading.Event()
    server_exception = None
    server_instance = None

    def run_server():
        nonlocal server_exception, server_instance
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            config = Config(app=app, host=host, port=port, loop=loop)
            server_instance = Server(config)

            async def start_server():
                database = get_database()
                await database.connect()
                try:
                    await server_instance.serve()
                finally:
                    await database.disconnect()

            server_started.set()
            loop.run_until_complete(start_server())
        except Exception as e:
            server_exception = e
            server_started.set()
        finally:
            loop.close()

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    server_started.wait(timeout=30)
    if server_exception:
        raise server_exception

    time.sleep(0.5)

    yield host, port

    if server_instance:
        server_instance.should_exit = True
        server_thread.join(timeout=30)


@pytest.mark.asyncio
async def test_websocket_denies_anonymous_on_private_transcript(appserver_ws_simple):
    host, port = appserver_ws_simple

    # Create a private transcript owned by someone
    t = await transcripts_controller.add(
        name="private-ws",
        source_kind=SourceKind.LIVE,
        user_id="owner-x",
        share_mode="private",
    )

    base_url = f"http://{host}:{port}/v1"
    # Anonymous connect should be denied
    with pytest.raises(Exception):
        async with aconnect_ws(f"{base_url}/transcripts/{t.id}/events") as ws:
            await ws.close()


@pytest.mark.asyncio
async def test_anonymous_cannot_update_public_transcript(client):
    t = await transcripts_controller.add(
        name="update-me",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="public",
    )

    resp = await client.patch(
        f"/transcripts/{t.id}",
        json={"title": "New Title From Anonymous"},
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_get_nonshared_room_by_id(client):
    room = await rooms_controller.add(
        name="private-room-exposed",
        user_id="owner-z",
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

    resp = await client.get(f"/rooms/{room.id}")
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_call_rooms_webhook_test(client):
    room = await rooms_controller.add(
        name="room-webhook-test",
        user_id="owner-y",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
        webhook_url="http://localhost.invalid/webhook",
        webhook_secret="secret",
    )

    # Anonymous caller
    resp = await client.post(f"/rooms/{room.id}/webhook/test")
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_create_room(client):
    payload = {
        "name": "room-create-auth-required",
        "zulip_auto_post": False,
        "zulip_stream": "",
        "zulip_topic": "",
        "is_locked": False,
        "room_mode": "normal",
        "recording_type": "cloud",
        "recording_trigger": "automatic-2nd-participant",
        "is_shared": False,
        "webhook_url": "",
        "webhook_secret": "",
    }
    resp = await client.post("/rooms", json=payload)
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_list_search_401_when_public_mode_false(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    resp = await client.get("/transcripts")
    assert resp.status_code == 401

    resp = await client.get("/transcripts/search", params={"q": "hello"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_audio_mp3_requires_token_for_owned_transcript(
    client, tmpdir, monkeypatch
):
    # Use temp data dir
    monkeypatch.setattr(settings, "DATA_DIR", Path(tmpdir).as_posix())

    # Create owner transcript and attach a local mp3
    t = await transcripts_controller.add(
        name="owned-audio",
        source_kind=SourceKind.LIVE,
        user_id="owner-a",
        share_mode="private",
    )

    tr = await transcripts_controller.get_by_id(t.id)
    await transcripts_controller.update(tr, {"status": "ended"})

    # copy fixture audio to transcript path
    audio_path = Path(__file__).parent / "records" / "test_mathieu_hello.mp3"
    tr.audio_mp3_filename.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(audio_path, tr.audio_mp3_filename)

    # Anonymous GET without token should be 403 or 404 depending on access; we call mp3
    resp = await client.get(f"/transcripts/{t.id}/audio/mp3")
    assert resp.status_code == 403

    # With token should succeed
    token = create_access_token(
        {"sub": tr.user_id}, expires_delta=__import__("datetime").timedelta(minutes=15)
    )
    resp2 = await client.get(f"/transcripts/{t.id}/audio/mp3", params={"token": token})
    assert resp2.status_code == 200


# ======================================================================
# Auth guards: anonymous blocked when PUBLIC_MODE=False
# ======================================================================


@pytest.mark.asyncio
async def test_anonymous_cannot_create_transcript_when_not_public(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    resp = await client.post("/transcripts", json={"name": "anon-test"})
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_process_transcript_when_not_public(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="process-test",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="public",
    )

    resp = await client.post(f"/transcripts/{t.id}/process")
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_upload_when_not_public(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="upload-test",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="public",
    )

    # Minimal multipart upload
    resp = await client.post(
        f"/transcripts/{t.id}/record/upload",
        params={"chunk_number": 0, "total_chunks": 1},
        files={"chunk": ("test.mp3", b"fake-audio", "audio/mpeg")},
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_webrtc_record_when_not_public(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="webrtc-test",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="public",
    )

    resp = await client.post(
        f"/transcripts/{t.id}/record/webrtc",
        json={"sdp": "v=0\r\n", "type": "offer"},
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_start_meeting_recording_when_not_public(
    client, monkeypatch
):
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    room = await rooms_controller.add(
        name="recording-auth-test",
        user_id="owner-rec",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=True,
        webhook_url="",
        webhook_secret="",
    )

    meeting = await meetings_controller.create(
        id="meeting-rec-test",
        room_name="recording-auth-test",
        room_url="room-url",
        host_room_url="host-url",
        start_date=Room.model_fields["created_at"].default_factory(),
        end_date=Room.model_fields["created_at"].default_factory(),
        room=room,
    )

    resp = await client.post(
        f"/meetings/{meeting.id}/recordings/start",
        json={"type": "cloud", "instanceId": "00000000-0000-0000-0000-000000000001"},
    )
    assert resp.status_code == 401, resp.text


# ======================================================================
# Public mode: anonymous IS allowed when PUBLIC_MODE=True
# ======================================================================


@pytest.mark.asyncio
async def test_anonymous_can_create_transcript_when_public(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)

    resp = await client.post("/transcripts", json={"name": "anon-public-test"})
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_anonymous_can_list_transcripts_when_public(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)

    resp = await client.get("/transcripts")
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_anonymous_can_read_public_transcript(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)

    t = await transcripts_controller.add(
        name="readable-test",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="public",
    )

    resp = await client.get(f"/transcripts/{t.id}")
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_anonymous_can_upload_when_public(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)

    t = await transcripts_controller.add(
        name="upload-public-test",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="public",
    )

    resp = await client.post(
        f"/transcripts/{t.id}/record/upload",
        params={"chunk_number": 0, "total_chunks": 2},
        files={"chunk": ("test.mp3", b"fake-audio", "audio/mpeg")},
    )
    # Chunk 0 of 2 won't trigger av.open validation, so should succeed with "ok"
    # The key assertion: auth did NOT block us (no 401)
    assert resp.status_code != 401, f"Should not get 401 in public mode: {resp.text}"
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_anonymous_can_start_meeting_recording_when_public(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)

    room = await rooms_controller.add(
        name="recording-public-test",
        user_id="owner-pub",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=True,
        webhook_url="",
        webhook_secret="",
    )

    meeting = await meetings_controller.create(
        id="meeting-pub-test",
        room_name="recording-public-test",
        room_url="room-url",
        host_room_url="host-url",
        start_date=Room.model_fields["created_at"].default_factory(),
        end_date=Room.model_fields["created_at"].default_factory(),
        room=room,
    )

    resp = await client.post(
        f"/meetings/{meeting.id}/recordings/start",
        json={"type": "cloud", "instanceId": "00000000-0000-0000-0000-000000000002"},
    )
    # Should not be 401 (may fail for other reasons like no Daily API, but auth passes)
    assert resp.status_code != 401, f"Should not get 401 in public mode: {resp.text}"


# ======================================================================
# Authenticated user vs private data (own transcripts)
# Authenticated owner should be able to create, read, and process
# their own private transcripts even when PUBLIC_MODE=False
# ======================================================================


@pytest.mark.asyncio
async def test_authenticated_can_create_transcript_private_mode(client, monkeypatch):
    """Authenticated user can create transcripts even when PUBLIC_MODE=False."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    async with authenticated_client_ctx():
        resp = await client.post("/transcripts", json={"name": "auth-private-create"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["user_id"] == "randomuserid"


@pytest.mark.asyncio
async def test_authenticated_can_read_own_private_transcript(client, monkeypatch):
    """Authenticated owner can read their own private transcript."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    # Create transcript owned by "randomuserid"
    t = await transcripts_controller.add(
        name="auth-private-read",
        source_kind=SourceKind.LIVE,
        user_id="randomuserid",
        share_mode="private",
    )

    async with authenticated_client_ctx():
        resp = await client.get(f"/transcripts/{t.id}")
        assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_authenticated_cannot_read_others_private_transcript(client, monkeypatch):
    """Authenticated user cannot read another user's private transcript."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    # Create transcript owned by someone else
    t = await transcripts_controller.add(
        name="other-private",
        source_kind=SourceKind.LIVE,
        user_id="other-owner",
        share_mode="private",
    )

    async with authenticated_client_ctx():
        resp = await client.get(f"/transcripts/{t.id}")
        assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_authenticated_can_process_own_private_transcript(client, monkeypatch):
    """Authenticated owner can trigger processing on their own private transcript."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="auth-private-process",
        source_kind=SourceKind.LIVE,
        user_id="randomuserid",
        share_mode="private",
    )

    async with authenticated_client_ctx():
        resp = await client.post(f"/transcripts/{t.id}/process")
        # Should pass auth (may fail for other reasons like validation, but not 401/403)
        assert resp.status_code not in (401, 403), resp.text


@pytest.mark.asyncio
async def test_authenticated_can_upload_to_own_private_transcript(client, monkeypatch):
    """Authenticated owner can upload audio to their own private transcript."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="auth-private-upload",
        source_kind=SourceKind.LIVE,
        user_id="randomuserid",
        share_mode="private",
    )

    async with authenticated_client_ctx():
        resp = await client.post(
            f"/transcripts/{t.id}/record/upload",
            params={"chunk_number": 0, "total_chunks": 2},
            files={"chunk": ("test.mp3", b"fake-audio", "audio/mpeg")},
        )
        # Auth passes, chunk accepted (not final chunk so no av validation)
        assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_authenticated_can_webrtc_own_private_transcript(client, monkeypatch):
    """Authenticated owner can start WebRTC recording on their own private transcript."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="auth-private-webrtc",
        source_kind=SourceKind.LIVE,
        user_id="randomuserid",
        share_mode="private",
    )

    async with authenticated_client_ctx():
        resp = await client.post(
            f"/transcripts/{t.id}/record/webrtc",
            json={"sdp": "v=0\r\n", "type": "offer"},
        )
        # Auth passes (may fail for other reasons like RTC setup, but not 401/403)
        assert resp.status_code not in (401, 403), resp.text


# ======================================================================
# Authenticated user vs semi-private data (other user's transcripts)
# Any authenticated user should be able to READ semi-private transcripts
# but NOT write to them (upload, process) since they don't own them
# ======================================================================


@pytest.mark.asyncio
async def test_authenticated_can_read_others_semi_private_transcript(
    client, monkeypatch
):
    """Any authenticated user can read a semi-private transcript (link sharing)."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    # Create transcript owned by someone else with semi-private share mode
    t = await transcripts_controller.add(
        name="semi-private-readable",
        source_kind=SourceKind.LIVE,
        user_id="other-owner",
        share_mode="semi-private",
    )

    async with authenticated_client_ctx():
        resp = await client.get(f"/transcripts/{t.id}")
        assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_anonymous_cannot_read_semi_private_transcript(client, monkeypatch):
    """Anonymous user cannot read a semi-private transcript."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="semi-private-blocked",
        source_kind=SourceKind.LIVE,
        user_id="some-owner",
        share_mode="semi-private",
    )

    resp = await client.get(f"/transcripts/{t.id}")
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_authenticated_can_list_own_transcripts_private_mode(client, monkeypatch):
    """Authenticated user can list their own transcripts when PUBLIC_MODE=False."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    await transcripts_controller.add(
        name="my-transcript",
        source_kind=SourceKind.LIVE,
        user_id="randomuserid",
        share_mode="private",
    )

    async with authenticated_client_ctx():
        resp = await client.get("/transcripts")
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert len(items) >= 1
        # All returned transcripts should belong to the user or be in shared rooms
        for item in items:
            assert item["user_id"] == "randomuserid" or item.get("room_id") is not None


@pytest.mark.asyncio
async def test_authenticated_cannot_list_others_private_transcripts(
    client, monkeypatch
):
    """Authenticated user should NOT see another user's private transcripts in the list."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    await transcripts_controller.add(
        name="hidden-from-others",
        source_kind=SourceKind.LIVE,
        user_id="secret-owner",
        share_mode="private",
    )

    async with authenticated_client_ctx():
        resp = await client.get("/transcripts")
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        # Should not contain transcripts owned by "secret-owner"
        for item in items:
            assert (
                item.get("user_id") != "secret-owner"
            ), f"Leaked private transcript: {item['id']}"


# ======================================================================
# Anonymous-created transcripts (user_id=None)
# These transcripts bypass share_mode checks entirely in get_by_id_for_http.
# They should always be accessible to everyone regardless of PUBLIC_MODE
# or share_mode setting, because there is no owner to restrict access.
# ======================================================================


@pytest.mark.asyncio
async def test_anonymous_transcript_accessible_when_public_mode_true(
    client, monkeypatch
):
    """Anonymous transcript (user_id=None) is accessible even with default private share_mode
    when PUBLIC_MODE=True."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)

    t = await transcripts_controller.add(
        name="anon-transcript-public-mode",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="private",  # share_mode is irrelevant for user_id=None
    )

    resp = await client.get(f"/transcripts/{t.id}")
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_anonymous_transcript_accessible_when_public_mode_false(
    client, monkeypatch
):
    """Anonymous transcript (user_id=None) is accessible by authenticated users
    even when PUBLIC_MODE=False. The transcript has no owner, so share_mode is bypassed."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="anon-transcript-private-mode",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="private",
    )

    async with authenticated_client_ctx():
        resp = await client.get(f"/transcripts/{t.id}")
        assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_anonymous_transcript_accessible_regardless_of_share_mode(
    client, monkeypatch
):
    """Anonymous transcripts (user_id=None) are accessible regardless of share_mode value.
    Tests all three share modes to confirm the user_id=None bypass works consistently."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)

    for mode in ("private", "semi-private", "public"):
        t = await transcripts_controller.add(
            name=f"anon-share-{mode}",
            source_kind=SourceKind.LIVE,
            user_id=None,
            share_mode=mode,
        )

        resp = await client.get(f"/transcripts/{t.id}")
        assert resp.status_code == 200, f"Failed for share_mode={mode}: {resp.text}"


@pytest.mark.asyncio
async def test_anonymous_transcript_readable_by_different_authenticated_user(
    client, monkeypatch
):
    """An authenticated user can read anonymous transcripts (user_id=None) even with
    private share_mode, because the no-owner bypass applies."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="anon-read-by-auth-user",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="private",
    )

    async with authenticated_client_ctx():
        resp = await client.get(f"/transcripts/{t.id}")
        assert resp.status_code == 200, resp.text
        assert resp.json()["user_id"] is None


@pytest.mark.asyncio
async def test_anonymous_transcript_in_list_when_public_mode(client, monkeypatch):
    """Anonymous transcripts appear in the transcript list when PUBLIC_MODE=True."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)

    t = await transcripts_controller.add(
        name="anon-in-list",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="private",
    )

    resp = await client.get("/transcripts")
    assert resp.status_code == 200, resp.text
    ids = [item["id"] for item in resp.json()["items"]]
    assert t.id in ids, "Anonymous transcript should appear in the public list"


@pytest.mark.asyncio
async def test_anonymous_transcript_audio_accessible(client, monkeypatch, tmpdir):
    """Anonymous transcript audio (mp3) is accessible without authentication
    because user_id=None bypasses share_mode checks."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)
    monkeypatch.setattr(settings, "DATA_DIR", Path(tmpdir).as_posix())

    t = await transcripts_controller.add(
        name="anon-audio-access",
        source_kind=SourceKind.LIVE,
        user_id=None,
        share_mode="private",
    )

    tr = await transcripts_controller.get_by_id(t.id)
    await transcripts_controller.update(tr, {"status": "ended"})

    # Copy fixture audio to transcript path
    audio_path = Path(__file__).parent / "records" / "test_mathieu_hello.mp3"
    tr.audio_mp3_filename.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(audio_path, tr.audio_mp3_filename)

    resp = await client.get(f"/transcripts/{t.id}/audio/mp3")
    assert (
        resp.status_code == 200
    ), f"Anonymous transcript audio should be accessible: {resp.text}"


@pytest.mark.asyncio
async def test_owned_transcript_not_accessible_by_anon_when_not_public(
    client, monkeypatch
):
    """Contrast test: owned transcript with private share_mode is NOT accessible
    to anonymous users when PUBLIC_MODE=False. This confirms that the user_id=None
    bypass only applies to anonymous transcripts, not to all transcripts."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    t = await transcripts_controller.add(
        name="owned-private-contrast",
        source_kind=SourceKind.LIVE,
        user_id="some-owner",
        share_mode="private",
    )

    resp = await client.get(f"/transcripts/{t.id}")
    assert (
        resp.status_code == 403
    ), f"Owned private transcript should be denied to anonymous: {resp.text}"


@pytest.mark.asyncio
async def test_authenticated_can_start_meeting_recording_private_mode(
    client, monkeypatch
):
    """Authenticated user can start recording in non-public mode."""
    monkeypatch.setattr(settings, "PUBLIC_MODE", False)

    room = await rooms_controller.add(
        name="auth-recording-test",
        user_id="randomuserid",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=True,
        webhook_url="",
        webhook_secret="",
    )

    meeting = await meetings_controller.create(
        id="meeting-auth-rec",
        room_name="auth-recording-test",
        room_url="room-url",
        host_room_url="host-url",
        start_date=Room.model_fields["created_at"].default_factory(),
        end_date=Room.model_fields["created_at"].default_factory(),
        room=room,
    )

    async with authenticated_client_ctx():
        resp = await client.post(
            f"/meetings/{meeting.id}/recordings/start",
            json={
                "type": "cloud",
                "instanceId": "00000000-0000-0000-0000-000000000003",
            },
        )
        # Auth passes (may fail for Daily API reasons, but not 401)
        assert resp.status_code != 401, resp.text
