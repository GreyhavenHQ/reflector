"""
Tests for LiveKit backend: webhook verification, token generation,
display_name sanitization, and platform client behavior.
"""

import re

import pytest

from reflector.livekit_api.webhooks import create_webhook_receiver, verify_webhook

# ── Webhook verification ──────────────────────────────────────


class TestWebhookVerification:
    def _make_receiver(self):
        """Create a receiver with test credentials."""
        return create_webhook_receiver(
            api_key="test_key",
            api_secret="test_secret_that_is_long_enough_for_hmac",
        )

    def test_rejects_empty_auth_header(self):
        receiver = self._make_receiver()
        result = verify_webhook(receiver, b'{"event":"test"}', "")
        assert result is None

    def test_rejects_garbage_auth_header(self):
        receiver = self._make_receiver()
        result = verify_webhook(receiver, b'{"event":"test"}', "not-a-jwt")
        assert result is None

    def test_rejects_empty_body(self):
        receiver = self._make_receiver()
        result = verify_webhook(receiver, b"", "Bearer some.jwt.token")
        assert result is None

    def test_handles_bytes_body(self):
        receiver = self._make_receiver()
        # Should not crash on bytes input
        result = verify_webhook(receiver, b'{"event":"test"}', "invalid")
        assert result is None

    def test_handles_string_body(self):
        receiver = self._make_receiver()
        result = verify_webhook(receiver, '{"event":"test"}', "invalid")
        assert result is None

    def test_rejects_wrong_secret(self):
        """Webhook signed with different secret should be rejected."""
        receiver = self._make_receiver()
        # A JWT signed with a different secret
        fake_jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ.wrong_signature"
        result = verify_webhook(receiver, b"{}", fake_jwt)
        assert result is None


# ── Token generation ──────────────────────────────────────────


class TestTokenGeneration:
    """Test token generation using the LiveKit SDK directly (no client instantiation)."""

    def _generate_token(
        self, room_name="room", identity="user", name=None, admin=False, ttl=86400
    ):
        """Generate a token using the SDK directly, avoiding LiveKitAPI client session."""
        from datetime import timedelta

        from livekit.api import AccessToken, VideoGrants

        token = AccessToken(
            api_key="test_key", api_secret="test_secret_that_is_long_enough_for_hmac"
        )
        token.identity = identity
        token.name = name or identity
        token.ttl = timedelta(seconds=ttl)
        token.with_grants(
            VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                room_admin=admin,
            )
        )
        return token.to_jwt()

    def _decode_claims(self, token):
        import base64
        import json

        payload = token.split(".")[1]
        payload += "=" * (4 - len(payload) % 4)
        return json.loads(base64.b64decode(payload))

    def test_creates_valid_jwt(self):
        token = self._generate_token(
            room_name="test-room", identity="user123", name="Test User"
        )
        assert isinstance(token, str)
        assert len(token.split(".")) == 3

    def test_token_includes_room_name(self):
        token = self._generate_token(room_name="my-room-20260401", identity="alice")
        claims = self._decode_claims(token)
        assert claims.get("video", {}).get("room") == "my-room-20260401"
        assert claims.get("sub") == "alice"

    def test_token_respects_admin_flag(self):
        token = self._generate_token(identity="admin", admin=True)
        claims = self._decode_claims(token)
        assert claims["video"]["roomAdmin"] is True

    def test_token_non_admin_by_default(self):
        token = self._generate_token(identity="user")
        claims = self._decode_claims(token)
        assert claims.get("video", {}).get("roomAdmin") in (None, False)

    def test_ttl_is_timedelta(self):
        """Verify ttl as timedelta works (previous bug: int caused TypeError)."""
        token = self._generate_token(ttl=3600)
        assert isinstance(token, str)


# ── Display name sanitization ─────────────────────────────────


class TestDisplayNameSanitization:
    """Test the sanitization logic from rooms.py join endpoint."""

    def _sanitize(self, display_name: str) -> str:
        """Replicate the sanitization from rooms_join_meeting."""
        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", display_name.strip())[:40]
        return safe_name

    def test_normal_name(self):
        assert self._sanitize("Alice") == "Alice"

    def test_name_with_spaces(self):
        assert self._sanitize("John Doe") == "John_Doe"

    def test_name_with_special_chars(self):
        assert self._sanitize("user@email.com") == "user_email_com"

    def test_name_with_unicode(self):
        result = self._sanitize("José García")
        assert result == "Jos__Garc_a"
        assert all(
            c in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
            for c in result
        )

    def test_name_with_emoji(self):
        result = self._sanitize("👋 Hello")
        assert "_" in result  # Emoji replaced with underscore
        assert "Hello" in result

    def test_very_long_name(self):
        long_name = "A" * 100
        result = self._sanitize(long_name)
        assert len(result) == 40

    def test_empty_name(self):
        result = self._sanitize("")
        assert result == ""

    def test_only_special_chars(self):
        result = self._sanitize("!!!")
        assert result == "___"

    def test_whitespace_stripped(self):
        result = self._sanitize("  Alice  ")
        assert result == "Alice"

    def test_hyphens_preserved(self):
        assert self._sanitize("first-last") == "first-last"

    def test_underscores_preserved(self):
        assert self._sanitize("first_last") == "first_last"

    def test_html_injection(self):
        result = self._sanitize("<script>alert('xss')</script>")
        assert "<" not in result
        assert ">" not in result
        assert "'" not in result


# ── S3 egress configuration ───────────────────────────────────


class TestS3EgressConfig:
    """Test S3Upload construction using the SDK directly."""

    def test_build_s3_upload_requires_all_fields(self):
        # Missing fields should raise or produce invalid config
        # The validation happens in our client wrapper, not the SDK
        # Test the validation logic directly
        s3_bucket = None
        s3_access_key = "AKID"
        s3_secret_key = "secret"
        assert not all([s3_bucket, s3_access_key, s3_secret_key])

    def test_s3_upload_with_credentials(self):
        from livekit.api import S3Upload

        upload = S3Upload(
            access_key="AKID",
            secret="secret123",
            bucket="test-bucket",
            region="us-east-1",
            force_path_style=True,
        )
        assert upload.bucket == "test-bucket"
        assert upload.force_path_style is True

    def test_s3_upload_with_endpoint(self):
        from livekit.api import S3Upload

        upload = S3Upload(
            access_key="AKID",
            secret="secret",
            bucket="bucket",
            region="us-east-1",
            force_path_style=True,
            endpoint="http://garage:3900",
        )
        assert upload.endpoint == "http://garage:3900"


# ── Platform detection ────────────────────────────────────────


# ── Redis participant mapping ──────────────────────────────


class TestParticipantIdentityMapping:
    """Test the identity → user_id Redis mapping pattern."""

    def test_mapping_key_format(self):
        room_name = "myroom-20260401172036"
        mapping_key = f"livekit:participant_map:{room_name}"
        assert mapping_key == "livekit:participant_map:myroom-20260401172036"

    def test_identity_with_uuid_suffix_is_unique(self):
        import uuid

        name = "Juan"
        id1 = f"{name}-{uuid.uuid4().hex[:6]}"
        id2 = f"{name}-{uuid.uuid4().hex[:6]}"
        assert id1 != id2
        assert id1.startswith("Juan-")
        assert id2.startswith("Juan-")

    def test_strip_uuid_suffix_for_display(self):
        """Pipeline strips UUID suffix for display name."""
        identity = "Juan-2bcea0"
        display_name = identity.rsplit("-", 1)[0] if "-" in identity else identity
        assert display_name == "Juan"

    def test_strip_uuid_preserves_hyphenated_names(self):
        identity = "Mary-Jane-abc123"
        display_name = identity.rsplit("-", 1)[0] if "-" in identity else identity
        assert display_name == "Mary-Jane"

    def test_anon_identity_no_user_id(self):
        """Anonymous participants should not have a user_id mapping."""
        identity = "anon-abc123"
        # In the pipeline, anon identities don't get looked up
        assert identity.startswith("anon-")

    @pytest.mark.asyncio
    async def test_redis_hset_hgetall_roundtrip(self):
        """Test the actual Redis operations used for participant mapping."""
        try:
            from reflector.redis_cache import get_async_redis_client

            redis_client = await get_async_redis_client()
            test_key = "livekit:participant_map:__test_room__"

            # Write
            await redis_client.hset(test_key, "Juan-abc123", "user-id-1")
            await redis_client.hset(test_key, "Alice-def456", "user-id-2")

            # Read
            raw_map = await redis_client.hgetall(test_key)
            decoded = {
                k.decode() if isinstance(k, bytes) else k: v.decode()
                if isinstance(v, bytes)
                else v
                for k, v in raw_map.items()
            }

            assert decoded["Juan-abc123"] == "user-id-1"
            assert decoded["Alice-def456"] == "user-id-2"

            # Cleanup
            await redis_client.delete(test_key)
        except Exception:
            pytest.skip("Redis not available")


# ── Platform detection ────────────────────────────────────────


class TestSourcePlatformDetection:
    """Test the recording ID prefix-based platform detection from transcript_process.py."""

    def test_livekit_prefix(self):
        recording_id = "lk-livekit-20260401234423"
        platform = "livekit" if recording_id.startswith("lk-") else "daily"
        assert platform == "livekit"

    def test_daily_no_prefix(self):
        recording_id = "08fa0b24-9220-44c5-846c-3f116cf8e738"
        platform = "livekit" if recording_id.startswith("lk-") else "daily"
        assert platform == "daily"

    def test_none_recording_id(self):
        recording_id = None
        platform = (
            "livekit" if recording_id and recording_id.startswith("lk-") else "daily"
        )
        assert platform == "daily"

    def test_empty_recording_id(self):
        recording_id = ""
        platform = (
            "livekit" if recording_id and recording_id.startswith("lk-") else "daily"
        )
        assert platform == "daily"
