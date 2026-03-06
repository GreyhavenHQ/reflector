"""Classify exceptions as non-retryable for Hatchet workflows.

When a task raises NonRetryableException (or an exception classified as
non-retryable and re-raised as such), Hatchet stops immediately — no further
retries. Used by with_error_handling to avoid wasting retries on config errors,
auth failures, corrupt data, etc.
"""

# Optional dependencies: only classify if the exception type is available.
# This avoids hard dependency on openai/av/botocore for code paths that don't use them.
try:
    import openai
except ImportError:
    openai = None  # type: ignore[assignment]

try:
    import av
except ImportError:
    av = None  # type: ignore[assignment]

try:
    from botocore.exceptions import ClientError as BotoClientError
except ImportError:
    BotoClientError = None  # type: ignore[misc, assignment]

from hatchet_sdk import NonRetryableException
from httpx import HTTPStatusError

from reflector.llm import LLMParseError

# HTTP status codes that won't change on retry (auth, not found, payment, payload)
NON_RETRYABLE_HTTP_STATUSES = {401, 402, 403, 404, 413}
NON_RETRYABLE_S3_CODES = {"AccessDenied", "NoSuchBucket", "NoSuchKey"}


def is_non_retryable(e: BaseException) -> bool:
    """Return True if the exception should stop Hatchet retries immediately.

    Hard failures (config, auth, missing resource, corrupt data) return True.
    Transient errors (timeouts, 5xx, 429, connection) return False.
    """
    if isinstance(e, NonRetryableException):
        return True

    # Config/input errors
    if isinstance(e, (ValueError, TypeError)):
        return True

    # HTTP status codes that won't change on retry
    if isinstance(e, HTTPStatusError):
        return e.response.status_code in NON_RETRYABLE_HTTP_STATUSES

    # OpenAI auth errors
    if openai is not None and isinstance(e, openai.AuthenticationError):
        return True

    # LLM parse failures (already retried internally)
    if isinstance(e, LLMParseError):
        return True

    # S3 permission/existence errors
    if BotoClientError is not None and isinstance(e, BotoClientError):
        code = e.response.get("Error", {}).get("Code", "")
        return code in NON_RETRYABLE_S3_CODES

    # Corrupt audio (PyAV) — AVError in some versions; fallback to InvalidDataError
    if av is not None:
        av_error = getattr(av, "AVError", None) or getattr(
            getattr(av, "error", None), "InvalidDataError", None
        )
        if av_error is not None and isinstance(e, av_error):
            return True

    return False
