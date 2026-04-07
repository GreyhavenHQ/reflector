"""
LiveKit webhook verification and event parsing.

LiveKit signs webhooks using the API secret as a JWT.
The WebhookReceiver from the SDK handles verification.
"""

from livekit.api import TokenVerifier, WebhookEvent, WebhookReceiver

from reflector.logger import logger


def create_webhook_receiver(api_key: str, api_secret: str) -> WebhookReceiver:
    """Create a WebhookReceiver for verifying LiveKit webhook signatures."""
    return WebhookReceiver(
        token_verifier=TokenVerifier(api_key=api_key, api_secret=api_secret)
    )


def verify_webhook(
    receiver: WebhookReceiver,
    body: str | bytes,
    auth_header: str,
) -> WebhookEvent | None:
    """Verify and parse a LiveKit webhook event.

    Returns the parsed WebhookEvent if valid, None if verification fails.
    Logs at different levels depending on failure type:
    - WARNING: invalid signature, expired token, malformed JWT (expected rejections)
    - ERROR: unexpected exceptions (potential bugs or attacks)
    """
    if isinstance(body, bytes):
        body = body.decode("utf-8")
    try:
        return receiver.receive(body, auth_header)
    except (ValueError, KeyError) as e:
        # Expected verification failures (bad JWT, wrong key, expired, malformed)
        logger.warning(
            "LiveKit webhook verification failed",
            error=str(e),
            error_type=type(e).__name__,
        )
        return None
    except Exception as e:
        # Unexpected errors — log at ERROR for visibility (potential attack or SDK bug)
        logger.error(
            "Unexpected error during LiveKit webhook verification",
            error=str(e),
            error_type=type(e).__name__,
            exc_info=True,
        )
        return None
