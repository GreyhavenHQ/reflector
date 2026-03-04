"""
Shared audio download utility for local processors.

Downloads audio from a URL to a temporary file for in-process ML inference.
"""

import asyncio
import os
import tempfile
from pathlib import Path

import requests

from reflector.logger import logger

S3_TIMEOUT = 60


async def download_audio_to_temp(url: str) -> Path:
    """Download audio from URL to a temporary file.

    The caller is responsible for deleting the temp file after use.

    Args:
        url: Presigned URL or public URL to download audio from.

    Returns:
        Path to the downloaded temporary file.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _download_blocking, url)


def _download_blocking(url: str) -> Path:
    """Blocking download implementation."""
    log = logger.bind(url=url[:80])
    log.info("Downloading audio to temp file")

    response = requests.get(url, stream=True, timeout=S3_TIMEOUT)
    response.raise_for_status()

    # Determine extension from content-type or URL
    ext = _detect_extension(url, response.headers.get("content-type", ""))

    fd, tmp_path = tempfile.mkstemp(suffix=ext)
    try:
        total_bytes = 0
        with os.fdopen(fd, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    total_bytes += len(chunk)
        log.info("Audio downloaded", bytes=total_bytes, path=tmp_path)
        return Path(tmp_path)
    except Exception:
        # Clean up on failure
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _detect_extension(url: str, content_type: str) -> str:
    """Detect audio file extension from URL or content-type."""
    # Try URL path first
    path = url.split("?")[0]  # Strip query params
    for ext in (".wav", ".mp3", ".mp4", ".m4a", ".webm", ".ogg", ".flac"):
        if path.lower().endswith(ext):
            return ext

    # Try content-type
    ct_map = {
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
    }
    for ct, ext in ct_map.items():
        if ct in content_type.lower():
            return ext

    return ".audio"
