"""
Integration test fixtures — no mocks, real services.

All services (PostgreSQL, Redis, Hatchet, Garage, server, workers) are
expected to be running via docker-compose.integration.yml.
"""

import asyncio
import os
from pathlib import Path

import boto3
import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine

SERVER_URL = os.environ.get("SERVER_URL", "http://server:1250")
GARAGE_ENDPOINT = os.environ.get("GARAGE_ENDPOINT", "http://garage:3900")
MAILPIT_URL = os.environ.get("MAILPIT_URL", "http://mailpit:8025")
DATABASE_URL = os.environ.get(
    "DATABASE_URL_ASYNC",
    os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://reflector:reflector@postgres:5432/reflector",
    ),
)
GARAGE_KEY_ID = os.environ.get("TRANSCRIPT_STORAGE_AWS_ACCESS_KEY_ID", "")
GARAGE_KEY_SECRET = os.environ.get("TRANSCRIPT_STORAGE_AWS_SECRET_ACCESS_KEY", "")
BUCKET_NAME = "reflector-media"


@pytest_asyncio.fixture
async def api_client():
    """HTTP client pointed at the running server."""
    async with httpx.AsyncClient(
        base_url=f"{SERVER_URL}/v1",
        timeout=httpx.Timeout(30.0),
    ) as client:
        yield client


@pytest.fixture(scope="session")
def s3_client():
    """Boto3 S3 client pointed at Garage."""
    return boto3.client(
        "s3",
        endpoint_url=GARAGE_ENDPOINT,
        aws_access_key_id=GARAGE_KEY_ID,
        aws_secret_access_key=GARAGE_KEY_SECRET,
        region_name="garage",
    )


@pytest_asyncio.fixture
async def db_engine():
    """SQLAlchemy async engine for direct DB operations."""
    engine = create_async_engine(DATABASE_URL)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="session")
def test_records_dir():
    """Path to the test audio files directory."""
    return Path(__file__).parent.parent / "records"


@pytest.fixture(scope="session")
def bucket_name():
    """S3 bucket name used for integration tests."""
    return BUCKET_NAME


async def _poll_transcript_status(
    client: httpx.AsyncClient,
    transcript_id: str,
    target: str | tuple[str, ...],
    error: str = "error",
    max_wait: int = 300,
    interval: int = 3,
) -> dict:
    """
    Poll GET /transcripts/{id} until status matches target or error.

    target can be a single status string or a tuple of acceptable statuses.
    Returns the transcript dict on success, raises on timeout or error status.
    """
    targets = (target,) if isinstance(target, str) else target
    elapsed = 0
    status = None
    while elapsed < max_wait:
        resp = await client.get(f"/transcripts/{transcript_id}")
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status")

        if status in targets:
            return data
        if status == error:
            raise AssertionError(
                f"Transcript {transcript_id} reached error status: {data}"
            )

        await asyncio.sleep(interval)
        elapsed += interval

    raise TimeoutError(
        f"Transcript {transcript_id} did not reach status '{target}' "
        f"within {max_wait}s (last status: {status})"
    )


@pytest_asyncio.fixture
def poll_transcript_status():
    """Returns the poll_transcript_status async helper function."""
    return _poll_transcript_status


@pytest_asyncio.fixture
async def mailpit_client():
    """HTTP client for Mailpit API — query captured emails."""
    async with httpx.AsyncClient(
        base_url=MAILPIT_URL,
        timeout=httpx.Timeout(10.0),
    ) as client:
        # Clear inbox before each test
        await client.delete("/api/v1/messages")
        yield client


async def _poll_mailpit_messages(
    mailpit: httpx.AsyncClient,
    to_email: str,
    max_wait: int = 30,
    interval: int = 2,
) -> list[dict]:
    """
    Poll Mailpit API until at least one message is delivered to the given address.
    Returns the list of matching messages.
    """
    elapsed = 0
    while elapsed < max_wait:
        resp = await mailpit.get("/api/v1/messages", params={"query": f"to:{to_email}"})
        resp.raise_for_status()
        data = resp.json()
        messages = data.get("messages", [])
        if messages:
            return messages
        await asyncio.sleep(interval)
        elapsed += interval
    raise TimeoutError(f"No email delivered to {to_email} within {max_wait}s")


@pytest_asyncio.fixture
def poll_mailpit_messages():
    """Returns the poll_mailpit_messages async helper function."""
    return _poll_mailpit_messages
