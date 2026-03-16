import pytest


@pytest.mark.usefixtures("setup_database")
@pytest.mark.asyncio
async def test_transcript_upload_file(
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
    from reflector.settings import settings

    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test
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

    # Verify Hatchet workflow was dispatched for file processing
    from reflector.hatchet.client import HatchetClientManager

    HatchetClientManager.start_workflow.assert_called_once_with(
        "FilePipeline",
        {"transcript_id": tid},
        additional_metadata={"transcript_id": tid},
    )

    # Verify transcript status was updated to "uploaded"
    resp = await client.get(f"/transcripts/{tid}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "uploaded"
