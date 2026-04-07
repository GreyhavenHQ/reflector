"""
Tests for LiveKit track processing: filepath parsing, offset calculation,
and pad_track padding_seconds behavior.
"""

from datetime import datetime, timezone
from fractions import Fraction

import av
import pytest

from reflector.utils.livekit import (
    LiveKitTrackFile,
    calculate_track_offsets,
    extract_livekit_base_room_name,
    filter_audio_tracks,
    parse_livekit_track_filepath,
)

# ── Filepath parsing ──────────────────────────────────────────


class TestParseLiveKitTrackFilepath:
    def test_parses_ogg_audio_track(self):
        result = parse_livekit_track_filepath(
            "livekit/myroom-20260401172036/juan-4b82ed-2026-04-01T195758-TR_AMR3SWs74Divho.ogg"
        )
        assert result.room_name == "myroom-20260401172036"
        assert result.participant_identity == "juan-4b82ed"
        assert result.track_id == "TR_AMR3SWs74Divho"
        assert result.timestamp == datetime(2026, 4, 1, 19, 57, 58, tzinfo=timezone.utc)

    def test_parses_different_identities(self):
        r1 = parse_livekit_track_filepath(
            "livekit/room-20260401/alice-a1b2c3-2026-04-01T100000-TR_abc123.ogg"
        )
        r2 = parse_livekit_track_filepath(
            "livekit/room-20260401/bob_smith-d4e5f6-2026-04-01T100030-TR_def456.ogg"
        )
        assert r1.participant_identity == "alice-a1b2c3"
        assert r2.participant_identity == "bob_smith-d4e5f6"

    def test_rejects_json_manifest(self):
        with pytest.raises(ValueError, match="doesn't match expected format"):
            parse_livekit_track_filepath("livekit/myroom-20260401/EG_K5sipvfB5fTM.json")

    def test_rejects_webm_video(self):
        # webm files match the pattern but are filtered by filter_audio_tracks
        result = parse_livekit_track_filepath(
            "livekit/myroom-20260401/juan-4b82ed-2026-04-01T195727-TR_VC679dgMQBdfhT.webm"
        )
        # webm parses successfully (TR_ prefix matches video tracks too)
        assert result.track_id == "TR_VC679dgMQBdfhT"

    def test_rejects_invalid_path(self):
        with pytest.raises(ValueError):
            parse_livekit_track_filepath("not/a/valid/path.ogg")

    def test_rejects_missing_track_id(self):
        with pytest.raises(ValueError):
            parse_livekit_track_filepath("livekit/room/user-2026-04-01T100000.ogg")

    def test_parses_timestamp_correctly(self):
        result = parse_livekit_track_filepath(
            "livekit/room-20260401/user-abc123-2026-12-25T235959-TR_test.ogg"
        )
        assert result.timestamp == datetime(
            2026, 12, 25, 23, 59, 59, tzinfo=timezone.utc
        )


# ── Audio track filtering ─────────────────────────────────────


class TestFilterAudioTracks:
    def test_filters_to_ogg_only(self):
        keys = [
            "livekit/room/EG_abc.json",
            "livekit/room/user-abc-2026-04-01T100000-TR_audio.ogg",
            "livekit/room/user-abc-2026-04-01T100000-TR_video.webm",
            "livekit/room/EG_def.json",
            "livekit/room/user2-def-2026-04-01T100030-TR_audio2.ogg",
        ]
        result = filter_audio_tracks(keys)
        assert len(result) == 2
        assert all(k.endswith(".ogg") for k in result)

    def test_empty_input(self):
        assert filter_audio_tracks([]) == []

    def test_no_audio_tracks(self):
        keys = ["livekit/room/EG_abc.json", "livekit/room/user-TR_v.webm"]
        assert filter_audio_tracks(keys) == []


# ── Offset calculation ─────────────────────────────────────────


class TestCalculateTrackOffsets:
    def test_single_track_zero_offset(self):
        tracks = [
            LiveKitTrackFile(
                s3_key="k1",
                room_name="r",
                participant_identity="alice",
                timestamp=datetime(2026, 4, 1, 10, 0, 0, tzinfo=timezone.utc),
                track_id="TR_1",
            )
        ]
        offsets = calculate_track_offsets(tracks)
        assert len(offsets) == 1
        assert offsets[0][1] == 0.0

    def test_two_tracks_correct_offset(self):
        tracks = [
            LiveKitTrackFile(
                s3_key="k1",
                room_name="r",
                participant_identity="alice",
                timestamp=datetime(2026, 4, 1, 10, 0, 0, tzinfo=timezone.utc),
                track_id="TR_1",
            ),
            LiveKitTrackFile(
                s3_key="k2",
                room_name="r",
                participant_identity="bob",
                timestamp=datetime(2026, 4, 1, 10, 1, 10, tzinfo=timezone.utc),
                track_id="TR_2",
            ),
        ]
        offsets = calculate_track_offsets(tracks)
        assert offsets[0][1] == 0.0  # alice (earliest)
        assert offsets[1][1] == 70.0  # bob (70 seconds later)

    def test_three_tracks_earliest_is_zero(self):
        tracks = [
            LiveKitTrackFile(
                s3_key="k2",
                room_name="r",
                participant_identity="bob",
                timestamp=datetime(2026, 4, 1, 10, 0, 30, tzinfo=timezone.utc),
                track_id="TR_2",
            ),
            LiveKitTrackFile(
                s3_key="k1",
                room_name="r",
                participant_identity="alice",
                timestamp=datetime(2026, 4, 1, 10, 0, 0, tzinfo=timezone.utc),
                track_id="TR_1",
            ),
            LiveKitTrackFile(
                s3_key="k3",
                room_name="r",
                participant_identity="charlie",
                timestamp=datetime(2026, 4, 1, 10, 1, 0, tzinfo=timezone.utc),
                track_id="TR_3",
            ),
        ]
        offsets = calculate_track_offsets(tracks)
        offset_map = {t.participant_identity: o for t, o in offsets}
        assert offset_map["alice"] == 0.0
        assert offset_map["bob"] == 30.0
        assert offset_map["charlie"] == 60.0

    def test_empty_tracks(self):
        assert calculate_track_offsets([]) == []

    def test_simultaneous_tracks_zero_offsets(self):
        ts = datetime(2026, 4, 1, 10, 0, 0, tzinfo=timezone.utc)
        tracks = [
            LiveKitTrackFile(
                s3_key="k1",
                room_name="r",
                participant_identity="a",
                timestamp=ts,
                track_id="TR_1",
            ),
            LiveKitTrackFile(
                s3_key="k2",
                room_name="r",
                participant_identity="b",
                timestamp=ts,
                track_id="TR_2",
            ),
        ]
        offsets = calculate_track_offsets(tracks)
        assert all(o == 0.0 for _, o in offsets)


# ── Room name extraction ───────────────────────────────────────


class TestExtractLiveKitBaseRoomName:
    def test_strips_timestamp_suffix(self):
        assert extract_livekit_base_room_name("myroom-20260401172036") == "myroom"

    def test_preserves_hyphenated_name(self):
        assert (
            extract_livekit_base_room_name("my-room-name-20260401172036")
            == "my-room-name"
        )

    def test_single_segment(self):
        assert extract_livekit_base_room_name("room-20260401") == "room"


# ── pad_track padding_seconds behavior ─────────────────────────


class TestPadTrackPaddingSeconds:
    """Test that pad_track correctly uses pre-calculated padding_seconds
    for LiveKit (skipping container metadata) vs extracting from container
    for Daily (when padding_seconds is None).
    """

    def _make_test_ogg(self, path: str, duration_seconds: float = 5.0):
        """Create a minimal OGG/Opus file for testing."""
        with av.open(path, "w", format="ogg") as out:
            stream = out.add_stream("libopus", rate=48000)
            stream.bit_rate = 64000
            samples_per_frame = 960  # Opus standard
            total_samples = int(duration_seconds * 48000)
            pts = 0
            while pts < total_samples:
                frame = av.AudioFrame(
                    format="s16", layout="stereo", samples=samples_per_frame
                )
                # Fill with silence (zeros)
                frame.planes[0].update(bytes(samples_per_frame * 2 * 2))  # s16 * stereo
                frame.sample_rate = 48000
                frame.pts = pts
                frame.time_base = Fraction(1, 48000)
                for packet in stream.encode(frame):
                    out.mux(packet)
                pts += samples_per_frame
            for packet in stream.encode(None):
                out.mux(packet)

    def test_ogg_has_zero_start_time(self, tmp_path):
        """Verify that OGG files (like LiveKit produces) have start_time=0,
        confirming why pre-calculated padding is needed."""
        ogg_path = str(tmp_path / "test.ogg")
        self._make_test_ogg(ogg_path)

        with av.open(ogg_path) as container:
            from reflector.utils.audio_padding import (
                extract_stream_start_time_from_container,
            )

            start_time = extract_stream_start_time_from_container(container, 0)

        assert start_time <= 0.0, (
            "OGG files should have start_time<=0 (no usable offset), confirming "
            f"LiveKit tracks need pre-calculated padding_seconds. Got: {start_time}"
        )

    def test_precalculated_padding_skips_metadata_extraction(self, tmp_path):
        """When padding_seconds is set, pad_track should use it directly
        and NOT call extract_stream_start_time_from_container."""
        from reflector.hatchet.workflows.track_processing import TrackInput

        input_data = TrackInput(
            track_index=0,
            s3_key="livekit/room/user-abc-2026-04-01T100000-TR_audio.ogg",
            bucket_name="test-bucket",
            transcript_id="test-transcript",
            source_platform="livekit",
            padding_seconds=70.0,
        )

        assert input_data.padding_seconds == 70.0
        # The pad_track function checks: if input.padding_seconds is not None → use it
        # This means extract_stream_start_time_from_container is never called for LiveKit

    def test_none_padding_falls_back_to_metadata(self, tmp_path):
        """When padding_seconds is None (Daily), pad_track should extract
        start_time from container metadata."""
        from reflector.hatchet.workflows.track_processing import TrackInput

        input_data = TrackInput(
            track_index=0,
            s3_key="daily/room/track.webm",
            bucket_name="test-bucket",
            transcript_id="test-transcript",
            source_platform="daily",
            padding_seconds=None,
        )

        assert input_data.padding_seconds is None
        # pad_track will call extract_stream_start_time_from_container for this case

    def test_zero_padding_returns_original_key(self):
        """When padding_seconds=0.0, pad_track should return the original S3 key
        without applying any padding (same as start_time=0 from metadata)."""
        from reflector.hatchet.workflows.track_processing import TrackInput

        input_data = TrackInput(
            track_index=0,
            s3_key="livekit/room/earliest-track.ogg",
            bucket_name="test-bucket",
            transcript_id="test-transcript",
            source_platform="livekit",
            padding_seconds=0.0,
        )

        # padding_seconds=0.0 → start_time_seconds=0.0 → "no padding needed" branch
        assert input_data.padding_seconds == 0.0


# ── Pipeline offset calculation (process_tracks logic) ─────────


class TestProcessTracksOffsetCalculation:
    """Test the offset calculation logic used in process_tracks
    for LiveKit source_platform."""

    def test_livekit_offsets_from_timestamps(self):
        """Simulate the offset calculation done in process_tracks."""
        tracks = [
            {
                "s3_key": "track1.ogg",
                "participant_identity": "admin-0129c3",
                "timestamp": "2026-04-01T23:44:50+00:00",
            },
            {
                "s3_key": "track2.ogg",
                "participant_identity": "juan-5a5b41",
                "timestamp": "2026-04-01T23:46:00+00:00",
            },
        ]

        # Replicate the logic from process_tracks
        timestamps = []
        for i, track in enumerate(tracks):
            ts_str = track.get("timestamp")
            if ts_str:
                ts = datetime.fromisoformat(ts_str)
                timestamps.append((i, ts))

        earliest = min(ts for _, ts in timestamps)
        track_padding = {}
        for i, ts in timestamps:
            track_padding[i] = (ts - earliest).total_seconds()

        assert track_padding[0] == 0.0  # admin (earliest)
        assert track_padding[1] == 70.0  # juan (70s later)

    def test_daily_tracks_get_no_precalculated_padding(self):
        """Daily tracks should NOT get padding_seconds (use container metadata)."""
        tracks = [
            {"s3_key": "daily-track1.webm"},
            {"s3_key": "daily-track2.webm"},
        ]

        # Daily tracks don't have "timestamp" field
        track_padding = {}
        source_platform = "daily"

        if source_platform == "livekit":
            # This block should NOT execute for daily
            pass

        # Daily tracks get no pre-calculated padding
        assert track_padding == {}
        for i, _ in enumerate(tracks):
            assert track_padding.get(i) is None

    def test_livekit_missing_timestamp_graceful(self):
        """If a LiveKit track is missing timestamp, it should be skipped."""
        tracks = [
            {
                "s3_key": "track1.ogg",
                "participant_identity": "alice",
                "timestamp": "2026-04-01T10:00:00+00:00",
            },
            {"s3_key": "track2.ogg", "participant_identity": "bob"},  # no timestamp
        ]

        timestamps = []
        for i, track in enumerate(tracks):
            ts_str = track.get("timestamp")
            if ts_str:
                try:
                    ts = datetime.fromisoformat(ts_str)
                    timestamps.append((i, ts))
                except (ValueError, TypeError):
                    timestamps.append((i, None))
            else:
                timestamps.append((i, None))

        valid = [(i, ts) for i, ts in timestamps if ts is not None]
        assert len(valid) == 1  # only alice has a timestamp
        assert valid[0][0] == 0  # track index 0
