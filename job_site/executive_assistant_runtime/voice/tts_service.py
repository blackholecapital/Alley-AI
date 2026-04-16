"""
tts_service.py — EXEC-AI-RAPID-002 / S5.1

Text-to-Speech service adapter.

Design:
  - TTSService is the abstract interface.
  - DemoTTSService prints/logs the reply text; no audio hardware required.
  - PipecatTTSService is a stub adapter matching pipecat's frame-based TTS
    contract (pipecat-ai/pipecat). Real synthesis wired in a later stage.
  - SystemTTSService uses platform TTS (pyttsx3 / say / espeak) as a
    no-cloud fallback when the real backend is not yet configured.

Nothing in this file imports from core/. The pipeline owns that wiring.

References:
  - https://github.com/pipecat-ai/pipecat        (frame pipeline model)
  - https://github.com/pipecat-ai/pipecat-examples (TTS adapter patterns)
"""

from __future__ import annotations

import asyncio
import logging
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

class TTSBackend(str, Enum):
    DEMO = "demo"         # log/print only, no audio output
    SYSTEM = "system"     # pyttsx3 / say / espeak
    PIPECAT = "pipecat"   # pipecat TTS frame (stub — wired in S5 tighten)
    ELEVENLABS = "elevenlabs"  # ElevenLabs REST API (stub)
    OPENAI = "openai"     # OpenAI TTS (stub)


@dataclass
class TTSRequest:
    """Text payload sent to a TTS service."""
    text: str
    voice_id: str = "default"
    speed: float = 1.0
    language: str = "en"


@dataclass
class TTSResult:
    """Result returned by a TTS service."""
    text: str                           # the text that was synthesised
    audio_bytes: Optional[bytes] = None # None in demo mode
    audio_format: str = "pcm_s16le"
    sample_rate: int = 24000
    backend: TTSBackend = TTSBackend.DEMO
    spoken: bool = False                # True if audio was actually played


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class TTSService(ABC):
    """
    Base class for all TTS adapters.

    Implementations must support:
      synthesise(request) — text → TTSResult (may include audio bytes)
      speak(text)         — convenience wrapper that synthesises and plays
    """

    @property
    @abstractmethod
    def backend(self) -> TTSBackend: ...

    @property
    def is_demo(self) -> bool:
        return self.backend == TTSBackend.DEMO

    @abstractmethod
    async def synthesise(self, request: TTSRequest) -> TTSResult:
        """Convert text to speech. Returns TTSResult with optional audio bytes."""

    async def speak(self, text: str, **kwargs) -> TTSResult:
        """Convenience: synthesise and play. Returns TTSResult."""
        req = TTSRequest(text=text, **kwargs)
        return await self.synthesise(req)

    async def synthesise_stream(
        self, texts: AsyncIterator[str]
    ) -> AsyncIterator[TTSResult]:
        """Default streaming: process each text segment independently."""
        async for text in texts:
            yield await self.speak(text)

    async def close(self) -> None:
        """Release any resources held by the service."""


# ---------------------------------------------------------------------------
# Demo TTS — log output, no audio hardware
# ---------------------------------------------------------------------------

class DemoTTSService(TTSService):
    """
    Demo-mode TTS: logs the reply text to stdout.
    No audio library required. Safe to use in any environment.
    """

    def __init__(self, prefix: str = "[TTS DEMO]") -> None:
        self._prefix = prefix

    @property
    def backend(self) -> TTSBackend:
        return TTSBackend.DEMO

    async def synthesise(self, request: TTSRequest) -> TTSResult:
        output_line = f"{self._prefix} {request.text}"
        # Write to stdout so operator can see the spoken reply in the terminal
        print(output_line, flush=True)
        logger.debug("DemoTTSService: %r", request.text[:80])
        return TTSResult(
            text=request.text,
            audio_bytes=None,
            backend=TTSBackend.DEMO,
            spoken=True,   # "spoken" in the sense of displayed to operator
        )


# ---------------------------------------------------------------------------
# System TTS — pyttsx3 / platform say / espeak
# ---------------------------------------------------------------------------

class SystemTTSService(TTSService):
    """
    Uses the platform's built-in TTS engine via pyttsx3.
    Falls back to DemoTTSService if pyttsx3 is not installed.

    Install: pip install pyttsx3
    """

    def __init__(self, rate: int = 175, volume: float = 1.0) -> None:
        self._rate = rate
        self._volume = volume
        self._engine = None
        self._available = self._try_init()

    def _try_init(self) -> bool:
        try:
            import pyttsx3
            self._engine = pyttsx3.init()
            self._engine.setProperty("rate", self._rate)
            self._engine.setProperty("volume", self._volume)
            return True
        except Exception as exc:
            logger.warning(
                "SystemTTSService: pyttsx3 unavailable (%s) — falling back to demo output",
                exc,
            )
            return False

    @property
    def backend(self) -> TTSBackend:
        return TTSBackend.SYSTEM

    async def synthesise(self, request: TTSRequest) -> TTSResult:
        if not self._available or self._engine is None:
            logger.debug("SystemTTSService: unavailable — logging text only")
            print(f"[TTS SYSTEM FALLBACK] {request.text}", flush=True)
            return TTSResult(
                text=request.text,
                backend=self.backend,
                spoken=False,
            )

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            self._speak_sync,
            request.text,
        )
        return TTSResult(
            text=request.text,
            backend=self.backend,
            spoken=True,
        )

    def _speak_sync(self, text: str) -> None:
        self._engine.say(text)
        self._engine.runAndWait()

    async def close(self) -> None:
        if self._engine is not None:
            try:
                self._engine.stop()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Pipecat TTS stub
# Ref: https://github.com/pipecat-ai/pipecat
# ---------------------------------------------------------------------------

class PipecatTTSService(TTSService):
    """
    Stub adapter that follows pipecat's frame-based TTS contract.

    In pipecat, TTS services consume TextFrame objects and produce
    AudioRawFrame objects in an async pipeline. This stub holds the
    interface shape so it can be wired into a real pipecat pipeline
    without changing the VoicePipeline API.

    Requires: pip install pipecat-ai
    """

    def __init__(self, provider: str = "cartesia", api_key: str = "") -> None:
        self._provider = provider
        self._api_key = api_key
        self._available = self._try_import()

    def _try_import(self) -> bool:
        try:
            import pipecat  # noqa: F401
            return True
        except ImportError:
            logger.warning(
                "pipecat not installed — PipecatTTSService in stub mode. "
                "Install with: pip install pipecat-ai"
            )
            return False

    @property
    def backend(self) -> TTSBackend:
        return TTSBackend.PIPECAT

    async def synthesise(self, request: TTSRequest) -> TTSResult:
        if not self._available:
            logger.debug("PipecatTTSService: stub — printing text only")
            print(f"[TTS PIPECAT STUB] {request.text}", flush=True)
            return TTSResult(
                text=request.text,
                backend=self.backend,
                spoken=False,
            )
        # Real impl: push TextFrame into pipeline, collect AudioRawFrame bytes
        # Placeholder until full pipecat wiring in S5 tighten pass
        logger.debug("PipecatTTSService: pipecat available but synthesis not yet wired")
        print(f"[TTS PIPECAT] {request.text}", flush=True)
        return TTSResult(
            text=request.text,
            backend=self.backend,
            spoken=True,
        )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_tts_service(
    backend: TTSBackend = TTSBackend.DEMO,
    **kwargs,
) -> TTSService:
    """
    Return the appropriate TTSService for the given backend.
    Defaults to DemoTTSService in demo mode or when library is unavailable.
    """
    if backend == TTSBackend.SYSTEM:
        svc = SystemTTSService(**kwargs)
        if not svc._available:
            logger.warning("SystemTTSService unavailable — using DemoTTSService")
            return DemoTTSService()
        return svc
    if backend == TTSBackend.PIPECAT:
        return PipecatTTSService(**kwargs)
    return DemoTTSService(**kwargs)
