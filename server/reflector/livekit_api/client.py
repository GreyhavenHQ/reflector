"""
LiveKit API client wrapping the official livekit-api Python SDK.

Handles room management, access tokens, and Track Egress for
per-participant audio recording to S3-compatible storage.
"""

from datetime import timedelta

from livekit.api import (
    AccessToken,
    CreateRoomRequest,
    DeleteRoomRequest,
    DirectFileOutput,
    EgressInfo,
    ListEgressRequest,
    ListParticipantsRequest,
    LiveKitAPI,
    Room,
    S3Upload,
    StopEgressRequest,
    TrackEgressRequest,
    VideoGrants,
)


class LiveKitApiClient:
    """Thin wrapper around LiveKitAPI for Reflector's needs."""

    def __init__(
        self,
        url: str,
        api_key: str,
        api_secret: str,
        s3_bucket: str | None = None,
        s3_region: str | None = None,
        s3_access_key: str | None = None,
        s3_secret_key: str | None = None,
        s3_endpoint: str | None = None,
    ):
        self._url = url
        self._api_key = api_key
        self._api_secret = api_secret
        self._s3_bucket = s3_bucket
        self._s3_region = s3_region or "us-east-1"
        self._s3_access_key = s3_access_key
        self._s3_secret_key = s3_secret_key
        self._s3_endpoint = s3_endpoint
        self._api = LiveKitAPI(url=url, api_key=api_key, api_secret=api_secret)

    # ── Room management ──────────────────────────────────────────

    async def create_room(
        self,
        name: str,
        empty_timeout: int = 300,
        max_participants: int = 0,
    ) -> Room:
        """Create a LiveKit room.

        Args:
            name: Room name (unique identifier).
            empty_timeout: Seconds to keep room alive after last participant leaves.
            max_participants: 0 = unlimited.
        """
        req = CreateRoomRequest(
            name=name,
            empty_timeout=empty_timeout,
            max_participants=max_participants,
        )
        return await self._api.room.create_room(req)

    async def delete_room(self, room_name: str) -> None:
        await self._api.room.delete_room(DeleteRoomRequest(room=room_name))

    async def list_participants(self, room_name: str):
        resp = await self._api.room.list_participants(
            ListParticipantsRequest(room=room_name)
        )
        return resp.participants

    # ── Access tokens ────────────────────────────────────────────

    def create_access_token(
        self,
        room_name: str,
        participant_identity: str,
        participant_name: str | None = None,
        can_publish: bool = True,
        can_subscribe: bool = True,
        room_admin: bool = False,
        ttl_seconds: int = 86400,
    ) -> str:
        """Generate a JWT access token for a participant."""
        token = AccessToken(
            api_key=self._api_key,
            api_secret=self._api_secret,
        )
        token.identity = participant_identity
        token.name = participant_name or participant_identity
        token.ttl = timedelta(seconds=ttl_seconds)
        token.with_grants(
            VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=can_publish,
                can_subscribe=can_subscribe,
                room_admin=room_admin,
            )
        )
        return token.to_jwt()

    # ── Track Egress (per-participant audio recording) ───────────

    def _build_s3_upload(self) -> S3Upload:
        """Build S3Upload config for egress output."""
        if not all([self._s3_bucket, self._s3_access_key, self._s3_secret_key]):
            raise ValueError(
                "S3 storage not configured for LiveKit egress. "
                "Set LIVEKIT_STORAGE_AWS_* environment variables."
            )
        kwargs = {
            "access_key": self._s3_access_key,
            "secret": self._s3_secret_key,
            "bucket": self._s3_bucket,
            "region": self._s3_region,
            "force_path_style": True,  # Required for Garage/MinIO
        }
        if self._s3_endpoint:
            kwargs["endpoint"] = self._s3_endpoint
        return S3Upload(**kwargs)

    async def start_track_egress(
        self,
        room_name: str,
        track_sid: str,
        s3_filepath: str,
    ) -> EgressInfo:
        """Start Track Egress for a single audio track (writes OGG/Opus to S3).

        Args:
            room_name: LiveKit room name.
            track_sid: Track SID to record.
            s3_filepath: S3 key path for the output file.
        """
        req = TrackEgressRequest(
            room_name=room_name,
            track_id=track_sid,
            file=DirectFileOutput(
                filepath=s3_filepath,
                s3=self._build_s3_upload(),
            ),
        )
        return await self._api.egress.start_track_egress(req)

    async def list_egress(self, room_name: str | None = None) -> list[EgressInfo]:
        req = ListEgressRequest()
        if room_name:
            req.room_name = room_name
        resp = await self._api.egress.list_egress(req)
        return list(resp.items)

    async def stop_egress(self, egress_id: str) -> EgressInfo:
        return await self._api.egress.stop_egress(
            StopEgressRequest(egress_id=egress_id)
        )

    # ── Cleanup ──────────────────────────────────────────────────

    async def close(self):
        await self._api.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
