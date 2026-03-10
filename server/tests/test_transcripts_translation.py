import pytest

from reflector.settings import settings


@pytest.mark.asyncio
async def test_transcript_create_default_translation(monkeypatch, client):
    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test
    response = await client.post("/transcripts", json={"name": "test en"})
    assert response.status_code == 200
    assert response.json()["name"] == "test en"
    assert response.json()["source_language"] == "en"
    assert response.json()["target_language"] == "en"
    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["name"] == "test en"
    assert response.json()["source_language"] == "en"
    assert response.json()["target_language"] == "en"


@pytest.mark.asyncio
async def test_transcript_create_en_fr_translation(monkeypatch, client):
    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test
    response = await client.post(
        "/transcripts", json={"name": "test en/fr", "target_language": "fr"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "test en/fr"
    assert response.json()["source_language"] == "en"
    assert response.json()["target_language"] == "fr"
    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["name"] == "test en/fr"
    assert response.json()["source_language"] == "en"
    assert response.json()["target_language"] == "fr"


@pytest.mark.asyncio
async def test_transcript_create_fr_en_translation(monkeypatch, client):
    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test
    response = await client.post(
        "/transcripts", json={"name": "test fr/en", "source_language": "fr"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "test fr/en"
    assert response.json()["source_language"] == "fr"
    assert response.json()["target_language"] == "en"
    tid = response.json()["id"]

    response = await client.get(f"/transcripts/{tid}")
    assert response.status_code == 200
    assert response.json()["name"] == "test fr/en"
    assert response.json()["source_language"] == "fr"
    assert response.json()["target_language"] == "en"
