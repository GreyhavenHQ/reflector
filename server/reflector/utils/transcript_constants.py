"""
Shared transcript processing constants.

Used by both Hatchet workflows and Celery pipelines for consistent processing.
"""

import math

# Topic detection: legacy static chunk size, used as fallback
TOPIC_CHUNK_WORD_COUNT = 300

# Dynamic chunking curve parameters
# Formula: target_topics = _COEFFICIENT * duration_minutes ^ _EXPONENT
# Derived from anchors: 5 min -> 3 topics, 180 min -> 40 topics
_TOPIC_CURVE_COEFFICIENT = 0.833
_TOPIC_CURVE_EXPONENT = 0.723
_MIN_TOPICS = 2
_MAX_TOPICS = 50
_MIN_CHUNK_WORDS = 375
_MAX_CHUNK_WORDS = 1500


def compute_topic_chunk_size(duration_seconds: float, total_words: int) -> int:
    """Calculate optimal chunk size for topic detection based on recording duration.

    Uses a power-curve function to scale topic count sublinearly with duration,
    producing fewer LLM calls for longer recordings while maintaining topic quality.

    Returns the number of words per chunk.
    """
    if total_words <= 0 or duration_seconds <= 0:
        return _MIN_CHUNK_WORDS

    duration_minutes = duration_seconds / 60.0
    target_topics = _TOPIC_CURVE_COEFFICIENT * math.pow(
        duration_minutes, _TOPIC_CURVE_EXPONENT
    )
    target_topics = int(round(max(_MIN_TOPICS, min(_MAX_TOPICS, target_topics))))

    chunk_size = total_words // target_topics
    chunk_size = max(_MIN_CHUNK_WORDS, min(_MAX_CHUNK_WORDS, chunk_size))
    return chunk_size
