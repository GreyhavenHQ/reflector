from datetime import datetime, timezone

import pytest

from reflector.db.recordings import Recording, recordings_controller
from reflector.db.transcripts import SourceKind, transcripts_controller


@pytest.mark.asyncio
async def test_recording_deleted_with_transcript():
    """Soft-delete: recording and transcript remain in DB with deleted_at set, no files deleted."""
    recording = await recordings_controller.create(
        Recording(
            bucket_name="test-bucket",
            object_key="recording.mp4",
            recorded_at=datetime.now(timezone.utc),
        )
    )
    transcript = await transcripts_controller.add(
        name="Test Transcript",
        source_kind=SourceKind.ROOM,
        recording_id=recording.id,
    )

    await transcripts_controller.remove_by_id(transcript.id)

    # Both should still exist in DB but with deleted_at set
    rec = await recordings_controller.get_by_id(recording.id)
    assert rec is not None
    assert rec.deleted_at is not None

    tr = await transcripts_controller.get_by_id(transcript.id)
    assert tr is not None
    assert tr.deleted_at is not None
