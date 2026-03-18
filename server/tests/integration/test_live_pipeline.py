"""
Integration test: WebRTC stream → LivePostProcessingPipeline → full processing.

Exercises: WebRTC SDP exchange → live audio streaming → connection close →
Hatchet LivePostPipeline → whisper transcription → LLM summarization/topics → status "ended".
"""

import asyncio
import json
import os

import httpx
import pytest
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaPlayer

SERVER_URL = os.environ.get("SERVER_URL", "http://server:1250")


@pytest.mark.asyncio
async def test_live_pipeline_end_to_end(
    api_client, test_records_dir, poll_transcript_status
):
    """Stream audio via WebRTC and verify the full post-processing pipeline completes."""
    # 1. Create transcript
    resp = await api_client.post(
        "/transcripts",
        json={"name": "integration-live-test"},
    )
    assert resp.status_code == 200, f"Failed to create transcript: {resp.text}"
    transcript = resp.json()
    transcript_id = transcript["id"]

    # 2. Set up WebRTC peer connection with audio from test file
    audio_path = test_records_dir / "test_short.wav"
    assert audio_path.exists(), f"Test audio file not found: {audio_path}"

    pc = RTCPeerConnection()
    player = MediaPlayer(audio_path.as_posix())

    # Add audio track
    audio_track = player.audio
    pc.addTrack(audio_track)

    # Create data channel (server expects this for STOP command)
    channel = pc.createDataChannel("data-channel")

    # 3. Generate SDP offer
    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    sdp_payload = {
        "sdp": pc.localDescription.sdp,
        "type": pc.localDescription.type,
    }

    # 4. Send offer to server and get answer
    webrtc_url = f"{SERVER_URL}/v1/transcripts/{transcript_id}/record/webrtc"
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        resp = await client.post(webrtc_url, json=sdp_payload)
    assert resp.status_code == 200, f"WebRTC offer failed: {resp.text}"

    answer_data = resp.json()
    answer = RTCSessionDescription(sdp=answer_data["sdp"], type=answer_data["type"])
    await pc.setRemoteDescription(answer)

    # 5. Wait for audio playback to finish
    max_stream_wait = 60
    elapsed = 0
    while elapsed < max_stream_wait:
        if audio_track.readyState == "ended":
            break
        await asyncio.sleep(0.5)
        elapsed += 0.5

    # 6. Send STOP command and close connection
    try:
        channel.send(json.dumps({"cmd": "STOP"}))
        await asyncio.sleep(1)
    except Exception:
        pass  # Channel may not be open if track ended quickly

    await pc.close()

    # 7. Poll until post-processing pipeline completes
    data = await poll_transcript_status(
        api_client, transcript_id, target="ended", max_wait=300
    )

    # 8. Assertions
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
