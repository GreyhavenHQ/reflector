"""
LiveKit track file utilities.

Parse participant identity and timing from Auto Track Egress S3 filepaths.

Actual filepath format from LiveKit Auto Track Egress:
  livekit/{room_name}/{publisher_identity}-{ISO_timestamp}-{track_id}.{ext}

Examples:
  livekit/myroom-20260401172036/juan-4b82ed-2026-04-01T195758-TR_AMR3SWs74Divho.ogg
  livekit/myroom-20260401172036/juan2-63abcf-2026-04-01T195847-TR_AMyoSbM7tAQbYj.ogg
  livekit/myroom-20260401172036/EG_K5sipvfB5fTM.json  (manifest, skip)
  livekit/myroom-20260401172036/juan-4b82ed-2026-04-01T195727-TR_VC679dgMQBdfhT.webm  (video, skip)
"""

import re
from dataclasses import dataclass
from datetime import datetime, timezone

from reflector.utils.string import NonEmptyString


@dataclass
class LiveKitTrackFile:
    """Parsed info from a LiveKit track egress filepath."""

    s3_key: str
    room_name: str
    participant_identity: str
    timestamp: datetime  # Parsed from ISO timestamp in filename
    track_id: str  # LiveKit track ID (e.g., TR_AMR3SWs74Divho)


# Pattern: livekit/{room_name}/{identity}-{ISO_date}T{time}-{track_id}.{ext}
# The identity can contain alphanumeric, hyphens, underscores
# ISO timestamp is like 2026-04-01T195758
# Track ID starts with TR_
_TRACK_FILENAME_PATTERN = re.compile(
    r"^livekit/(?P<room_name>[^/]+)/(?P<identity>.+?)-(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{6})-(?P<track_id>TR_\w+)\.(?P<ext>\w+)$"
)


def parse_livekit_track_filepath(s3_key: str) -> LiveKitTrackFile:
    """Parse a LiveKit track egress filepath into components.

    Args:
        s3_key: S3 key like 'livekit/myroom-20260401/juan-4b82ed-2026-04-01T195758-TR_AMR3SWs74Divho.ogg'

    Returns:
        LiveKitTrackFile with parsed components.

    Raises:
        ValueError: If the filepath doesn't match the expected format.
    """
    match = _TRACK_FILENAME_PATTERN.match(s3_key)
    if not match:
        raise ValueError(
            f"LiveKit track filepath doesn't match expected format: {s3_key}"
        )

    # Parse ISO-ish timestamp (e.g., 2026-04-01T195758 → datetime)
    ts_str = match.group("timestamp")
    try:
        ts = datetime.strptime(ts_str, "%Y-%m-%dT%H%M%S").replace(tzinfo=timezone.utc)
    except ValueError:
        raise ValueError(f"Cannot parse timestamp '{ts_str}' from: {s3_key}")

    return LiveKitTrackFile(
        s3_key=s3_key,
        room_name=match.group("room_name"),
        participant_identity=match.group("identity"),
        timestamp=ts,
        track_id=match.group("track_id"),
    )


def filter_audio_tracks(s3_keys: list[str]) -> list[str]:
    """Filter S3 keys to only audio tracks (.ogg), excluding manifests and video."""
    return [k for k in s3_keys if k.endswith(".ogg")]


def calculate_track_offsets(
    tracks: list[LiveKitTrackFile],
) -> list[tuple[LiveKitTrackFile, float]]:
    """Calculate silence padding offset for each track.

    The earliest track starts at time zero. Each subsequent track
    gets (track_timestamp - earliest_timestamp) seconds of silence prepended.

    Returns:
        List of (track, offset_seconds) tuples.
    """
    if not tracks:
        return []

    earliest = min(t.timestamp for t in tracks)
    return [(t, (t.timestamp - earliest).total_seconds()) for t in tracks]


def extract_livekit_base_room_name(livekit_room_name: str) -> NonEmptyString:
    """Extract base room name from LiveKit timestamped room name.

    LiveKit rooms use the same naming as Daily: {base_name}-YYYYMMDDHHMMSS
    """
    base_name = livekit_room_name.rsplit("-", 1)[0]
    assert base_name, f"Extracted base name is empty from: {livekit_room_name}"
    return NonEmptyString(base_name)


def recording_lock_key(room_name: str) -> str:
    """Redis lock key for preventing duplicate processing."""
    return f"livekit:processing:{room_name}"
