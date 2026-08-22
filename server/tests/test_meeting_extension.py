"""Tests for the meeting lease extension.

A meeting that is still running must not expire: `process_meetings` pushes
`end_date` forward while the platform reports active sessions, and propagates
the new expiry to the platform (Daily room `exp`).
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from reflector.dailyco_api import DailyApiClient, RoomProperties, UpdateRoomRequest
from reflector.db.meetings import meetings_controller
from reflector.db.rooms import rooms_controller
from reflector.video_platforms.models import SessionData
from reflector.worker import process
from reflector.worker.process import (
    MEETING_EXTENSION_DURATION,
    MEETING_EXTENSION_THRESHOLD,
)


def _process_meetings_fn():
    """Get the underlying async function without the Celery/asynctask decorators."""
    fn = process.process_meetings
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


process_meetings = _process_meetings_fn()


class TestDailyApiClientUpdateRoom:
    """The Daily REST client can update an existing room."""

    @pytest.mark.asyncio
    async def test_update_room_posts_only_provided_properties(self):
        client = DailyApiClient(api_key="test-key")
        http_client = AsyncMock()
        http_client.post.return_value = httpx.Response(
            200,
            json={
                "id": "room-id",
                "name": "test-room",
                "url": "https://daily.co/test-room",
                "api_created": True,
                "privacy": "public",
                "created_at": "2026-08-21T12:00:00.000Z",
            },
            request=httpx.Request("POST", "https://api.daily.co/v1/rooms/test-room"),
        )
        client._client = http_client

        result = await client.update_room(
            "test-room",
            UpdateRoomRequest(properties=RoomProperties(exp=1234567890)),
        )

        assert result.name == "test-room"
        http_client.post.assert_awaited_once()
        args, kwargs = http_client.post.call_args
        assert args[0] == "https://api.daily.co/v1/rooms/test-room"
        # Only explicitly set properties are sent, so unrelated room settings
        # (knocking, recording, ...) are not reset by the update.
        assert kwargs["json"] == {"properties": {"exp": 1234567890}}


class TestDailyExtendMeetingExpiration:
    """The Daily platform client propagates the new expiry to the room."""

    @pytest.mark.asyncio
    async def test_extend_meeting_expiration_updates_room_exp(self):
        from reflector.video_platforms.daily import DailyClient
        from reflector.video_platforms.models import VideoPlatformConfig

        client = DailyClient(
            VideoPlatformConfig(api_key="test-key", webhook_secret="secret")
        )
        client._api_client = MagicMock()
        client._api_client.update_room = AsyncMock()

        end_date = datetime(2026, 8, 21, 12, 0, tzinfo=timezone.utc)
        assert await client.extend_meeting_expiration("test-room", end_date) is True

        client._api_client.update_room.assert_awaited_once()
        room_name, request = client._api_client.update_room.call_args.args
        assert room_name == "test-room"
        assert request.properties.exp == int(end_date.timestamp())

    @pytest.mark.asyncio
    async def test_extend_meeting_expiration_returns_false_on_api_error(self):
        from reflector.video_platforms.daily import DailyClient
        from reflector.video_platforms.models import VideoPlatformConfig

        client = DailyClient(
            VideoPlatformConfig(api_key="test-key", webhook_secret="secret")
        )
        client._api_client = MagicMock()
        client._api_client.update_room = AsyncMock(side_effect=Exception("boom"))

        result = await client.extend_meeting_expiration(
            "test-room", datetime.now(timezone.utc)
        )

        assert result is False


async def _create_room(name: str = "extension-room"):
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


def _platform_client(sessions: list[SessionData], extend_result: bool = True):
    client = MagicMock()
    client.get_room_sessions = AsyncMock(return_value=sessions)
    client.extend_meeting_expiration = AsyncMock(return_value=extend_result)
    return client


def _active_session():
    return SessionData(
        session_id="session-1",
        started_at=datetime.now(timezone.utc) - timedelta(hours=7),
        ended_at=None,
    )


class TestProcessMeetingsExtension:
    @pytest.mark.asyncio
    @patch("reflector.worker.process.create_platform_client")
    async def test_extends_end_date_when_running_and_close_to_expiry(
        self, mock_create_client
    ):
        room = await _create_room("extension-room-close")
        now = datetime.now(timezone.utc)
        meeting = await meetings_controller.create(
            id="meeting-extend-1",
            room_name="daily-room-extend-1",
            room_url="https://daily.co/extend-1",
            host_room_url="https://daily.co/extend-1",
            start_date=now - timedelta(hours=7),
            end_date=now + timedelta(hours=1),
            room=room,
        )
        client = _platform_client([_active_session()])
        mock_create_client.return_value = client

        await process_meetings()

        updated = await meetings_controller.get_by_id(meeting.id)
        assert updated.is_active is True
        new_end_date = updated.end_date
        if new_end_date.tzinfo is None:
            new_end_date = new_end_date.replace(tzinfo=timezone.utc)
        expected = now + MEETING_EXTENSION_DURATION
        assert abs((new_end_date - expected).total_seconds()) < 60

        client.extend_meeting_expiration.assert_awaited_once()
        room_name, end_date = client.extend_meeting_expiration.call_args.args
        assert room_name == "daily-room-extend-1"
        assert abs((end_date - expected).total_seconds()) < 60

    @pytest.mark.asyncio
    @patch("reflector.worker.process.create_platform_client")
    async def test_no_extension_when_expiry_is_far_away(self, mock_create_client):
        room = await _create_room("extension-room-far")
        now = datetime.now(timezone.utc)
        original_end_date = now + MEETING_EXTENSION_THRESHOLD + timedelta(hours=1)
        meeting = await meetings_controller.create(
            id="meeting-extend-2",
            room_name="daily-room-extend-2",
            room_url="https://daily.co/extend-2",
            host_room_url="https://daily.co/extend-2",
            start_date=now - timedelta(minutes=10),
            end_date=original_end_date,
            room=room,
        )
        client = _platform_client([_active_session()])
        mock_create_client.return_value = client

        await process_meetings()

        updated = await meetings_controller.get_by_id(meeting.id)
        new_end_date = updated.end_date
        if new_end_date.tzinfo is None:
            new_end_date = new_end_date.replace(tzinfo=timezone.utc)
        assert abs((new_end_date - original_end_date).total_seconds()) < 1
        client.extend_meeting_expiration.assert_not_awaited()

    @pytest.mark.asyncio
    @patch("reflector.worker.process.create_platform_client")
    async def test_no_extension_when_no_active_sessions(self, mock_create_client):
        room = await _create_room("extension-room-idle")
        now = datetime.now(timezone.utc)
        original_end_date = now + timedelta(hours=1)
        meeting = await meetings_controller.create(
            id="meeting-extend-3",
            room_name="daily-room-extend-3",
            room_url="https://daily.co/extend-3",
            host_room_url="https://daily.co/extend-3",
            start_date=now - timedelta(hours=7),
            end_date=original_end_date,
            room=room,
        )
        ended_session = SessionData(
            session_id="session-ended",
            started_at=now - timedelta(hours=7),
            ended_at=now - timedelta(minutes=5),
        )
        client = _platform_client([ended_session])
        mock_create_client.return_value = client

        await process_meetings()

        updated = await meetings_controller.get_by_id(meeting.id)
        new_end_date = updated.end_date
        if new_end_date.tzinfo is None:
            new_end_date = new_end_date.replace(tzinfo=timezone.utc)
        assert abs((new_end_date - original_end_date).total_seconds()) < 1
        client.extend_meeting_expiration.assert_not_awaited()
        # everyone left: the meeting is deactivated as before
        assert updated.is_active is False

    @pytest.mark.asyncio
    @patch("reflector.worker.process.create_platform_client")
    async def test_join_succeeds_after_extension(self, mock_create_client, client):
        """Regression: a long-running meeting can still be joined after its
        original end date."""
        room = await _create_room("extension-room-join")
        now = datetime.now(timezone.utc)
        meeting = await meetings_controller.create(
            id="meeting-extend-join",
            room_name="daily-room-extend-join",
            room_url="https://daily.co/extend-join",
            host_room_url="https://daily.co/extend-join",
            start_date=now - timedelta(hours=9),
            end_date=now - timedelta(minutes=5),
            room=room,
        )
        mock_create_client.return_value = _platform_client([_active_session()])

        await process_meetings()

        response = await client.post(f"/rooms/{room.name}/meetings/{meeting.id}/join")
        assert response.status_code == 200, response.text

    @pytest.mark.asyncio
    @patch("reflector.worker.process.create_platform_client")
    async def test_db_extension_applies_even_if_platform_call_fails(
        self, mock_create_client
    ):
        room = await _create_room("extension-room-failing")
        now = datetime.now(timezone.utc)
        meeting = await meetings_controller.create(
            id="meeting-extend-4",
            room_name="daily-room-extend-4",
            room_url="https://daily.co/extend-4",
            host_room_url="https://daily.co/extend-4",
            start_date=now - timedelta(hours=7),
            end_date=now + timedelta(hours=1),
            room=room,
        )
        client = _platform_client([_active_session()])
        client.extend_meeting_expiration = AsyncMock(side_effect=Exception("boom"))
        mock_create_client.return_value = client

        await process_meetings()

        updated = await meetings_controller.get_by_id(meeting.id)
        assert updated.is_active is True
        new_end_date = updated.end_date
        if new_end_date.tzinfo is None:
            new_end_date = new_end_date.replace(tzinfo=timezone.utc)
        expected = now + MEETING_EXTENSION_DURATION
        assert abs((new_end_date - expected).total_seconds()) < 60
