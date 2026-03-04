"""Tests for audio mp3 endpoint token query-param authentication.

Covers both password (HS256) and JWT/Authentik (RS256) auth backends,
verifying that private transcripts can be accessed via ?token= query param.
"""

import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

OWNER_USER_ID = "test-owner-user-id"


def _create_hs256_token(user_id: str, secret: str, expired: bool = False) -> str:
    """Create an HS256 JWT like the password auth backend does."""
    delta = timedelta(minutes=-5) if expired else timedelta(hours=24)
    payload = {
        "sub": user_id,
        "email": "test@example.com",
        "exp": datetime.now(timezone.utc) + delta,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _generate_rsa_keypair():
    """Generate a fresh RSA keypair for tests."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return private_key, public_pem.decode()


def _create_rs256_token(
    authentik_uid: str,
    private_key,
    audience: str,
    expired: bool = False,
) -> str:
    """Create an RS256 JWT like Authentik would issue."""
    delta = timedelta(minutes=-5) if expired else timedelta(hours=1)
    payload = {
        "sub": authentik_uid,
        "email": "authentik-user@example.com",
        "aud": audience,
        "exp": datetime.now(timezone.utc) + delta,
    }
    return jwt.encode(payload, private_key, algorithm="RS256")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def private_transcript(tmpdir):
    """Create a private transcript owned by OWNER_USER_ID with an mp3 file.

    Created directly via the controller (not HTTP) so no auth override
    leaks into the test scope.
    """
    from reflector.db.transcripts import SourceKind, transcripts_controller
    from reflector.settings import settings

    settings.DATA_DIR = Path(tmpdir)

    transcript = await transcripts_controller.add(
        "Private audio test",
        source_kind=SourceKind.FILE,
        user_id=OWNER_USER_ID,
        share_mode="private",
    )
    await transcripts_controller.update(transcript, {"status": "ended"})

    # Copy a real mp3 to the expected location
    audio_filename = transcript.audio_mp3_filename
    mp3_source = Path(__file__).parent / "records" / "test_mathieu_hello.mp3"
    audio_filename.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(mp3_source, audio_filename)

    yield transcript


# ---------------------------------------------------------------------------
# Core access control tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audio_mp3_private_no_auth_returns_403(private_transcript, client):
    """Without auth, accessing a private transcript's audio returns 403."""
    response = await client.get(f"/transcripts/{private_transcript.id}/audio/mp3")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_audio_mp3_with_bearer_header(private_transcript, client):
    """Owner accessing audio via Authorization header works."""
    from reflector.app import app
    from reflector.auth import current_user_optional

    # Temporarily override to simulate the owner being authenticated
    app.dependency_overrides[current_user_optional] = lambda: {
        "sub": OWNER_USER_ID,
        "email": "test@example.com",
    }
    try:
        response = await client.get(f"/transcripts/{private_transcript.id}/audio/mp3")
    finally:
        del app.dependency_overrides[current_user_optional]

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"


@pytest.mark.asyncio
async def test_audio_mp3_public_transcript_no_auth_ok(tmpdir, client):
    """Public transcripts are accessible without any auth."""
    from reflector.db.transcripts import SourceKind, transcripts_controller
    from reflector.settings import settings

    settings.DATA_DIR = Path(tmpdir)

    transcript = await transcripts_controller.add(
        "Public audio test",
        source_kind=SourceKind.FILE,
        user_id=OWNER_USER_ID,
        share_mode="public",
    )
    await transcripts_controller.update(transcript, {"status": "ended"})

    audio_filename = transcript.audio_mp3_filename
    mp3_source = Path(__file__).parent / "records" / "test_mathieu_hello.mp3"
    audio_filename.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(mp3_source, audio_filename)

    response = await client.get(f"/transcripts/{transcript.id}/audio/mp3")
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"


# ---------------------------------------------------------------------------
# Password auth backend tests (?token= with HS256)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audio_mp3_password_token_query_param(private_transcript, client):
    """Password backend: valid HS256 ?token= grants access to private audio."""
    from reflector.auth.auth_password import UserInfo
    from reflector.settings import settings

    token = _create_hs256_token(OWNER_USER_ID, settings.SECRET_KEY)

    with patch("reflector.auth.verify_raw_token") as mock_verify:
        mock_verify.return_value = UserInfo(sub=OWNER_USER_ID, email="test@example.com")
        response = await client.get(
            f"/transcripts/{private_transcript.id}/audio/mp3?token={token}"
        )

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"


@pytest.mark.asyncio
async def test_audio_mp3_password_expired_token_returns_401(private_transcript, client):
    """Password backend: expired HS256 ?token= returns 401."""
    from reflector.settings import settings

    expired_token = _create_hs256_token(
        OWNER_USER_ID, settings.SECRET_KEY, expired=True
    )

    with patch("reflector.auth.verify_raw_token") as mock_verify:
        mock_verify.side_effect = jwt.ExpiredSignatureError("token expired")
        response = await client.get(
            f"/transcripts/{private_transcript.id}/audio/mp3" f"?token={expired_token}"
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_audio_mp3_password_wrong_user_returns_403(private_transcript, client):
    """Password backend: valid token for a different user returns 403."""
    from reflector.auth.auth_password import UserInfo
    from reflector.settings import settings

    token = _create_hs256_token("other-user-id", settings.SECRET_KEY)

    with patch("reflector.auth.verify_raw_token") as mock_verify:
        mock_verify.return_value = UserInfo(
            sub="other-user-id", email="other@example.com"
        )
        response = await client.get(
            f"/transcripts/{private_transcript.id}/audio/mp3?token={token}"
        )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_audio_mp3_invalid_token_returns_401(private_transcript, client):
    """Garbage token string returns 401."""
    with patch("reflector.auth.verify_raw_token") as mock_verify:
        mock_verify.return_value = None
        response = await client.get(
            f"/transcripts/{private_transcript.id}/audio/mp3" "?token=not-a-real-token"
        )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# JWT/Authentik auth backend tests (?token= with RS256)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audio_mp3_authentik_token_query_param(private_transcript, client):
    """Authentik backend: valid RS256 ?token= grants access to private audio."""
    from reflector.auth.auth_password import UserInfo

    private_key, _ = _generate_rsa_keypair()
    token = _create_rs256_token("authentik-abc123", private_key, "test-audience")

    with patch("reflector.auth.verify_raw_token") as mock_verify:
        # Authentik flow maps authentik_uid -> internal user id
        mock_verify.return_value = UserInfo(
            sub=OWNER_USER_ID, email="authentik-user@example.com"
        )
        response = await client.get(
            f"/transcripts/{private_transcript.id}/audio/mp3?token={token}"
        )

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"


@pytest.mark.asyncio
async def test_audio_mp3_authentik_expired_token_returns_401(
    private_transcript, client
):
    """Authentik backend: expired RS256 ?token= returns 401."""
    private_key, _ = _generate_rsa_keypair()
    expired_token = _create_rs256_token(
        "authentik-abc123", private_key, "test-audience", expired=True
    )

    with patch("reflector.auth.verify_raw_token") as mock_verify:
        mock_verify.side_effect = jwt.ExpiredSignatureError("token expired")
        response = await client.get(
            f"/transcripts/{private_transcript.id}/audio/mp3" f"?token={expired_token}"
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_audio_mp3_authentik_wrong_user_returns_403(private_transcript, client):
    """Authentik backend: valid RS256 token for different user returns 403."""
    from reflector.auth.auth_password import UserInfo

    private_key, _ = _generate_rsa_keypair()
    token = _create_rs256_token("authentik-other", private_key, "test-audience")

    with patch("reflector.auth.verify_raw_token") as mock_verify:
        mock_verify.return_value = UserInfo(
            sub="different-user-id", email="other@example.com"
        )
        response = await client.get(
            f"/transcripts/{private_transcript.id}/audio/mp3?token={token}"
        )

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# _generate_local_audio_link produces HS256 tokens — must be verifiable
# by any auth backend
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_local_audio_link_token_works_with_authentik_backend(
    private_transcript, client
):
    """_generate_local_audio_link creates an HS256 token via create_access_token.

    When the Authentik (RS256) auth backend is active, verify_raw_token uses
    JWTAuth which expects RS256 + public key. The HS256 token created by
    _generate_local_audio_link will fail verification, returning 401.

    This test documents the bug: the internal audio URL generated for the
    diarization pipeline is unusable under the JWT auth backend.
    """
    from urllib.parse import parse_qs, urlparse

    # Generate the internal audio link (uses create_access_token → HS256)
    url = private_transcript._generate_local_audio_link()
    parsed = urlparse(url)
    token = parse_qs(parsed.query)["token"][0]

    # Simulate what happens when the JWT/Authentik backend tries to verify
    # this HS256 token: JWTAuth.verify_token expects RS256, so it raises.
    with patch("reflector.auth.verify_raw_token") as mock_verify:
        mock_verify.side_effect = jwt.exceptions.InvalidAlgorithmError(
            "the specified alg value is not allowed"
        )
        response = await client.get(
            f"/transcripts/{private_transcript.id}/audio/mp3?token={token}"
        )

    # BUG: this should be 200 (the token was created by our own server),
    # but the Authentik backend rejects it because it's HS256, not RS256.
    assert response.status_code == 200
