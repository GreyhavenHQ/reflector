"""
LiveKit video platform client for Reflector.

Self-hosted, open-source alternative to Daily.co.
Uses Track Egress for per-participant audio recording (no composite video).
"""

from datetime import datetime, timezone
from urllib.parse import urlencode
from uuid import uuid4

from reflector.db.rooms import Room
from reflector.livekit_api.client import LiveKitApiClient
from reflector.livekit_api.webhooks import create_webhook_receiver, verify_webhook
from reflector.logger import logger
from reflector.settings import settings

from ..schemas.platform import Platform
from ..utils.string import NonEmptyString
from .base import ROOM_PREFIX_SEPARATOR, VideoPlatformClient
from .models import MeetingData, SessionData, VideoPlatformConfig


class LiveKitClient(VideoPlatformClient):
    PLATFORM_NAME: Platform = "livekit"
    TIMESTAMP_FORMAT = "%Y%m%d%H%M%S"

    def __init__(self, config: VideoPlatformConfig):
        super().__init__(config)
        self._api_client = LiveKitApiClient(
            url=config.api_url or "",
            api_key=config.api_key,
            api_secret=config.webhook_secret,  # LiveKit uses API secret for both auth and webhooks
            s3_bucket=config.s3_bucket,
            s3_region=config.s3_region,
            s3_access_key=config.aws_access_key_id,
            s3_secret_key=config.aws_access_key_secret,
            s3_endpoint=settings.LIVEKIT_STORAGE_AWS_ENDPOINT_URL,
        )
        self._webhook_receiver = create_webhook_receiver(
            api_key=config.api_key,
            api_secret=config.webhook_secret,
        )

    async def create_meeting(
        self, room_name_prefix: NonEmptyString, end_date: datetime, room: Room
    ) -> MeetingData:
        """Create a LiveKit room for this meeting.

        LiveKit rooms are created explicitly via API. A new room is created
        for each Reflector meeting (same pattern as Daily.co).
        """
        now = datetime.now(timezone.utc)
        timestamp = now.strftime(self.TIMESTAMP_FORMAT)
        room_name = f"{room_name_prefix}{ROOM_PREFIX_SEPARATOR}{timestamp}"

        # Calculate empty_timeout from end_date (seconds until expiry)
        # Ensure end_date is timezone-aware for subtraction
        end_date_aware = (
            end_date if end_date.tzinfo else end_date.replace(tzinfo=timezone.utc)
        )
        remaining = int((end_date_aware - now).total_seconds())
        empty_timeout = max(300, min(remaining, 86400))  # 5 min to 24 hours

        # Enable auto track egress for cloud recording (per-participant audio to S3).
        # Gracefully degrade if S3 credentials are missing — room still works, just no recording.
        enable_recording = room.recording_type == "cloud"
        egress_enabled = False
        if enable_recording:
            try:
                self._api_client._build_s3_upload()  # Validate credentials exist
                egress_enabled = True
            except ValueError:
                logger.warning(
                    "S3 credentials not configured — room created without auto track egress. "
                    "Set LIVEKIT_STORAGE_AWS_* to enable recording.",
                    room_name=room_name,
                )

        lk_room = await self._api_client.create_room(
            name=room_name,
            empty_timeout=empty_timeout,
            enable_auto_track_egress=egress_enabled,
        )

        logger.info(
            "LiveKit room created",
            room_name=lk_room.name,
            room_sid=lk_room.sid,
            empty_timeout=empty_timeout,
            auto_track_egress=egress_enabled,
        )

        # room_url includes the server URL + room name as query param.
        # The join endpoint in rooms.py appends the token as another query param.
        # Frontend parses: ws://host:7880?room=<name>&token=<jwt>
        public_url = settings.LIVEKIT_PUBLIC_URL or settings.LIVEKIT_URL or ""
        room_url = f"{public_url}?{urlencode({'room': lk_room.name})}"

        return MeetingData(
            meeting_id=lk_room.sid or str(uuid4()),
            room_name=lk_room.name,
            room_url=room_url,
            host_room_url=room_url,
            platform=self.PLATFORM_NAME,
            extra_data={"livekit_room_sid": lk_room.sid},
        )

    async def get_room_sessions(self, room_name: str) -> list[SessionData]:
        """Get current participants in a LiveKit room.

        For historical sessions, we rely on webhook-stored data (same as Daily).
        This returns currently-connected participants.
        """
        try:
            participants = await self._api_client.list_participants(room_name)
            return [
                SessionData(
                    session_id=p.sid,
                    started_at=datetime.fromtimestamp(
                        p.joined_at if p.joined_at else 0, tz=timezone.utc
                    ),
                    ended_at=None,  # Still active
                )
                for p in participants
                if p.sid  # Skip empty entries
            ]
        except Exception as e:
            logger.debug(
                "Could not list LiveKit participants (room may not exist)",
                room_name=room_name,
                error=str(e),
            )
            return []

    async def upload_logo(self, room_name: str, logo_path: str) -> bool:
        # LiveKit doesn't have a logo upload concept; handled in frontend theming
        return True

    def verify_webhook_signature(
        self, body: bytes, signature: str, timestamp: str | None = None
    ) -> bool:
        """Verify LiveKit webhook signature.

        LiveKit sends the JWT in the Authorization header. The `signature`
        param here receives the Authorization header value.
        """
        event = verify_webhook(self._webhook_receiver, body, signature)
        return event is not None

    def create_access_token(
        self,
        room_name: str,
        participant_identity: str,
        participant_name: str | None = None,
        is_admin: bool = False,
    ) -> str:
        """Generate a LiveKit access token for a participant."""
        return self._api_client.create_access_token(
            room_name=room_name,
            participant_identity=participant_identity,
            participant_name=participant_name,
            room_admin=is_admin,
        )

    async def start_track_egress(
        self,
        room_name: str,
        track_sid: str,
        s3_filepath: str,
    ):
        """Start Track Egress for a single audio track."""
        return await self._api_client.start_track_egress(
            room_name=room_name,
            track_sid=track_sid,
            s3_filepath=s3_filepath,
        )

    async def list_egress(self, room_name: str | None = None):
        return await self._api_client.list_egress(room_name=room_name)

    async def stop_egress(self, egress_id: str):
        return await self._api_client.stop_egress(egress_id=egress_id)

    async def close(self):
        await self._api_client.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
