"""Tests for app-level endpoints (root, not under /v1)."""

import pytest


@pytest.mark.asyncio
async def test_health_endpoint_returns_healthy():
    """GET /health returns 200 and {"status": "healthy"} for probes and CI."""
    from httpx import AsyncClient

    from reflector.app import app

    # Health is at app root, not under /v1
    async with AsyncClient(app=app, base_url="http://test") as root_client:
        response = await root_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
