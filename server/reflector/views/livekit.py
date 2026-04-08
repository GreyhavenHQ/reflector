"""LiveKit webhook handler.

Processes LiveKit webhook events for participant tracking and
Track Egress recording completion.

LiveKit sends webhooks as POST requests with JWT authentication
in the Authorization header.

Webhooks are used as fast-path triggers and logging. Track discovery
for the multitrack pipeline uses S3 listing (source of truth), not
webhook data.
"""

from fastapi import APIRouter, HTTPException, Request

from reflector.db.meetings import meetings_controller
from reflector.livekit_api.webhooks import create_webhook_receiver, verify_webhook
from reflector.logger import logger as _logger
from reflector.settings import settings
from reflector.storage import get_source_storage

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
            await _handle_room_finished(event)
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
    logger.info(
        "Egress started",
        room_name=egress.room_name if egress else None,
        egress_id=egress.egress_id if egress else None,
    )


async def _handle_egress_ended(event):
    """Handle Track Egress completion. Delete video files immediately to save storage.

    AutoTrackEgress records ALL tracks (audio + video). Audio is kept for the
    transcription pipeline. Video files are unused and deleted on completion.
    This saves ~50x storage (video is 98% of egress output for HD cameras).
    """
    egress = event.egress_info
    if not egress:
        logger.warning("egress_ended: no egress info in payload")
        return

    # EGRESS_FAILED = 4
    if egress.status == 4:
        logger.error(
            "Egress failed",
            room_name=egress.room_name,
            egress_id=egress.egress_id,
            error=egress.error,
        )
        return

    file_results = list(egress.file_results)
    logger.info(
        "Egress ended",
        room_name=egress.room_name,
        egress_id=egress.egress_id,
        status=egress.status,
        num_files=len(file_results),
        filenames=[f.filename for f in file_results] if file_results else [],
    )

    # Delete video files (.webm) immediately — only audio (.ogg) is needed for transcription.
    # Video tracks are 50-90x larger than audio and unused by the pipeline.
    # JSON manifests are kept (lightweight metadata, ~430 bytes each).
    for file_result in file_results:
        filename = file_result.filename
        if filename and filename.endswith(".webm"):
            try:
                storage = get_source_storage("livekit")
                await storage.delete_file(filename)
                logger.info(
                    "Deleted video egress file",
                    filename=filename,
                    room_name=egress.room_name,
                )
            except Exception as e:
                # Non-critical — pipeline filters these out anyway
                logger.warning(
                    "Failed to delete video egress file",
                    filename=filename,
                    error=str(e),
                )


async def _handle_room_finished(event):
    """Fast-path: trigger multitrack processing when room closes.

    This is an optimization — if missed, the process_livekit_ended_meetings
    beat task catches it within ~2 minutes.
    """
    room_name = event.room.name if event.room else None
    if not room_name:
        logger.warning("room_finished: no room name in payload")
        return

    logger.info("Room finished", room_name=room_name)

    meeting = await meetings_controller.get_by_room_name(room_name)
    if not meeting:
        logger.warning("room_finished: meeting not found", room_name=room_name)
        return

    # Deactivate the meeting — LiveKit room is destroyed, so process_meetings
    # can't detect this via API (list_participants returns empty for deleted rooms).
    if meeting.is_active:
        await meetings_controller.update_meeting(meeting.id, is_active=False)
        logger.info("room_finished: meeting deactivated", meeting_id=meeting.id)

    # Import here to avoid circular imports (worker imports views)
    from reflector.worker.process import process_livekit_multitrack

    process_livekit_multitrack.delay(
        room_name=room_name,
        meeting_id=meeting.id,
    )

    logger.info(
        "room_finished: queued multitrack processing",
        meeting_id=meeting.id,
        room_name=room_name,
    )
