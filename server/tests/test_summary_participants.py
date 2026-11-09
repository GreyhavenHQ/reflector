"""
Tests for LLM participant identification and persistence.

Covers:
- resolve_participant_speaker: parsing speaker IDs from LLM output
- SummaryBuilder.identify_participants: populating identified_participants
- TranscriptFinalSummaryProcessor: emitting identified participants
- PipelineMainBase.on_participants: persisting participants to the DB
"""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from reflector.processors.summary.summary_builder import (
    ParticipantInfo,
    ParticipantsResponse,
    SummaryBuilder,
    resolve_participant_speaker,
)


def _make_builder() -> SummaryBuilder:
    llm = MagicMock()
    llm.model_name = "TEST MODEL"
    return SummaryBuilder(llm=llm)


# --- resolve_participant_speaker (pure) -------------------------------------


def test_resolve_explicit_speaker_id_strips_suffix():
    assert resolve_participant_speaker("Joss (Speaker 0)", speaker_id=0) == ("Joss", 0)


def test_resolve_explicit_speaker_id_plain_name():
    assert resolve_participant_speaker("Joss", speaker_id=2) == ("Joss", 2)


def test_resolve_explicit_speaker_id_placeholder_name():
    # A "Speaker N" name with an explicit id is still an unknown speaker.
    assert resolve_participant_speaker("Speaker 2", speaker_id=2) == (None, 2)


def test_resolve_suffix_without_speaker_id():
    assert resolve_participant_speaker("Noel (Speaker 2)") == ("Noel", 2)


def test_resolve_suffix_empty_prefix():
    assert resolve_participant_speaker("(Speaker 1)") == (None, 1)


def test_resolve_speaker_only_unknown_name():
    assert resolve_participant_speaker("Speaker 3") == (None, 3)


def test_resolve_plain_name_no_speaker():
    assert resolve_participant_speaker("Clément") == ("Clément", None)


def test_resolve_empty_and_none():
    assert resolve_participant_speaker("") == (None, None)
    assert resolve_participant_speaker(None) == (None, None)


# --- SummaryBuilder.identify_participants -----------------------------------


@pytest.mark.asyncio
async def test_identify_participants_populates_identified():
    builder = _make_builder()
    builder.set_transcript("Speaker 0: hello\nSpeaker 1: hi\nSpeaker 2: there")
    response = ParticipantsResponse(
        participants=[
            ParticipantInfo(name="Joss (Speaker 0)", is_speaker=True, speaker_id=0),
            ParticipantInfo(name="Rémi (Speaker 1)", is_speaker=True, speaker_id=1),
            ParticipantInfo(name="Speaker 2", is_speaker=True, speaker_id=2),
            ParticipantInfo(name="Only Mentioned", is_speaker=False, speaker_id=None),
        ],
        total_speakers=3,
        mentioned_only=["Clément "],
    )
    with patch.object(
        builder, "_get_structured_response", AsyncMock(return_value=response)
    ):
        await builder.identify_participants()

    # Unknown speaker (Speaker 2) and mentioned-only are excluded.
    assert builder.identified_participants == [("Joss", 0), ("Rémi", 1)]


@pytest.mark.asyncio
async def test_identify_participants_empty_when_no_speakers():
    builder = _make_builder()
    builder.set_transcript("Speaker 0: hello")
    response = ParticipantsResponse(
        participants=[
            ParticipantInfo(name="Only Mentioned", is_speaker=False, speaker_id=None)
        ],
        total_speakers=1,
        mentioned_only=[],
    )
    with patch.object(
        builder, "_get_structured_response", AsyncMock(return_value=response)
    ):
        await builder.identify_participants()

    assert builder.identified_participants == []


# --- TranscriptFinalSummaryProcessor emit -----------------------------------


@pytest.mark.asyncio
async def test_processor_emits_identified_participants():
    from reflector.processors.transcript_final_summary import (
        TranscriptFinalSummaryProcessor,
    )
    from reflector.processors.types import TitleSummary, Transcript, Word

    transcript = SimpleNamespace(participants=[])
    captured: dict = {}
    processor = TranscriptFinalSummaryProcessor(transcript=transcript)
    # get_summary_builder is patched below, so set the tracked participants directly
    processor._identified_participants = [("Joss", 0), ("Rémi", 1)]

    async def capture_participants(data):
        captured["participants"] = data

    processor.on(capture_participants, name="participants")

    mock_builder = MagicMock()
    mock_builder.identified_participants = [("Joss", 0), ("Rémi", 1)]
    mock_builder.action_items = None
    mock_builder.as_markdown = MagicMock(return_value="# Summary")
    mock_builder.recap = "Recap"

    topic = TitleSummary(
        title="Topic",
        summary="sum",
        timestamp=0,
        duration=1,
        transcript=Transcript(words=[Word(text="hello", start=0, end=1, speaker=0)]),
    )

    with patch.object(
        processor, "get_summary_builder", AsyncMock(return_value=mock_builder)
    ):
        await processor.push(topic)
        await processor.flush()

    assert captured.get("participants") is not None
    assert set(captured["participants"]) == {("Joss", 0), ("Rémi", 1)}


@pytest.mark.asyncio
async def test_processor_does_not_emit_when_no_identified():
    from reflector.processors.transcript_final_summary import (
        TranscriptFinalSummaryProcessor,
    )
    from reflector.processors.types import TitleSummary, Transcript, Word

    transcript = SimpleNamespace(participants=[])
    captured: dict = {}
    processor = TranscriptFinalSummaryProcessor(transcript=transcript)

    async def capture_participants(data):
        captured["participants"] = data

    processor.on(capture_participants, name="participants")

    mock_builder = MagicMock()
    mock_builder.identified_participants = []
    mock_builder.action_items = None
    mock_builder.as_markdown = MagicMock(return_value="# Summary")
    mock_builder.recap = "Recap"

    topic = TitleSummary(
        title="Topic",
        summary="sum",
        timestamp=0,
        duration=1,
        transcript=Transcript(words=[Word(text="hello", start=0, end=1, speaker=0)]),
    )

    with patch.object(
        processor, "get_summary_builder", AsyncMock(return_value=mock_builder)
    ):
        await processor.push(topic)
        await processor.flush()

    assert "participants" not in captured


# --- PipelineMainBase.on_participants (DB) ----------------------------------


@pytest.mark.asyncio
async def test_on_participants_persists(client, tmpdir):
    from reflector.db.transcripts import transcripts_controller
    from reflector.pipelines.main_file_pipeline import PipelineMainFile
    from reflector.settings import settings

    settings.DATA_DIR = Path(tmpdir)

    response = await client.post("/transcripts", json={"name": "test participants"})
    assert response.status_code == 200
    tid = response.json()["id"]

    pipeline = PipelineMainFile(transcript_id=tid)
    await pipeline.on_participants([("Joss", 0), ("Rémi", 1)])

    transcript = await transcripts_controller.get_by_id(tid)
    names = {p.speaker: p.name for p in transcript.participants}
    assert names == {0: "Joss", 1: "Rémi"}


@pytest.mark.asyncio
async def test_on_participants_empty_is_noop(client, tmpdir):
    from reflector.db.transcripts import transcripts_controller
    from reflector.pipelines.main_file_pipeline import PipelineMainFile
    from reflector.settings import settings

    settings.DATA_DIR = Path(tmpdir)

    response = await client.post(
        "/transcripts", json={"name": "test participants noop"}
    )
    assert response.status_code == 200
    tid = response.json()["id"]

    pipeline = PipelineMainFile(transcript_id=tid)
    await pipeline.on_participants([])

    transcript = await transcripts_controller.get_by_id(tid)
    assert not transcript.participants
