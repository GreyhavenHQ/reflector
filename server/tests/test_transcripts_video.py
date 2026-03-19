from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from reflector.db.transcripts import SourceKind, transcripts_controller


@pytest.mark.asyncio
async def test_video_url_returns_404_when_no_meeting(authenticated_client, client):
    """Test that video URL returns 404 when transcript has no meeting."""
    response = await client.post("/transcripts", json={"name": "no-meeting"})
    assert response.status_code == 200
    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}/video/url")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_video_url_returns_404_when_no_cloud_video(authenticated_client, client):
    """Test that video URL returns 404 when meeting has no cloud video."""
    from reflector.db import get_database
    from reflector.db.meetings import meetings

    meeting_id = "test-meeting-no-video"
    await get_database().execute(
        meetings.insert().values(
            id=meeting_id,
            room_name="No Video Meeting",
            room_url="https://example.com",
            host_room_url="https://example.com/host",
            start_date=datetime.now(timezone.utc),
            end_date=datetime.now(timezone.utc) + timedelta(hours=1),
            room_id=None,
        )
    )

    transcript = await transcripts_controller.add(
        name="with-meeting",
        source_kind=SourceKind.ROOM,
        meeting_id=meeting_id,
        user_id="randomuserid",
    )

    response = await client.get(f"/transcripts/{transcript.id}/video/url")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_video_url_returns_presigned_url(authenticated_client, client):
    """Test that video URL returns a presigned URL when cloud video exists."""
    from reflector.db import get_database
    from reflector.db.meetings import meetings

    meeting_id = "test-meeting-with-video"
    await get_database().execute(
        meetings.insert().values(
            id=meeting_id,
            room_name="Video Meeting",
            room_url="https://example.com",
            host_room_url="https://example.com/host",
            start_date=datetime.now(timezone.utc),
            end_date=datetime.now(timezone.utc) + timedelta(hours=1),
            room_id=None,
            daily_composed_video_s3_key="recordings/video.mp4",
            daily_composed_video_duration=120,
        )
    )

    transcript = await transcripts_controller.add(
        name="with-video",
        source_kind=SourceKind.ROOM,
        meeting_id=meeting_id,
        user_id="randomuserid",
    )

    with patch("reflector.views.transcripts_video.get_source_storage") as mock_storage:
        mock_instance = AsyncMock()
        mock_instance.get_file_url = AsyncMock(
            return_value="https://s3.example.com/presigned-url"
        )
        mock_storage.return_value = mock_instance

        response = await client.get(f"/transcripts/{transcript.id}/video/url")

    assert response.status_code == 200
    data = response.json()
    assert data["url"] == "https://s3.example.com/presigned-url"
    assert data["duration"] == 120
    assert data["content_type"] == "video/mp4"


@pytest.mark.asyncio
async def test_transcript_get_includes_video_fields(authenticated_client, client):
    """Test that transcript GET response includes has_cloud_video field."""
    response = await client.post("/transcripts", json={"name": "video-fields"})
    assert response.status_code == 200
    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    data = response.json()
    assert data["has_cloud_video"] is False
    assert data["cloud_video_duration"] is None
