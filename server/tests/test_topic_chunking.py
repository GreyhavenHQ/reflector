import math

import pytest

from reflector.utils.transcript_constants import compute_topic_chunk_size


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
