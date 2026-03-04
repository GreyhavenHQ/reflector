"""
Base class for audio padding processors.
"""

from pydantic import BaseModel


class PaddingResponse(BaseModel):
    size: int
    cancelled: bool = False


class AudioPaddingProcessor:
    """Base class for audio padding processors."""

    async def pad_track(
        self,
        track_url: str,
        output_url: str,
        start_time_seconds: float,
        track_index: int,
    ) -> PaddingResponse:
        raise NotImplementedError
