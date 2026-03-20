from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
import structlog

from reflector.db.transcripts import Transcript
from reflector.settings import settings

logger = structlog.get_logger(__name__)


def is_email_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)


def get_transcript_url(transcript: Transcript) -> str:
    return f"{settings.UI_BASE_URL}/transcripts/{transcript.id}"


def _build_plain_text(transcript: Transcript, url: str) -> str:
    title = transcript.title or "Unnamed recording"
    lines = [
        f"Your transcript is ready: {title}",
        "",
        f"View it here: {url}",
    ]
    if transcript.short_summary:
        lines.extend(["", "Summary:", transcript.short_summary])
    return "\n".join(lines)


def _build_html(transcript: Transcript, url: str) -> str:
    title = transcript.title or "Unnamed recording"
    summary_html = ""
    if transcript.short_summary:
        summary_html = f"<p style='color:#555;'>{transcript.short_summary}</p>"

    return f"""\
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h2>Your transcript is ready</h2>
  <p><strong>{title}</strong></p>
  {summary_html}
  <p><a href="{url}" style="display:inline-block;padding:10px 20px;background:#4A90D9;color:#fff;text-decoration:none;border-radius:4px;">View Transcript</a></p>
  <p style="color:#999;font-size:12px;">This email was sent because you requested to receive the transcript from a meeting.</p>
</div>"""


async def send_transcript_email(to_emails: list[str], transcript: Transcript) -> int:
    """Send transcript notification to all emails. Returns count sent."""
    if not is_email_configured() or not to_emails:
        return 0

    url = get_transcript_url(transcript)
    title = transcript.title or "Unnamed recording"
    sent = 0

    for email_addr in to_emails:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Transcript Ready: {title}"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = email_addr

        msg.attach(MIMEText(_build_plain_text(transcript, url), "plain"))
        msg.attach(MIMEText(_build_html(transcript, url), "html"))

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
