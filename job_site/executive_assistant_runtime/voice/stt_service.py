"""
stt_service.py — EXEC-AI-RAPID-002 / S5.1

Speech-to-Text service adapter.

Design:
  - STTService is the abstract interface.
  - DemoSTTService returns the transcript as-is (accepts text, passes it
    through unchanged). Used when no real STT backend is wired.
  - RealtimeSTTService is a thin adapter for KoljaB/RealtimeSTT.
    It is constructed only when the real backend is configured; otherwise
    the factory returns DemoSTTService.
  - WhisperSTTService is a stub adapter for OpenAI Whisper / Faster-Whisper.

Nothing in this file imports from core/. The pipeline owns that wiring.

References:
  - https://github.com/KoljaB/RealtimeSTT  (RealtimeSTT patterns)
  - https://github.com/pipecat-ai/pipecat   (pipecat STT frame design)
"""

from __future__ import annotations

import asyncio
import io
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

class STTBackend(str, Enum):
    DEMO = "demo"             # echo / passthrough (no real STT)
    REALTIME_STT = "realtime_stt"   # KoljaB/RealtimeSTT
    WHISPER = "whisper"       # OpenAI Whisper / Faster-Whisper
    GOOGLE = "google"         # Google Speech-to-Text (stub)


@dataclass
class AudioChunk:
    """Raw audio payload delivered to an STT service."""
    data: bytes
    sample_rate: int = 16000
    channels: int = 1
    encoding: str = "pcm_s16le"


@dataclass
class STTResult:
    """Transcript returned by an STT service."""
    transcript: str
    is_final: bool = True
    confidence: float = 1.0
    backend: STTBackend = STTBackend.DEMO
    raw: dict = field(default_factory=dict)

    def is_usable(self) -> bool:
        return bool(self.transcript.strip()) and self.is_final


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class STTService(ABC):
    """
    Base class for all STT adapters.

    Implementations must support:
      transcribe_audio(chunk) — single-shot audio → transcript
      transcribe_stream()     — async generator for streaming input
      transcribe_text(text)   — demo / test path: accept text directly
    """

    @property
    @abstractmethod
    def backend(self) -> STTBackend: ...

    @property
    def is_demo(self) -> bool:
        return self.backend == STTBackend.DEMO

    @abstractmethod
    async def transcribe_audio(self, chunk: AudioChunk) -> STTResult:
        """Transcribe a single audio chunk."""

    @abstractmethod
    async def transcribe_text(self, text: str) -> STTResult:
        """
        Accept pre-transcribed text directly.
        Used in demo mode and for pipeline testing without audio hardware.
        """

    async def transcribe_stream(
        self, chunks: AsyncIterator[AudioChunk]
    ) -> AsyncIterator[STTResult]:
        """
        Default streaming: process each chunk independently.
        Real backends should override this for true streaming recognition.
        """
        async for chunk in chunks:
            yield await self.transcribe_audio(chunk)

    async def close(self) -> None:
        """Release any resources held by the service."""


# ---------------------------------------------------------------------------
# Demo STT — passthrough, no real STT
# ---------------------------------------------------------------------------

class DemoSTTService(STTService):
    """
    Demo-mode STT: returns whatever text is provided as the transcript.
    Accepts audio chunks but silently ignores the bytes (returns placeholder).
    """

    @property
    def backend(self) -> STTBackend:
        return STTBackend.DEMO

    async def transcribe_audio(self, chunk: AudioChunk) -> STTResult:
        logger.debug("DemoSTTService: audio chunk received (%d bytes) — placeholder transcript", len(chunk.data))
        return STTResult(
            transcript="[audio received — transcription requires real STT backend]",
            is_final=True,
            confidence=0.0,
            backend=STTBackend.DEMO,
        )

    async def transcribe_text(self, text: str) -> STTResult:
        logger.debug("DemoSTTService: transcribe_text(%r)", text[:60])
        return STTResult(
            transcript=text,
            is_final=True,
            confidence=1.0,
            backend=STTBackend.DEMO,
        )


# ---------------------------------------------------------------------------
# RealtimeSTT adapter — KoljaB/RealtimeSTT
# Ref: https://github.com/KoljaB/RealtimeSTT
# ---------------------------------------------------------------------------

class RealtimeSTTService(STTService):
    """
    Adapter for KoljaB/RealtimeSTT.

    RealtimeSTT feeds audio to a local Whisper model and provides
    real-time partial + final transcripts via a callback interface.
    This adapter wraps that in the async STTService contract.

    Requires: pip install RealtimeSTT
    Falls back to demo output if the library is not installed.
    """

    def __init__(
        self,
        model: str = "tiny.en",
        language: str = "en",
        silero_sensitivity: float = 0.4,
        post_speech_silence_duration: float = 0.6,
    ) -> None:
        self._model = model
        self._language = language
        self._silero_sensitivity = silero_sensitivity
        self._post_speech_silence = post_speech_silence_duration
        self._recorder = None
        self._available = self._try_import()

    def _try_import(self) -> bool:
        try:
            from RealtimeSTT import AudioToTextRecorder  # noqa: F401
            return True
        except ImportError:
            logger.warning(
                "RealtimeSTT not installed — falling back to demo output. "
                "Install with: pip install RealtimeSTT"
            )
            return False

    @property
    def backend(self) -> STTBackend:
        return STTBackend.REALTIME_STT

    async def _ensure_recorder(self):
        if self._recorder is None and self._available:
            from RealtimeSTT import AudioToTextRecorder
            loop = asyncio.get_event_loop()
            self._recorder = await loop.run_in_executor(
                None,
                lambda: AudioToTextRecorder(
                    model=self._model,
                    language=self._language,
                    silero_sensitivity=self._silero_sensitivity,
                    post_speech_silence_duration=self._post_speech_silence,
                    spinner=False,
                ),
            )

    async def transcribe_audio(self, chunk: AudioChunk) -> STTResult:
        if not self._available:
            return STTResult(
                transcript="[RealtimeSTT not installed]",
                is_final=True,
                confidence=0.0,
                backend=self.backend,
            )
        await self._ensure_recorder()
        loop = asyncio.get_event_loop()
        # Feed raw PCM and get transcript synchronously (run in executor)
        transcript = await loop.run_in_executor(
            None,
            lambda: self._recorder.text(),
        )
        return STTResult(
            transcript=transcript or "",
            is_final=True,
            confidence=0.9,
            backend=self.backend,
        )

    async def transcribe_text(self, text: str) -> STTResult:
        """Direct text input path — bypasses STT for testing/demo."""
        return STTResult(
            transcript=text,
            is_final=True,
            confidence=1.0,
            backend=self.backend,
        )

    async def close(self) -> None:
        if self._recorder is not None:
            try:
                self._recorder.stop()
            except Exception:
                pass
            self._recorder = None


# ---------------------------------------------------------------------------
# Whisper STT stub
# ---------------------------------------------------------------------------

class WhisperSTTService(STTService):
    """
    Stub adapter for OpenAI Whisper / Faster-Whisper.
    Skeleton only — wire real whisper.transcribe() call in a later stage.
    """

    def __init__(self, model_size: str = "base.en") -> None:
        self._model_size = model_size
        self._model = None

    @property
    def backend(self) -> STTBackend:
        return STTBackend.WHISPER

    async def transcribe_audio(self, chunk: AudioChunk) -> STTResult:
        # Stub: real impl loads self._model and calls model.transcribe(audio_bytes)
        logger.debug("WhisperSTTService: stub — model=%s", self._model_size)
        return STTResult(
            transcript="[whisper stub — not yet wired]",
            is_final=True,
            confidence=0.0,
            backend=self.backend,
        )

    async def transcribe_text(self, text: str) -> STTResult:
        return STTResult(
            transcript=text,
            is_final=True,
            confidence=1.0,
            backend=self.backend,
        )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_stt_service(
    backend: STTBackend = STTBackend.DEMO,
    **kwargs,
) -> STTService:
    """
    Return the appropriate STTService for the given backend.
    Defaults to DemoSTTService when backend is DEMO or library unavailable.
    """
    if backend == STTBackend.REALTIME_STT:
        svc = RealtimeSTTService(**kwargs)
        if not svc._available:
            logger.warning("RealtimeSTT unavailable — using DemoSTTService")
            return DemoSTTService()
        return svc
    if backend == STTBackend.WHISPER:
        return WhisperSTTService(**kwargs)
    return DemoSTTService()
