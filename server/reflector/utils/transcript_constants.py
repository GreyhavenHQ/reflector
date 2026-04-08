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


# Subject extraction: scale max subjects with recording duration
# Short calls get fewer subjects to avoid over-analyzing trivial content
_SUBJECT_DURATION_THRESHOLDS = [
    (5 * 60, 1),  # ≤ 5 min  → 1 subject
    (15 * 60, 2),  # ≤ 15 min → 2 subjects
    (30 * 60, 3),  # ≤ 30 min → 3 subjects
    (45 * 60, 4),  # ≤ 45 min → 4 subjects
    (60 * 60, 5),  # ≤ 60 min → 5 subjects
]
_MAX_SUBJECTS = 6


def compute_max_subjects(duration_seconds: float) -> int:
    """Calculate maximum number of subjects to extract based on recording duration.

    Uses a step function: short recordings get fewer subjects to avoid
    generating excessive detail for trivial content.
    """
    if duration_seconds <= 0:
        return 1

    for threshold, max_subjects in _SUBJECT_DURATION_THRESHOLDS:
        if duration_seconds <= threshold:
            return max_subjects

    return _MAX_SUBJECTS
