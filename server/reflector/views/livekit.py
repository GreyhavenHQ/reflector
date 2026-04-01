"""LiveKit webhook handler.

Processes LiveKit webhook events for participant tracking and
Track Egress recording completion.

LiveKit sends webhooks as POST requests with JWT authentication
in the Authorization header.
"""

from fastapi import APIRouter, HTTPException, Request

from reflector.db.meetings import meetings_controller
from reflector.livekit_api.webhooks import create_webhook_receiver, verify_webhook
from reflector.logger import logger as _logger
from reflector.settings import settings

router = APIRouter()

logger = _logger.bind(platform="livekit")

# Module-level receiver, lazily initialized on first webhook
_webhook_receiver = None


def _get_webhook_receiver():
    global _webhook_receiver
    if _webhook_receiver is None:
        if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
            raise ValueError("LiveKit not configured")
        _webhook_receiver = create_webhook_receiver(
            api_key=settings.LIVEKIT_API_KEY,
            api_secret=settings.LIVEKIT_WEBHOOK_SECRET or settings.LIVEKIT_API_SECRET,
        )
    return _webhook_receiver


@router.post("/webhook")
async def livekit_webhook(request: Request):
    """Handle LiveKit webhook events.

    LiveKit webhook events include:
    - participant_joined / participant_left
    - egress_started / egress_updated / egress_ended
    - room_started / room_finished
    - track_published / track_unpublished
    """
    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit not configured")

    body = await request.body()
    auth_header = request.headers.get("Authorization", "")

    receiver = _get_webhook_receiver()
    event = verify_webhook(receiver, body, auth_header)
    if event is None:
        logger.warning(
            "Invalid LiveKit webhook signature",
            has_auth=bool(auth_header),
            has_body=bool(body),
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event_type = event.event

    match event_type:
        case "participant_joined":
            await _handle_participant_joined(event)
        case "participant_left":
            await _handle_participant_left(event)
        case "egress_started":
            await _handle_egress_started(event)
        case "egress_ended":
            await _handle_egress_ended(event)
        case "room_started":
            logger.info(
                "Room started",
                room_name=event.room.name if event.room else None,
            )
        case "room_finished":
            logger.info(
                "Room finished",
                room_name=event.room.name if event.room else None,
            )
        case "track_published" | "track_unpublished":
            logger.debug(
                f"Track event: {event_type}",
                room_name=event.room.name if event.room else None,
                participant=event.participant.identity if event.participant else None,
            )
        case _:
            logger.debug(
                "Unhandled LiveKit webhook event",
                event_type=event_type,
            )

    return {"status": "ok"}


async def _handle_participant_joined(event):
    room_name = event.room.name if event.room else None
    participant = event.participant

    if not room_name or not participant:
        logger.warning("participant_joined: missing room or participant data")
        return

    meeting = await meetings_controller.get_by_room_name(room_name)
    if not meeting:
        logger.warning("participant_joined: meeting not found", room_name=room_name)
        return

    logger.info(
        "Participant joined",
        meeting_id=meeting.id,
        room_name=room_name,
        participant_identity=participant.identity,
        participant_sid=participant.sid,
    )


async def _handle_participant_left(event):
    room_name = event.room.name if event.room else None
    participant = event.participant

    if not room_name or not participant:
        logger.warning("participant_left: missing room or participant data")
        return

    meeting = await meetings_controller.get_by_room_name(room_name)
    if not meeting:
        logger.warning("participant_left: meeting not found", room_name=room_name)
        return

    logger.info(
        "Participant left",
        meeting_id=meeting.id,
        room_name=room_name,
        participant_identity=participant.identity,
        participant_sid=participant.sid,
    )


async def _handle_egress_started(event):
    egress = event.egress_info
    room_name = egress.room_name if egress else None

    logger.info(
        "Egress started",
        room_name=room_name,
        egress_id=egress.egress_id if egress else None,
    )


async def _handle_egress_ended(event):
    """Handle Track Egress completion — trigger multitrack processing."""
    egress = event.egress_info
    if not egress:
        logger.warning("egress_ended: no egress info in payload")
        return

    room_name = egress.room_name

    # Check egress status
    # EGRESS_COMPLETE = 3, EGRESS_FAILED = 4
    status = egress.status
    if status == 4:  # EGRESS_FAILED
        logger.error(
            "Egress failed",
            room_name=room_name,
            egress_id=egress.egress_id,
            error=egress.error,
        )
        return

    # Extract output file info from egress results
    file_results = list(egress.file_results)

    logger.info(
        "Egress ended",
        room_name=room_name,
        egress_id=egress.egress_id,
        status=status,
        num_files=len(file_results),
        filenames=[f.filename for f in file_results] if file_results else [],
    )

    # Track Egress produces one file per egress request.
    # The multitrack pipeline will be triggered separately once all tracks
    # for a room are collected (via periodic polling or explicit trigger).
    # TODO: Implement track collection and pipeline trigger
