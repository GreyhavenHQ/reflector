"""
Pyannote diarization service using pyannote.audio.

Singleton service that loads the pyannote speaker diarization model once
and reuses it across all pyannote diarization processor instances.

Ported from gpu/self_hosted/app/services/diarizer.py for in-process use.
"""

import logging
import tarfile
import threading
from pathlib import Path
from urllib.request import urlopen

import torch
import torchaudio
import yaml
from pyannote.audio import Pipeline

from reflector.settings import settings

logger = logging.getLogger(__name__)

S3_BUNDLE_URL = "https://reflector-public.s3.us-east-1.amazonaws.com/pyannote-speaker-diarization-3.1.tar.gz"
BUNDLE_CACHE_DIR = Path.home() / ".cache" / "pyannote-bundle"


def _ensure_model(cache_dir: Path) -> str:
    """Download and extract S3 model bundle if not cached."""
    model_dir = cache_dir / "pyannote-speaker-diarization-3.1"
    config_path = model_dir / "config.yaml"

    if config_path.exists():
        logger.info("Using cached model bundle at %s", model_dir)
        return str(model_dir)

    cache_dir.mkdir(parents=True, exist_ok=True)
    tarball_path = cache_dir / "model.tar.gz"

    logger.info("Downloading model bundle from %s", S3_BUNDLE_URL)
    with urlopen(S3_BUNDLE_URL) as response, open(tarball_path, "wb") as f:
        while chunk := response.read(8192):
            f.write(chunk)

    logger.info("Extracting model bundle")
    with tarfile.open(tarball_path, "r:gz") as tar:
        tar.extractall(path=cache_dir, filter="data")
    tarball_path.unlink()

    _patch_config(model_dir, cache_dir)
    return str(model_dir)


def _patch_config(model_dir: Path, cache_dir: Path) -> None:
    """Rewrite config.yaml to reference local pytorch_model.bin paths."""
    config_path = model_dir / "config.yaml"
    with open(config_path) as f:
        config = yaml.safe_load(f)

    config["pipeline"]["params"]["segmentation"] = str(
        cache_dir / "pyannote-segmentation-3.0" / "pytorch_model.bin"
    )
    config["pipeline"]["params"]["embedding"] = str(
        cache_dir / "pyannote-wespeaker-voxceleb-resnet34-LM" / "pytorch_model.bin"
    )

    with open(config_path, "w") as f:
        yaml.dump(config, f)

    logger.info("Patched config.yaml with local model paths")


class PyannoteDiarizationService:
    """Pyannote speaker diarization service for in-process use."""

    def __init__(self):
        self._pipeline = None
        self._device = "cpu"
        self._lock = threading.Lock()

    def load(self):
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        hf_token = settings.HF_TOKEN

        if hf_token:
            logger.info("Loading pyannote model from HuggingFace (HF_TOKEN set)")
            self._pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=hf_token,
            )
        else:
            logger.info("HF_TOKEN not set — loading model from S3 bundle")
            model_path = _ensure_model(BUNDLE_CACHE_DIR)
            config_path = Path(model_path) / "config.yaml"
            self._pipeline = Pipeline.from_pretrained(str(config_path))

        self._pipeline.to(torch.device(self._device))

    def diarize_file(self, file_path: str, timestamp: float = 0.0) -> dict:
        """Run speaker diarization on an audio file.

        Args:
            file_path: Path to the audio file.
            timestamp: Offset to add to all segment timestamps.

        Returns:
            dict with "diarization" key containing list of
            {"start": float, "end": float, "speaker": int} segments.
        """
        if self._pipeline is None:
            self.load()
        waveform, sample_rate = torchaudio.load(file_path)
        with self._lock:
            diarization = self._pipeline(
                {"waveform": waveform, "sample_rate": sample_rate}
            )
        segments = []
        for diarization_segment, _, speaker in diarization.itertracks(yield_label=True):
            segments.append(
                {
                    "start": round(timestamp + diarization_segment.start, 3),
                    "end": round(timestamp + diarization_segment.end, 3),
                    "speaker": int(speaker[-2:])
                    if speaker and speaker[-2:].isdigit()
                    else 0,
                }
            )
        return {"diarization": segments}


# Module-level singleton — shared across all pyannote diarization processors
diarization_service = PyannoteDiarizationService()
