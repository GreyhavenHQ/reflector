from abc import ABC, abstractmethod
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, Optional

from ..schemas.platform import Platform
from ..utils.string import NonEmptyString
from .models import MeetingData, SessionData, VideoPlatformConfig

if TYPE_CHECKING:
    from reflector.db.rooms import Room

# separator doesn't guarantee there's no more "ROOM_PREFIX_SEPARATOR" strings in room name
ROOM_PREFIX_SEPARATOR = "-"


class VideoPlatformClient(ABC):
    PLATFORM_NAME: Platform

    def __init__(self, config: VideoPlatformConfig):
        self.config = config

    @abstractmethod
    async def create_meeting(
        self, room_name_prefix: NonEmptyString, end_date: datetime, room: "Room"
    ) -> MeetingData:
        pass

    @abstractmethod
    async def get_room_sessions(self, room_name: str) -> list[SessionData]:
        """Get session history for a room."""
        pass

    async def extend_meeting_expiration(
        self, room_name: str, end_date: datetime
    ) -> bool:
        """Push the platform-side room expiration to a later date.

        Called while a meeting is still running so participants can rejoin past
        the initially planned end date.

        No-op by default: Whereby has no room update API, and LiveKit rooms have
        no wall-clock expiry. Returns True when the platform expiry was updated.
        """
        return False

    @abstractmethod
    async def upload_logo(self, room_name: str, logo_path: str) -> bool:
        pass

    @abstractmethod
    def verify_webhook_signature(
        self, body: bytes, signature: str, timestamp: Optional[str] = None
    ) -> bool:
        pass

    def format_recording_config(self, room: "Room") -> Dict[str, Any]:
        if room.recording_type == "cloud" and self.config.s3_bucket:
            return {
                "type": room.recording_type,
                "bucket": self.config.s3_bucket,
                "region": self.config.s3_region,
                "trigger": room.recording_trigger,
            }
        return {"type": room.recording_type}
