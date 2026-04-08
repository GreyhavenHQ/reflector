"""Tests for conditional Celery beat schedule registration.

Verifies that beat tasks are only registered when their corresponding
services are configured (WHEREBY_API_KEY, DAILY_API_KEY, etc.).
"""

import pytest

from reflector.worker.app import build_beat_schedule


# Override autouse fixtures from conftest — these tests don't need database or websockets
@pytest.fixture(autouse=True)
def setup_database():
    yield


@pytest.fixture(autouse=True)
def ws_manager_in_memory():
    yield


@pytest.fixture(autouse=True)
def reset_hatchet_client():
    yield


# Task name sets for each group
WHEREBY_TASKS = {"process_messages", "reprocess_failed_recordings"}
DAILY_TASKS = {
    "poll_daily_recordings",
    "trigger_daily_reconciliation",
    "reprocess_failed_daily_recordings",
}
LIVEKIT_TASKS = {
    "process_livekit_ended_meetings",
    "reprocess_failed_livekit_recordings",
}
PLATFORM_TASKS = {
    "process_meetings",
    "sync_all_ics_calendars",
    "create_upcoming_meetings",
}


class TestNoPlatformConfigured:
    """When no video platform is configured, no platform tasks should be registered."""

    def test_no_platform_tasks(self):
        schedule = build_beat_schedule()
        task_names = set(schedule.keys())
        assert not task_names & WHEREBY_TASKS
        assert not task_names & DAILY_TASKS
        assert not task_names & LIVEKIT_TASKS
        assert not task_names & PLATFORM_TASKS

    def test_only_healthcheck_disabled_warning(self):
        """With no config at all, schedule should be empty (healthcheck needs URL)."""
        schedule = build_beat_schedule()
        assert len(schedule) == 0

    def test_healthcheck_only(self):
        schedule = build_beat_schedule(healthcheck_url="https://hc.example.com/ping")
        assert set(schedule.keys()) == {"healthcheck_ping"}

    def test_public_mode_only(self):
        schedule = build_beat_schedule(public_mode=True)
        assert set(schedule.keys()) == {"cleanup_old_public_data"}


class TestWherebyOnly:
    """When only Whereby is configured."""

    def test_whereby_api_key(self):
        schedule = build_beat_schedule(whereby_api_key="test-key")
        task_names = set(schedule.keys())
        assert WHEREBY_TASKS <= task_names
        assert PLATFORM_TASKS <= task_names
        assert not task_names & DAILY_TASKS
        assert not task_names & LIVEKIT_TASKS

    def test_whereby_sqs_url(self):
        schedule = build_beat_schedule(
            aws_process_recording_queue_url="https://sqs.us-east-1.amazonaws.com/123/queue"
        )
        task_names = set(schedule.keys())
        assert WHEREBY_TASKS <= task_names
        assert PLATFORM_TASKS <= task_names
        assert not task_names & DAILY_TASKS
        assert not task_names & LIVEKIT_TASKS

    def test_whereby_task_count(self):
        schedule = build_beat_schedule(whereby_api_key="test-key")
        # Whereby (2) + Platform (3) = 5
        assert len(schedule) == 5


class TestDailyOnly:
    """When only Daily.co is configured."""

    def test_daily_api_key(self):
        schedule = build_beat_schedule(daily_api_key="test-daily-key")
        task_names = set(schedule.keys())
        assert DAILY_TASKS <= task_names
        assert PLATFORM_TASKS <= task_names
        assert not task_names & WHEREBY_TASKS
        assert not task_names & LIVEKIT_TASKS

    def test_daily_task_count(self):
        schedule = build_beat_schedule(daily_api_key="test-daily-key")
        # Daily (3) + Platform (3) = 6
        assert len(schedule) == 6


class TestLiveKitOnly:
    """When only LiveKit is configured."""

    def test_livekit_keys(self):
        schedule = build_beat_schedule(
            livekit_api_key="test-lk-key", livekit_url="ws://livekit:7880"
        )
        task_names = set(schedule.keys())
        assert LIVEKIT_TASKS <= task_names
        assert PLATFORM_TASKS <= task_names
        assert not task_names & WHEREBY_TASKS
        assert not task_names & DAILY_TASKS

    def test_livekit_task_count(self):
        schedule = build_beat_schedule(
            livekit_api_key="test-lk-key", livekit_url="ws://livekit:7880"
        )
        # LiveKit (2) + Platform (3) = 5
        assert len(schedule) == 5

    def test_livekit_needs_both_key_and_url(self):
        schedule_key_only = build_beat_schedule(livekit_api_key="test-lk-key")
        schedule_url_only = build_beat_schedule(livekit_url="ws://livekit:7880")
        assert not set(schedule_key_only.keys()) & LIVEKIT_TASKS
        assert not set(schedule_url_only.keys()) & LIVEKIT_TASKS


class TestBothPlatforms:
    """When both Whereby and Daily.co are configured."""

    def test_all_tasks_registered(self):
        schedule = build_beat_schedule(
            whereby_api_key="test-key",
            daily_api_key="test-daily-key",
        )
        task_names = set(schedule.keys())
        assert WHEREBY_TASKS <= task_names
        assert DAILY_TASKS <= task_names
        assert PLATFORM_TASKS <= task_names

    def test_combined_task_count(self):
        schedule = build_beat_schedule(
            whereby_api_key="test-key",
            daily_api_key="test-daily-key",
        )
        # Whereby (2) + Daily (3) + Platform (3) = 8
        assert len(schedule) == 8


class TestConditionalFlags:
    """Test PUBLIC_MODE and HEALTHCHECK_URL interact correctly with platform tasks."""

    def test_all_flags_enabled(self):
        schedule = build_beat_schedule(
            whereby_api_key="test-key",
            daily_api_key="test-daily-key",
            public_mode=True,
            healthcheck_url="https://hc.example.com/ping",
        )
        task_names = set(schedule.keys())
        assert "cleanup_old_public_data" in task_names
        assert "healthcheck_ping" in task_names
        assert WHEREBY_TASKS <= task_names
        assert DAILY_TASKS <= task_names
        assert PLATFORM_TASKS <= task_names
        # Whereby (2) + Daily (3) + Platform (3) + cleanup (1) + healthcheck (1) = 10
        assert len(schedule) == 10

    def test_public_mode_with_whereby(self):
        schedule = build_beat_schedule(
            whereby_api_key="test-key",
            public_mode=True,
        )
        task_names = set(schedule.keys())
        assert "cleanup_old_public_data" in task_names
        assert WHEREBY_TASKS <= task_names
        assert PLATFORM_TASKS <= task_names

    def test_healthcheck_with_daily(self):
        schedule = build_beat_schedule(
            daily_api_key="test-daily-key",
            healthcheck_url="https://hc.example.com/ping",
        )
        task_names = set(schedule.keys())
        assert "healthcheck_ping" in task_names
        assert DAILY_TASKS <= task_names
        assert PLATFORM_TASKS <= task_names


class TestTaskDefinitions:
    """Verify task definitions have correct structure."""

    def test_whereby_task_paths(self):
        schedule = build_beat_schedule(whereby_api_key="test-key")
        assert (
            schedule["process_messages"]["task"]
            == "reflector.worker.process.process_messages"
        )
        assert (
            schedule["reprocess_failed_recordings"]["task"]
            == "reflector.worker.process.reprocess_failed_recordings"
        )

    def test_daily_task_paths(self):
        schedule = build_beat_schedule(daily_api_key="test-daily-key")
        assert (
            schedule["poll_daily_recordings"]["task"]
            == "reflector.worker.process.poll_daily_recordings"
        )
        assert (
            schedule["trigger_daily_reconciliation"]["task"]
            == "reflector.worker.process.trigger_daily_reconciliation"
        )
        assert (
            schedule["reprocess_failed_daily_recordings"]["task"]
            == "reflector.worker.process.reprocess_failed_daily_recordings"
        )

    def test_platform_task_paths(self):
        schedule = build_beat_schedule(daily_api_key="test-daily-key")
        assert (
            schedule["process_meetings"]["task"]
            == "reflector.worker.process.process_meetings"
        )
        assert (
            schedule["sync_all_ics_calendars"]["task"]
            == "reflector.worker.ics_sync.sync_all_ics_calendars"
        )
        assert (
            schedule["create_upcoming_meetings"]["task"]
            == "reflector.worker.ics_sync.create_upcoming_meetings"
        )

    def test_all_tasks_have_schedule(self):
        """Every registered task must have a 'schedule' key."""
        schedule = build_beat_schedule(
            whereby_api_key="test-key",
            daily_api_key="test-daily-key",
            public_mode=True,
            healthcheck_url="https://hc.example.com/ping",
        )
        for name, config in schedule.items():
            assert "schedule" in config, f"Task '{name}' missing 'schedule' key"
            assert "task" in config, f"Task '{name}' missing 'task' key"


class TestEmptyStringValues:
    """Empty strings should be treated as not configured (falsy)."""

    def test_empty_whereby_key(self):
        schedule = build_beat_schedule(whereby_api_key="")
        assert not set(schedule.keys()) & WHEREBY_TASKS

    def test_empty_daily_key(self):
        schedule = build_beat_schedule(daily_api_key="")
        assert not set(schedule.keys()) & DAILY_TASKS

    def test_empty_sqs_url(self):
        schedule = build_beat_schedule(aws_process_recording_queue_url="")
        assert not set(schedule.keys()) & WHEREBY_TASKS

    def test_none_values(self):
        schedule = build_beat_schedule(
            whereby_api_key=None,
            daily_api_key=None,
            aws_process_recording_queue_url=None,
        )
        assert len(schedule) == 0
