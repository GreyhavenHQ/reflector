"""
Base class for audio mixdown processors.
"""

from pydantic import BaseModel


class MixdownResponse(BaseModel):
    size: int
    duration_ms: float = 0.0
    cancelled: bool = False
    output_path: str | None = (
        None  # Local file path (pyav sets this; modal leaves None)
    )


class AudioMixdownProcessor:
    """Base class for audio mixdown processors."""

    async def mixdown_tracks(
        self,
        track_urls: list[str],
        output_url: str,
        target_sample_rate: int | None = None,
        offsets_seconds: list[float] | None = None,
    ) -> MixdownResponse:
        raise NotImplementedError
