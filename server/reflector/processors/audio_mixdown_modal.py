"""
Modal.com backend for audio mixdown.
"""

import asyncio
import os

import httpx

from reflector.hatchet.constants import TIMEOUT_HEAVY_HTTP
from reflector.logger import logger
from reflector.processors.audio_mixdown import AudioMixdownProcessor, MixdownResponse
from reflector.processors.audio_mixdown_auto import AudioMixdownAutoProcessor


class AudioMixdownModalProcessor(AudioMixdownProcessor):
    """Audio mixdown processor using Modal.com/self-hosted backend via HTTP."""

    def __init__(
        self, mixdown_url: str | None = None, modal_api_key: str | None = None
    ):
        self.mixdown_url = mixdown_url or os.getenv("MIXDOWN_URL")
        if not self.mixdown_url:
            raise ValueError(
                "MIXDOWN_URL required to use AudioMixdownModalProcessor. "
                "Set MIXDOWN_URL environment variable or pass mixdown_url parameter."
            )

        self.modal_api_key = modal_api_key or os.getenv("MODAL_API_KEY")

    async def mixdown_tracks(
        self,
        track_urls: list[str],
        output_url: str,
        target_sample_rate: int | None = None,
        offsets_seconds: list[float] | None = None,
    ) -> MixdownResponse:
        """Mix audio tracks via remote Modal/self-hosted backend.

        Args:
            track_urls: Presigned GET URLs for source audio tracks
            output_url: Presigned PUT URL for output MP3
            target_sample_rate: Sample rate for output (Hz), auto-detected if None
            offsets_seconds: Optional per-track delays in seconds for alignment
        """
        valid_count = len([u for u in track_urls if u])
        log = logger.bind(track_count=valid_count)
        log.info("Sending Modal mixdown HTTP request")

        url = f"{self.mixdown_url}/mixdown"

        headers = {}
        if self.modal_api_key:
            headers["Authorization"] = f"Bearer {self.modal_api_key}"

        # Scale timeout with track count: base TIMEOUT_HEAVY_HTTP + 60s per track beyond 2
        extra_timeout = max(0, (valid_count - 2)) * 60
        timeout = TIMEOUT_HEAVY_HTTP + extra_timeout

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    url,
                    headers=headers,
                    json={
                        "track_urls": track_urls,
                        "output_url": output_url,
                        "target_sample_rate": target_sample_rate,
                        "offsets_seconds": offsets_seconds,
                    },
                    follow_redirects=True,
                )

                if response.status_code != 200:
                    error_body = response.text
                    log.error(
                        "Modal mixdown API error",
                        status_code=response.status_code,
                        error_body=error_body,
                    )

                response.raise_for_status()
                result = response.json()

            # Check if work was cancelled
            if result.get("cancelled"):
                log.warning("Modal mixdown was cancelled by disconnect detection")
                raise asyncio.CancelledError(
                    "Mixdown cancelled due to client disconnect"
                )

            log.info("Modal mixdown complete", size=result["size"])
            return MixdownResponse(**result)
        except asyncio.CancelledError:
            log.warning(
                "Modal mixdown cancelled (Hatchet timeout, disconnect detected on Modal side)"
            )
            raise
        except httpx.TimeoutException as e:
            log.error("Modal mixdown timeout", error=str(e), exc_info=True)
            raise Exception(f"Modal mixdown timeout: {e}") from e
        except httpx.HTTPStatusError as e:
            log.error("Modal mixdown HTTP error", error=str(e), exc_info=True)
            raise Exception(f"Modal mixdown HTTP error: {e}") from e
        except Exception as e:
            log.error("Modal mixdown unexpected error", error=str(e), exc_info=True)
            raise


AudioMixdownAutoProcessor.register("modal", AudioMixdownModalProcessor)
