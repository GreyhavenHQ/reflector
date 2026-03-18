"""
Integration test: File upload → FilePipeline → full processing.

Exercises: upload endpoint → Hatchet FilePipeline → whisper transcription →
pyannote diarization → LLM summarization/topics → status "ended".
"""

import pytest


@pytest.mark.asyncio
async def test_file_pipeline_end_to_end(
    api_client, test_records_dir, poll_transcript_status
):
    """Upload a WAV file and verify the full pipeline completes."""
    # 1. Create transcript
    resp = await api_client.post(
        "/transcripts",
        json={"name": "integration-file-test", "source_kind": "file"},
    )
    assert resp.status_code == 200, f"Failed to create transcript: {resp.text}"
    transcript = resp.json()
    transcript_id = transcript["id"]

    # 2. Upload audio file (single chunk)
    audio_path = test_records_dir / "test_short.wav"
    assert audio_path.exists(), f"Test audio file not found: {audio_path}"

    with open(audio_path, "rb") as f:
        resp = await api_client.post(
            f"/transcripts/{transcript_id}/record/upload",
            params={"chunk_number": 0, "total_chunks": 1},
            files={"chunk": ("test_short.wav", f, "audio/wav")},
        )
    assert resp.status_code == 200, f"Upload failed: {resp.text}"

    # 3. Poll until pipeline completes
    data = await poll_transcript_status(
        api_client, transcript_id, target="ended", max_wait=300
    )

    # 4. Assertions
    assert data["status"] == "ended"
    assert data.get("title") and len(data["title"]) > 0, "Title should be non-empty"
    assert (
        data.get("long_summary") and len(data["long_summary"]) > 0
    ), "Long summary should be non-empty"
    assert (
        data.get("short_summary") and len(data["short_summary"]) > 0
    ), "Short summary should be non-empty"

    # Topics are served from a separate endpoint
    topics_resp = await api_client.get(f"/transcripts/{transcript_id}/topics")
    assert topics_resp.status_code == 200, f"Failed to get topics: {topics_resp.text}"
    topics = topics_resp.json()
    assert len(topics) >= 1, "Should have at least 1 topic"
    for topic in topics:
        assert topic.get("title"), "Each topic should have a title"
        assert topic.get("summary"), "Each topic should have a summary"

    assert data.get("duration", 0) > 0, "Duration should be positive"
