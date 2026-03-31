from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

import aiosmtplib
import structlog

from reflector.db.transcripts import SourceKind, Transcript
from reflector.settings import settings
from reflector.utils.transcript_formats import transcript_to_text_timestamped

logger = structlog.get_logger(__name__)


def is_email_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)


def get_transcript_url(transcript: Transcript) -> str:
    return f"{settings.UI_BASE_URL}/transcripts/{transcript.id}"


def _get_timestamped_text(transcript: Transcript) -> str:
    """Build the full timestamped transcript text using existing utility."""
    if not transcript.topics:
        return ""
    is_multitrack = transcript.source_kind == SourceKind.ROOM
    return transcript_to_text_timestamped(
        transcript.topics, transcript.participants, is_multitrack=is_multitrack
    )


def _build_plain_text(transcript: Transcript, url: str, include_link: bool) -> str:
    title = transcript.title or "Unnamed recording"
    lines = [f"Reflector: {title}", ""]

    if transcript.short_summary:
        lines.extend(["Summary:", transcript.short_summary, ""])

    timestamped = _get_timestamped_text(transcript)
    if timestamped:
        lines.extend(["Transcript:", timestamped, ""])

    if include_link:
        lines.append(f"View transcript: {url}")
        lines.append("")

    lines.append(
        "This email was sent because you requested to receive "
        "the transcript from a meeting."
    )
    return "\n".join(lines)


def _build_html(transcript: Transcript, url: str, include_link: bool) -> str:
    title = escape(transcript.title or "Unnamed recording")

    summary_html = ""
    if transcript.short_summary:
        summary_html = (
            f'<p style="color:#555;margin-bottom:16px;">'
            f"{escape(transcript.short_summary)}</p>"
        )

    transcript_html = ""
    timestamped = _get_timestamped_text(transcript)
    if timestamped:
        # Build styled transcript lines
        styled_lines = []
        for line in timestamped.split("\n"):
            if not line.strip():
                continue
            # Lines are formatted as "[MM:SS] Speaker: text"
            if line.startswith("[") and "] " in line:
                bracket_end = line.index("] ")
                timestamp = escape(line[: bracket_end + 1])
                rest = line[bracket_end + 2 :]
                if ": " in rest:
                    colon_pos = rest.index(": ")
                    speaker = escape(rest[:colon_pos])
                    text = escape(rest[colon_pos + 2 :])
                    styled_lines.append(
                        f'<div style="margin-bottom:4px;">'
                        f'<span style="color:#888;font-size:12px;">{timestamp}</span> '
                        f"<strong>{speaker}:</strong> {text}</div>"
                    )
                else:
                    styled_lines.append(
                        f'<div style="margin-bottom:4px;">{escape(line)}</div>'
                    )
            else:
                styled_lines.append(
                    f'<div style="margin-bottom:4px;">{escape(line)}</div>'
                )

        transcript_html = (
            '<h3 style="margin-top:20px;margin-bottom:8px;">Transcript</h3>'
            '<div style="background:#f7f7f7;padding:16px;border-radius:6px;'
            'font-size:13px;line-height:1.6;max-height:600px;overflow-y:auto;">'
            f"{''.join(styled_lines)}</div>"
        )

    link_html = ""
    if include_link:
        link_html = (
            '<p style="margin-top:20px;">'
            f'<a href="{url}" style="display:inline-block;padding:10px 20px;'
            "background:#4A90D9;color:#fff;text-decoration:none;"
            'border-radius:4px;">View Transcript</a></p>'
        )

    return f"""\
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="margin-bottom:4px;">{title}</h2>
  {summary_html}
  {transcript_html}
  {link_html}
  <p style="color:#999;font-size:12px;margin-top:20px;">This email was sent because you requested to receive the transcript from a meeting.</p>
</div>"""


async def send_transcript_email(
    to_emails: list[str],
    transcript: Transcript,
    *,
    include_link: bool = True,
) -> int:
    """Send transcript notification to all emails. Returns count sent."""
    if not is_email_configured() or not to_emails:
        return 0

    url = get_transcript_url(transcript)
    title = transcript.title or "Unnamed recording"
    sent = 0

    for email_addr in to_emails:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Reflector: {title}"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = email_addr

        msg.attach(MIMEText(_build_plain_text(transcript, url, include_link), "plain"))
        msg.attach(MIMEText(_build_html(transcript, url, include_link), "html"))

        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USERNAME,
                password=settings.SMTP_PASSWORD,
                start_tls=settings.SMTP_USE_TLS,
            )
            sent += 1
        except Exception:
            logger.exception(
                "Failed to send transcript email",
                to=email_addr,
                transcript_id=transcript.id,
            )

    return sent
