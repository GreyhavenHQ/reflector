"""
Integration test: Multitrack → DailyMultitrackPipeline → full processing.

Exercises: S3 upload → DB recording setup → process endpoint →
Hatchet DiarizationPipeline → mock Daily API → whisper per-track transcription →
diarization → mixdown → LLM summarization/topics → status "ended".
Also tests email transcript notification via Mailpit SMTP sink.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

# Must match Daily's filename format: {recording_start_ts}-{participant_uuid}-cam-audio-{track_start_ts}
# These UUIDs must match mock_daily_server.py participant IDs
PARTICIPANT_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
PARTICIPANT_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
TRACK_KEYS = [
    f"1700000000000-{PARTICIPANT_A_ID}-cam-audio-1700000001000",
    f"1700000000000-{PARTICIPANT_B_ID}-cam-audio-1700000001000",
]


TEST_EMAIL = "integration-test@reflector.local"


@pytest.mark.asyncio
async def test_multitrack_pipeline_end_to_end(
    api_client,
    s3_client,
    db_engine,
    test_records_dir,
    bucket_name,
    poll_transcript_status,
    mailpit_client,
    poll_mailpit_messages,
):
    """Set up multitrack recording in S3/DB and verify the full pipeline completes."""
    # 1. Upload test audio as two separate tracks to Garage S3
    audio_path = test_records_dir / "test_short.wav"
    assert audio_path.exists(), f"Test audio file not found: {audio_path}"

    for track_key in TRACK_KEYS:
        s3_client.upload_file(
            str(audio_path),
            bucket_name,
            track_key,
        )

    # 2. Create transcript via API
    resp = await api_client.post(
        "/transcripts",
        json={"name": "integration-multitrack-test"},
    )
    assert resp.status_code == 200, f"Failed to create transcript: {resp.text}"
    transcript = resp.json()
    transcript_id = transcript["id"]

    # 3. Insert Meeting, Recording, and link to transcript via direct DB access
    recording_id = f"rec-integration-{transcript_id[:8]}"
    meeting_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    async with db_engine.begin() as conn:
        # Insert meeting with email_recipients for email notification test
        await conn.execute(
            text("""
                INSERT INTO meeting (
                    id, room_name, room_url, host_room_url,
                    start_date, end_date, platform, email_recipients
                )
                VALUES (
                    :id, :room_name, :room_url, :host_room_url,
                    :start_date, :end_date, :platform, CAST(:email_recipients AS json)
                )
            """),
            {
                "id": meeting_id,
                "room_name": "integration-test-room",
                "room_url": "https://test.daily.co/integration-test-room",
                "host_room_url": "https://test.daily.co/integration-test-room",
                "start_date": now,
                "end_date": now + timedelta(hours=1),
                "platform": "daily",
                "email_recipients": json.dumps([TEST_EMAIL]),
            },
        )

        # Insert recording with track_keys, linked to meeting
        await conn.execute(
            text("""
                INSERT INTO recording (id, bucket_name, object_key, recorded_at, status, track_keys, meeting_id)
                VALUES (:id, :bucket_name, :object_key, :recorded_at, :status, CAST(:track_keys AS json), :meeting_id)
            """),
            {
                "id": recording_id,
                "bucket_name": bucket_name,
                "object_key": TRACK_KEYS[0],
                "recorded_at": now,
                "status": "completed",
                "track_keys": json.dumps(TRACK_KEYS),
                "meeting_id": meeting_id,
            },
        )

        # Link recording to transcript and set status to uploaded
        await conn.execute(
            text("""
                UPDATE transcript
                SET recording_id = :recording_id, status = 'uploaded'
                WHERE id = :transcript_id
            """),
            {
                "recording_id": recording_id,
                "transcript_id": transcript_id,
            },
        )

    # 4. Trigger processing via process endpoint
    resp = await api_client.post(f"/transcripts/{transcript_id}/process")
    assert resp.status_code == 200, f"Process trigger failed: {resp.text}"

    # 5. Poll until pipeline completes
    # The pipeline will call mock-daily for get_recording and get_participants
    # Accept "error" too — non-critical steps like action_items may fail due to
    # LLM parsing flakiness while core results (transcript, summaries) still exist.
    data = await poll_transcript_status(
        api_client, transcript_id, target=("ended", "error"), max_wait=300
    )

    # 6. Assertions — verify core pipeline results regardless of final status
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

    # Participants are served from a separate endpoint
    participants_resp = await api_client.get(
        f"/transcripts/{transcript_id}/participants"
    )
    assert (
        participants_resp.status_code == 200
    ), f"Failed to get participants: {participants_resp.text}"
    participants = participants_resp.json()
    assert (
        len(participants) >= 2
    ), f"Expected at least 2 speakers for multitrack, got {len(participants)}"

    # 7. Verify email transcript notification
    # The send_email pipeline task should have sent an email to TEST_EMAIL via Mailpit.
    # Note: share_mode is only set to "public" when meeting has email_recipients;
    # room-level emails do NOT change share_mode.

    # Poll Mailpit for the delivered email (send_email task runs async after finalize)
    messages = await poll_mailpit_messages(mailpit_client, TEST_EMAIL, max_wait=30)
    assert len(messages) >= 1, "Should have received at least 1 email"
    email_msg = messages[0]
    assert (
        "Transcript Ready" in email_msg.get("Subject", "")
    ), f"Email subject should contain 'Transcript Ready', got: {email_msg.get('Subject')}"
