"""
Local file transcription processor using faster-whisper with Silero VAD pipeline.

Downloads audio from URL, segments it using Silero VAD, transcribes each
segment with faster-whisper, and merges results. No HTTP backend needed.

VAD pipeline ported from gpu/self_hosted/app/services/transcriber.py.
"""

import asyncio
import os
import shutil
import subprocess
import threading
from typing import Generator

import numpy as np
from silero_vad import VADIterator, load_silero_vad

from reflector.processors._audio_download import download_audio_to_temp
from reflector.processors.file_transcript import (
    FileTranscriptInput,
    FileTranscriptProcessor,
)
from reflector.processors.file_transcript_auto import FileTranscriptAutoProcessor
from reflector.processors.types import Transcript, Word
from reflector.settings import settings

SAMPLE_RATE = 16000

VAD_CONFIG = {
    "batch_max_duration": 30.0,
    "silence_padding": 0.5,
    "window_size": 512,
}


class FileTranscriptWhisperProcessor(FileTranscriptProcessor):
    """Transcribe complete audio files using local faster-whisper with VAD."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._model = None
        self._lock = threading.Lock()

    def _ensure_model(self):
        """Lazy-load the whisper model on first use."""
        if self._model is not None:
            return

        import faster_whisper
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        model_name = settings.WHISPER_FILE_MODEL

        self.logger.info(
            "Loading whisper model",
            model=model_name,
            device=device,
            compute_type=compute_type,
        )
        self._model = faster_whisper.WhisperModel(
            model_name,
            device=device,
            compute_type=compute_type,
            num_workers=1,
        )

    async def _transcript(self, data: FileTranscriptInput):
        """Download file, run VAD segmentation, transcribe each segment."""
        tmp_path = await download_audio_to_temp(data.audio_url)
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                self._transcribe_file_blocking,
                str(tmp_path),
                data.language,
            )
            return result
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    def _transcribe_file_blocking(self, file_path: str, language: str) -> Transcript:
        """Blocking transcription with VAD pipeline."""
        self._ensure_model()

        audio_array = _load_audio_via_ffmpeg(file_path, SAMPLE_RATE)

        # VAD segmentation → batch merging
        merged_batches: list[tuple[float, float]] = []
        batch_start = None
        batch_end = None
        max_duration = VAD_CONFIG["batch_max_duration"]

        for seg_start, seg_end in _vad_segments(audio_array):
            if batch_start is None:
                batch_start, batch_end = seg_start, seg_end
                continue
            if seg_end - batch_start <= max_duration:
                batch_end = seg_end
            else:
                merged_batches.append((batch_start, batch_end))
                batch_start, batch_end = seg_start, seg_end

        if batch_start is not None and batch_end is not None:
            merged_batches.append((batch_start, batch_end))

        # If no speech detected, try transcribing the whole file
        if not merged_batches:
            return self._transcribe_whole_file(file_path, language)

        # Transcribe each batch
        all_words = []
        for start_time, end_time in merged_batches:
            s_idx = int(start_time * SAMPLE_RATE)
            e_idx = int(end_time * SAMPLE_RATE)
            segment = audio_array[s_idx:e_idx]
            segment = _pad_audio(segment, SAMPLE_RATE)

            with self._lock:
                segments, _ = self._model.transcribe(
                    segment,
                    language=language,
                    beam_size=5,
                    word_timestamps=True,
                    vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 500},
                )
                segments = list(segments)

            for seg in segments:
                for w in seg.words:
                    all_words.append(
                        {
                            "word": w.word,
                            "start": round(float(w.start) + start_time, 2),
                            "end": round(float(w.end) + start_time, 2),
                        }
                    )

        all_words = _enforce_word_timing_constraints(all_words)

        words = [
            Word(text=w["word"], start=w["start"], end=w["end"]) for w in all_words
        ]
        words.sort(key=lambda w: w.start)
        return Transcript(words=words)

    def _transcribe_whole_file(self, file_path: str, language: str) -> Transcript:
        """Fallback: transcribe entire file without VAD segmentation."""
        with self._lock:
            segments, _ = self._model.transcribe(
                file_path,
                language=language,
                beam_size=5,
                word_timestamps=True,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
            )
            segments = list(segments)

        words = []
        for seg in segments:
            for w in seg.words:
                words.append(
                    Word(
                        text=w.word,
                        start=round(float(w.start), 2),
                        end=round(float(w.end), 2),
                    )
                )
        return Transcript(words=words)


# --- VAD helpers (ported from gpu/self_hosted/app/services/transcriber.py) ---
# IMPORTANT: This VAD segment logic is duplicated for deployment isolation.
# If you modify this, consider updating the GPU service copy as well:
#   - gpu/self_hosted/app/services/transcriber.py
#   - gpu/modal_deployments/reflector_transcriber.py
#   - gpu/modal_deployments/reflector_transcriber_parakeet.py


def _load_audio_via_ffmpeg(
    input_path: str, sample_rate: int = SAMPLE_RATE
) -> np.ndarray:
    """Load audio file via ffmpeg, converting to mono float32 at target sample rate."""
    ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"
    cmd = [
        ffmpeg_bin,
        "-nostdin",
        "-threads",
        "1",
        "-i",
        input_path,
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "pipe:1",
    ]
    proc = subprocess.run(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
    )
    return np.frombuffer(proc.stdout, dtype=np.float32)


def _vad_segments(
    audio_array: np.ndarray,
    sample_rate: int = SAMPLE_RATE,
    window_size: int = VAD_CONFIG["window_size"],
) -> Generator[tuple[float, float], None, None]:
    """Detect speech segments using Silero VAD."""
    vad_model = load_silero_vad(onnx=False)
    iterator = VADIterator(vad_model, sampling_rate=sample_rate)
    start = None

    for i in range(0, len(audio_array), window_size):
        chunk = audio_array[i : i + window_size]
        if len(chunk) < window_size:
            chunk = np.pad(chunk, (0, window_size - len(chunk)), mode="constant")
        speech = iterator(chunk)
        if not speech:
            continue
        if "start" in speech:
            start = speech["start"]
            continue
        if "end" in speech and start is not None:
            end = speech["end"]
            yield (start / float(SAMPLE_RATE), end / float(SAMPLE_RATE))
            start = None

    # Handle case where audio ends while speech is still active
    if start is not None:
        audio_duration = len(audio_array) / float(sample_rate)
        yield (start / float(SAMPLE_RATE), audio_duration)

    iterator.reset_states()


def _pad_audio(audio_array: np.ndarray, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Pad short audio with silence for VAD compatibility."""
    audio_duration = len(audio_array) / sample_rate
    if audio_duration < VAD_CONFIG["silence_padding"]:
        silence_samples = int(sample_rate * VAD_CONFIG["silence_padding"])
        silence = np.zeros(silence_samples, dtype=np.float32)
        return np.concatenate([audio_array, silence])
    return audio_array


def _enforce_word_timing_constraints(words: list[dict]) -> list[dict]:
    """Ensure no word end time exceeds the next word's start time."""
    if len(words) <= 1:
        return words
    enforced: list[dict] = []
    for i, word in enumerate(words):
        current = dict(word)
        if i < len(words) - 1:
            next_start = words[i + 1]["start"]
            if current["end"] > next_start:
                current["end"] = next_start
        enforced.append(current)
    return enforced


FileTranscriptAutoProcessor.register("whisper", FileTranscriptWhisperProcessor)
