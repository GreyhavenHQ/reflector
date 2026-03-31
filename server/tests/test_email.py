"""Tests for reflector.email — transcript email composition and sending."""

from unittest.mock import AsyncMock, patch

import pytest

from reflector.db.transcripts import (
    SourceKind,
    Transcript,
    TranscriptParticipant,
    TranscriptTopic,
)
from reflector.email import (
    _build_html,
    _build_plain_text,
    get_transcript_url,
    send_transcript_email,
)
from reflector.processors.types import Word


def _make_transcript(
    *,
    title: str | None = "Weekly Standup",
    short_summary: str | None = "Team discussed sprint progress.",
    with_topics: bool = True,
    share_mode: str = "private",
    source_kind: SourceKind = SourceKind.FILE,
) -> Transcript:
    topics = []
    participants = []
    if with_topics:
        participants = [
            TranscriptParticipant(id="p1", speaker=0, name="Alice"),
            TranscriptParticipant(id="p2", speaker=1, name="Bob"),
        ]
        topics = [
            TranscriptTopic(
                title="Intro",
                summary="Greetings",
                timestamp=0.0,
                duration=10.0,
                words=[
                    Word(text="Hello", start=0.0, end=0.5, speaker=0),
                    Word(text="everyone", start=0.5, end=1.0, speaker=0),
                    Word(text="Thanks", start=5.0, end=5.5, speaker=1),
                    Word(text="for", start=5.5, end=5.8, speaker=1),
                    Word(text="joining", start=5.8, end=6.2, speaker=1),
                ],
            ),
        ]
    return Transcript(
        id="tx-123",
        title=title,
        short_summary=short_summary,
        topics=topics,
        participants=participants,
        share_mode=share_mode,
        source_kind=source_kind,
    )


URL = "http://localhost:3000/transcripts/tx-123"


class TestBuildPlainText:
    def test_full_content_with_link(self):
        t = _make_transcript()
        text = _build_plain_text(t, URL, include_link=True)

        assert text.startswith("Reflector: Weekly Standup")
        assert "Team discussed sprint progress." in text
        assert "[00:00] Alice:" in text
        assert "[00:05] Bob:" in text
        assert URL in text

    def test_full_content_without_link(self):
        t = _make_transcript()
        text = _build_plain_text(t, URL, include_link=False)

        assert "Reflector: Weekly Standup" in text
        assert "Team discussed sprint progress." in text
        assert "[00:00] Alice:" in text
        assert URL not in text

    def test_no_summary(self):
        t = _make_transcript(short_summary=None)
        text = _build_plain_text(t, URL, include_link=True)

        assert "Summary:" not in text
        assert "[00:00] Alice:" in text

    def test_no_topics(self):
        t = _make_transcript(with_topics=False)
        text = _build_plain_text(t, URL, include_link=True)

        assert "Transcript:" not in text
        assert "Reflector: Weekly Standup" in text

    def test_unnamed_recording(self):
        t = _make_transcript(title=None)
        text = _build_plain_text(t, URL, include_link=True)

        assert "Reflector: Unnamed recording" in text


class TestBuildHtml:
    def test_full_content_with_link(self):
        t = _make_transcript()
        html = _build_html(t, URL, include_link=True)

        assert "Weekly Standup" in html
        assert "Team discussed sprint progress." in html
        assert "Alice" in html
        assert "Bob" in html
        assert URL in html
        assert "View Transcript" in html

    def test_full_content_without_link(self):
        t = _make_transcript()
        html = _build_html(t, URL, include_link=False)

        assert "Weekly Standup" in html
        assert "Alice" in html
        assert URL not in html
        assert "View Transcript" not in html

    def test_no_summary(self):
        t = _make_transcript(short_summary=None)
        html = _build_html(t, URL, include_link=True)

        assert "sprint progress" not in html
        assert "Alice" in html

    def test_no_topics(self):
        t = _make_transcript(with_topics=False)
        html = _build_html(t, URL, include_link=True)

        assert "Transcript" not in html or "View Transcript" in html

    def test_html_escapes_title(self):
        t = _make_transcript(title='<script>alert("xss")</script>')
        html = _build_html(t, URL, include_link=True)

        assert "<script>" not in html
        assert "&lt;script&gt;" in html


class TestGetTranscriptUrl:
    def test_url_format(self):
        t = _make_transcript()
        url = get_transcript_url(t)
        assert url.endswith("/transcripts/tx-123")


class TestSendTranscriptEmail:
    @pytest.mark.asyncio
    async def test_include_link_default_true(self):
        t = _make_transcript()
        with (
            patch("reflector.email.is_email_configured", return_value=True),
            patch(
                "reflector.email.aiosmtplib.send", new_callable=AsyncMock
            ) as mock_send,
        ):
            count = await send_transcript_email(["a@test.com"], t)

        assert count == 1
        call_args = mock_send.call_args
        msg = call_args[0][0]
        assert msg["Subject"] == "Reflector: Weekly Standup"
        # Default include_link=True, so HTML part should contain the URL
        html_part = msg.get_payload()[1].get_payload()
        assert "/transcripts/tx-123" in html_part

    @pytest.mark.asyncio
    async def test_include_link_false(self):
        t = _make_transcript()
        with (
            patch("reflector.email.is_email_configured", return_value=True),
            patch(
                "reflector.email.aiosmtplib.send", new_callable=AsyncMock
            ) as mock_send,
        ):
            count = await send_transcript_email(["a@test.com"], t, include_link=False)

        assert count == 1
        msg = mock_send.call_args[0][0]
        html_part = msg.get_payload()[1].get_payload()
        assert "/transcripts/tx-123" not in html_part
        plain_part = msg.get_payload()[0].get_payload()
        assert "/transcripts/tx-123" not in plain_part

    @pytest.mark.asyncio
    async def test_skips_when_not_configured(self):
        t = _make_transcript()
        with patch("reflector.email.is_email_configured", return_value=False):
            count = await send_transcript_email(["a@test.com"], t)
        assert count == 0

    @pytest.mark.asyncio
    async def test_skips_empty_recipients(self):
        t = _make_transcript()
        with patch("reflector.email.is_email_configured", return_value=True):
            count = await send_transcript_email([], t)
        assert count == 0
