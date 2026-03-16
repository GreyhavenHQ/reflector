from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from reflector.settings import settings


@pytest.fixture
async def app_lifespan():
    from asgi_lifespan import LifespanManager

    from reflector.app import app

    async with LifespanManager(app) as manager:
        yield manager.app


@pytest.fixture
async def client(app_lifespan):
    yield AsyncClient(
        transport=ASGITransport(app=app_lifespan),
        base_url="http://test/v1",
    )


@pytest.mark.usefixtures("setup_database")
@pytest.mark.asyncio
async def test_transcript_process(
    tmpdir,
    dummy_llm,
    dummy_processors,
    dummy_file_transcript,
    dummy_file_diarization,
    dummy_storage,
    client,
    monkeypatch,
    mock_hatchet_client,
):
    """Test upload + process dispatch via Hatchet.

    The file pipeline is now dispatched to Hatchet (fire-and-forget),
    so we verify the workflow was triggered rather than polling for completion.
    """
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)

    # create a transcript
    response = await client.post("/transcripts", json={"name": "test"})
    assert response.status_code == 200
    assert response.json()["status"] == "idle"
    tid = response.json()["id"]

    # upload mp3
    response = await client.post(
        f"/transcripts/{tid}/record/upload?chunk_number=0&total_chunks=1",
        files={
            "chunk": (
                "test_short.wav",
                open("tests/records/test_short.wav", "rb"),
                "audio/mpeg",
            ),
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # Verify Hatchet workflow was dispatched (from upload endpoint)
    from reflector.hatchet.client import HatchetClientManager

    HatchetClientManager.start_workflow.assert_called_once_with(
        "FilePipeline",
        {"transcript_id": tid},
        additional_metadata={"transcript_id": tid},
    )

    # Verify transcript status was set to "uploaded"
    resp = await client.get(f"/transcripts/{tid}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "uploaded"

    # Reset mock for reprocess test
    HatchetClientManager.start_workflow.reset_mock()

    # Clear workflow_run_id so /process endpoint can dispatch again
    from reflector.db.transcripts import transcripts_controller

    transcript = await transcripts_controller.get_by_id(tid)
    await transcripts_controller.update(transcript, {"workflow_run_id": None})

    # Reprocess via /process endpoint
    with patch(
        "reflector.services.transcript_process.task_is_scheduled_or_active",
        return_value=False,
    ):
        response = await client.post(f"/transcripts/{tid}/process")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    # Verify second Hatchet dispatch (from /process endpoint)
    HatchetClientManager.start_workflow.assert_called_once()
    call_kwargs = HatchetClientManager.start_workflow.call_args.kwargs
    assert call_kwargs["workflow_name"] == "FilePipeline"
    assert call_kwargs["input_data"]["transcript_id"] == tid


@pytest.mark.usefixtures("setup_database")
@pytest.mark.asyncio
async def test_whereby_recording_uses_file_pipeline(monkeypatch, client):
    """Test that Whereby recordings (bucket_name but no track_keys) use file pipeline"""
    from datetime import datetime, timezone

    from reflector.db.recordings import Recording, recordings_controller
    from reflector.db.transcripts import transcripts_controller
    from reflector.settings import settings

    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test

    # Create transcript with Whereby recording (has bucket_name, no track_keys)
    transcript = await transcripts_controller.add(
        "",
        source_kind="room",
        source_language="en",
        target_language="en",
        user_id="test-user",
        share_mode="public",
    )

    recording = await recordings_controller.create(
        Recording(
            bucket_name="whereby-bucket",
            object_key="test-recording.mp4",  # gitleaks:allow
            meeting_id="test-meeting",
            recorded_at=datetime.now(timezone.utc),
            track_keys=None,  # Whereby recordings have no track_keys
        )
    )

    await transcripts_controller.update(
        transcript, {"recording_id": recording.id, "status": "uploaded"}
    )

    with (
        patch(
            "reflector.services.transcript_process.task_is_scheduled_or_active",
            return_value=False,
        ),
        patch(
            "reflector.services.transcript_process.HatchetClientManager"
        ) as mock_hatchet,
    ):
        mock_hatchet.start_workflow = AsyncMock(return_value="test-workflow-id")

        response = await client.post(f"/transcripts/{transcript.id}/process")

        assert response.status_code == 200
        assert response.json()["status"] == "ok"

        # Whereby recordings should use Hatchet FilePipeline
        mock_hatchet.start_workflow.assert_called_once()
        call_kwargs = mock_hatchet.start_workflow.call_args.kwargs
        assert call_kwargs["workflow_name"] == "FilePipeline"
        assert call_kwargs["input_data"]["transcript_id"] == transcript.id


@pytest.mark.usefixtures("setup_database")
@pytest.mark.asyncio
async def test_dailyco_recording_uses_multitrack_pipeline(monkeypatch, client):
    """Test that Daily.co recordings (bucket_name + track_keys) use multitrack pipeline"""
    from datetime import datetime, timezone

    from reflector.db.recordings import Recording, recordings_controller
    from reflector.db.rooms import rooms_controller
    from reflector.db.transcripts import transcripts_controller
    from reflector.settings import settings

    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test

    room = await rooms_controller.add(
        name="test-room",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
    )

    transcript = await transcripts_controller.add(
        "",
        source_kind="room",
        source_language="en",
        target_language="en",
        user_id="test-user",
        share_mode="public",
        room_id=room.id,
    )

    track_keys = [
        "recordings/test-room/track1.webm",
        "recordings/test-room/track2.webm",
    ]
    recording = await recordings_controller.create(
        Recording(
            bucket_name="daily-bucket",
            object_key="recordings/test-room",
            meeting_id="test-meeting",
            track_keys=track_keys,
            recorded_at=datetime.now(timezone.utc),
        )
    )

    await transcripts_controller.update(
        transcript, {"recording_id": recording.id, "status": "uploaded"}
    )

    with (
        patch(
            "reflector.services.transcript_process.task_is_scheduled_or_active",
            return_value=False,
        ),
        patch(
            "reflector.services.transcript_process.HatchetClientManager"
        ) as mock_hatchet,
    ):
        mock_hatchet.start_workflow = AsyncMock(return_value="test-workflow-id")

        response = await client.post(f"/transcripts/{transcript.id}/process")

        assert response.status_code == 200
        assert response.json()["status"] == "ok"

        # Daily.co multitrack recordings should use Hatchet DiarizationPipeline
        mock_hatchet.start_workflow.assert_called_once()
        call_kwargs = mock_hatchet.start_workflow.call_args.kwargs
        assert call_kwargs["workflow_name"] == "DiarizationPipeline"
        assert call_kwargs["input_data"]["transcript_id"] == transcript.id
        assert call_kwargs["input_data"]["bucket_name"] == "daily-bucket"
        assert call_kwargs["input_data"]["tracks"] == [
            {"s3_key": k} for k in track_keys
        ]


@pytest.mark.usefixtures("setup_database")
@pytest.mark.asyncio
async def test_reprocess_error_transcript_passes_force(monkeypatch, client):
    """When transcript status is 'error', reprocess passes force=True to start fresh workflow."""
    from datetime import datetime, timezone

    from reflector.db.recordings import Recording, recordings_controller
    from reflector.db.rooms import rooms_controller
    from reflector.db.transcripts import transcripts_controller
    from reflector.settings import settings

    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test

    room = await rooms_controller.add(
        name="test-room",
        user_id="test-user",
        zulip_auto_post=False,
        zulip_stream="",
        zulip_topic="",
        is_locked=False,
        room_mode="normal",
        recording_type="cloud",
        recording_trigger="automatic-2nd-participant",
        is_shared=False,
    )

    transcript = await transcripts_controller.add(
        "",
        source_kind="room",
        source_language="en",
        target_language="en",
        user_id="test-user",
        share_mode="public",
        room_id=room.id,
    )

    track_keys = ["recordings/test-room/track1.webm"]
    recording = await recordings_controller.create(
        Recording(
            bucket_name="daily-bucket",
            object_key="recordings/test-room",
            meeting_id="test-meeting",
            track_keys=track_keys,
            recorded_at=datetime.now(timezone.utc),
        )
    )

    await transcripts_controller.update(
        transcript,
        {
            "recording_id": recording.id,
            "status": "error",
            "workflow_run_id": "old-failed-run",
        },
    )

    with (
        patch(
            "reflector.services.transcript_process.task_is_scheduled_or_active"
        ) as mock_celery,
        patch(
            "reflector.services.transcript_process.HatchetClientManager"
        ) as mock_hatchet,
        patch(
            "reflector.views.transcripts_process.dispatch_transcript_processing",
            new_callable=AsyncMock,
        ) as mock_dispatch,
    ):
        mock_celery.return_value = False
        from hatchet_sdk.clients.rest.models import V1TaskStatus

        mock_hatchet.get_workflow_run_status = AsyncMock(
            return_value=V1TaskStatus.FAILED
        )
        response = await client.post(f"/transcripts/{transcript.id}/process")

    assert response.status_code == 200
    mock_dispatch.assert_called_once()
    assert mock_dispatch.call_args.kwargs["force"] is True
