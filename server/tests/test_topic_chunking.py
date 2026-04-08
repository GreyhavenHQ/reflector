import math

import pytest

from reflector.utils.transcript_constants import (
    compute_max_subjects,
    compute_topic_chunk_size,
)


@pytest.mark.parametrize(
    "duration_min,total_words,expected_topics_range",
    [
        (5, 750, (1, 3)),
        (10, 1500, (3, 6)),
        (30, 4500, (8, 14)),
        (60, 9000, (14, 22)),
        (120, 18000, (24, 35)),
        (180, 27000, (30, 42)),
    ],
)
def test_topic_count_in_expected_range(
    duration_min, total_words, expected_topics_range
):
    chunk_size = compute_topic_chunk_size(duration_min * 60, total_words)
    num_topics = math.ceil(total_words / chunk_size)
    assert expected_topics_range[0] <= num_topics <= expected_topics_range[1], (
        f"For {duration_min}min/{total_words}words: got {num_topics} topics "
        f"(chunk_size={chunk_size}), expected {expected_topics_range[0]}-{expected_topics_range[1]}"
    )


def test_chunk_size_within_bounds():
    for duration_min in [5, 10, 30, 60, 120, 180]:
        chunk_size = compute_topic_chunk_size(duration_min * 60, duration_min * 150)
        assert (
            375 <= chunk_size <= 1500
        ), f"For {duration_min}min: chunk_size={chunk_size} out of bounds [375, 1500]"


def test_zero_duration_falls_back():
    assert compute_topic_chunk_size(0, 1000) == 375


def test_zero_words_falls_back():
    assert compute_topic_chunk_size(600, 0) == 375


def test_negative_inputs_fall_back():
    assert compute_topic_chunk_size(-10, 1000) == 375
    assert compute_topic_chunk_size(600, -5) == 375


def test_very_short_transcript():
    """A 1-minute call with very few words should still produce at least 1 topic."""
    chunk_size = compute_topic_chunk_size(60, 100)
    # chunk_size is at least 375, so 100 words = 1 chunk
    assert chunk_size >= 375


def test_very_long_transcript():
    """A 4-hour call should cap at max topics."""
    chunk_size = compute_topic_chunk_size(4 * 3600, 36000)
    num_topics = math.ceil(36000 / chunk_size)
    assert num_topics <= 50


# --- compute_max_subjects tests ---


@pytest.mark.parametrize(
    "duration_seconds,expected_max",
    [
        (0, 1),  # zero/invalid → 1
        (-10, 1),  # negative → 1
        (60, 1),  # 1 min → 1
        (120, 1),  # 2 min → 1
        (300, 1),  # 5 min (boundary) → 1
        (301, 2),  # just over 5 min → 2
        (900, 2),  # 15 min (boundary) → 2
        (901, 3),  # just over 15 min → 3
        (1800, 3),  # 30 min (boundary) → 3
        (1801, 4),  # just over 30 min → 4
        (2700, 4),  # 45 min (boundary) → 4
        (2701, 5),  # just over 45 min → 5
        (3600, 5),  # 60 min (boundary) → 5
        (3601, 6),  # just over 60 min → 6
        (7200, 6),  # 2 hours → 6
        (14400, 6),  # 4 hours → 6
    ],
)
def test_max_subjects_scales_with_duration(duration_seconds, expected_max):
    assert compute_max_subjects(duration_seconds) == expected_max


def test_max_subjects_never_exceeds_cap():
    """Even very long recordings should cap at 6 subjects."""
    for hours in range(1, 10):
        assert compute_max_subjects(hours * 3600) <= 6
