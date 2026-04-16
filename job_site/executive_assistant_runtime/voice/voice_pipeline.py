"""
voice_pipeline.py — EXEC-AI-RAPID-002 / S5.1

Voice channel pipeline loop.

Architecture:
  Input (audio bytes OR transcript text)
    → STTService.transcribe_*()  → STTResult
    → AssistantCore.handle_turn() → AssistantOutput
    → TTSService.synthesise()    → TTSResult (audio OR demo output)

VoicePipeline is the only object that touches both the voice services and
AssistantCore. STTService and TTSService know nothing about the core.
AssistantCore knows nothing about voice services.

Demo-mode loop:
  VoicePipeline.run_text_loop() accepts text from stdin (or a provided
  async generator) and drives the full pipeline without any audio hardware.
  This is the primary path exercised in S5 tests and golden-path demos.

References:
  - https://github.com/pipecat-ai/pipecat        (frame pipeline design)
  - https://github.com/pipecat-ai/pipecat-examples (pipeline run patterns)
  - https://github.com/KoljaB/RealtimeSTT        (real-time audio loop)
"""

from __future__ import annotations

import asyncio
import logging
import sys
import os
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Callable, List, Optional

from .stt_service import (
    AudioChunk,
    DemoSTTService,
    STTBackend,
    STTResult,
    STTService,
    create_stt_service,
)
from .tts_service import (
    DemoTTSService,
    TTSBackend,
    TTSResult,
    TTSService,
    create_tts_service,
)

# Core import — deferred inside methods so the voice package remains
# importable without core/ on sys.path at module load time.

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pipeline configuration
# ---------------------------------------------------------------------------

@dataclass
class VoicePipelineConfig:
    """
    All tunable knobs for a VoicePipeline instance.
    Defaults produce a fully functional demo-mode pipeline.
    """
    user_id: str = "voice_user"
    demo_mode: bool = True

    # STT
    stt_backend: STTBackend = STTBackend.DEMO
    stt_kwargs: dict = field(default_factory=dict)

    # TTS
    tts_backend: TTSBackend = TTSBackend.DEMO
    tts_kwargs: dict = field(default_factory=dict)

    # Loop behaviour
    exit_phrases: List[str] = field(
        default_factory=lambda: ["exit", "quit", "bye", "goodbye", "stop"]
    )
    max_turns: int = 0          # 0 = unlimited
    turn_timeout_secs: float = 30.0

    # Greeting
    send_greeting: bool = True


# ---------------------------------------------------------------------------
# Per-turn record
# ---------------------------------------------------------------------------

@dataclass
class VoiceTurn:
    """Record of one complete STT → core → TTS cycle."""
    turn_number: int
    raw_input: str          # text delivered to STT (or "" for audio-only)
    transcript: str         # what STT produced
    reply_text: str         # what AssistantCore produced
    tts_spoken: bool        # whether TTS played audio
    session_id: str = ""
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Pipeline state
# ---------------------------------------------------------------------------

class PipelineState(str, Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    STOPPED = "STOPPED"
    ERROR = "ERROR"


# ---------------------------------------------------------------------------
# VoicePipeline
# ---------------------------------------------------------------------------

class VoicePipeline:
    """
    Orchestrates the STT → AssistantCore → TTS loop for the voice channel.

    Instantiate once per voice session. The pipeline holds references to:
      - an STTService
      - a TTSService
      - an AssistantCore (received from outside; never constructed here)

    Entry points:
      run_text_loop()   — demo / test loop, reads text from stdin or an
                          async generator (no audio hardware required)
      process_turn()    — single STT → core → TTS cycle (call from custom loop)
      process_audio()   — single audio chunk → STT → core → TTS cycle
    """

    def __init__(
        self,
        assistant_core,                         # AssistantCore instance
        config: Optional[VoicePipelineConfig] = None,
        stt_service: Optional[STTService] = None,
        tts_service: Optional[TTSService] = None,
    ) -> None:
        self.config = config or VoicePipelineConfig()
        self.core = assistant_core
        self.stt = stt_service or create_stt_service(
            self.config.stt_backend, **self.config.stt_kwargs
        )
        self.tts = tts_service or create_tts_service(
            self.config.tts_backend, **self.config.tts_kwargs
        )
        self.state = PipelineState.IDLE
        self._turn_count = 0
        self._history: List[VoiceTurn] = []
        logger.info(
            "VoicePipeline ready | user=%s stt=%s tts=%s demo=%s",
            self.config.user_id,
            self.stt.backend,
            self.tts.backend,
            self.config.demo_mode,
        )

    # ------------------------------------------------------------------
    # Public: single-turn processing
    # ------------------------------------------------------------------

    async def process_turn(self, text: str) -> VoiceTurn:
        """
        Run one complete pipeline turn from text input.

        Steps:
          1. STT.transcribe_text(text) — normalise input
          2. AssistantCore.handle_turn(transcript) — get reply
          3. TTS.synthesise(reply) — speak or log

        Returns a VoiceTurn record.
        """
        self._turn_count += 1
        turn_num = self._turn_count

        # Step 1 — STT
        try:
            stt_result: STTResult = await self.stt.transcribe_text(text)
        except Exception as exc:
            logger.error("VoicePipeline: STT error on turn %d: %r", turn_num, exc)
            stt_result = STTResult(transcript=text, backend=self.stt.backend)

        transcript = stt_result.transcript.strip()
        if not transcript:
            logger.debug("VoicePipeline: empty transcript on turn %d — skipping", turn_num)
            record = VoiceTurn(
                turn_number=turn_num,
                raw_input=text,
                transcript="",
                reply_text="",
                tts_spoken=False,
                error="empty transcript",
            )
            self._history.append(record)
            return record

        # Step 2 — AssistantCore
        try:
            inp = self._make_input(transcript)
            output = await self.core.handle_turn(inp)
            reply_text = output.reply_text
            session_id = output.session_id
        except Exception as exc:
            logger.error("VoicePipeline: core error on turn %d: %r", turn_num, exc)
            reply_text = (
                "I encountered an error processing your request. Please try again."
            )
            session_id = ""

        # Step 3 — TTS
        try:
            tts_result: TTSResult = await self.tts.speak(reply_text)
            spoken = tts_result.spoken
        except Exception as exc:
            logger.error("VoicePipeline: TTS error on turn %d: %r", turn_num, exc)
            print(f"[TTS FALLBACK] {reply_text}", flush=True)
            spoken = False

        record = VoiceTurn(
            turn_number=turn_num,
            raw_input=text,
            transcript=transcript,
            reply_text=reply_text,
            tts_spoken=spoken,
            session_id=session_id,
        )
        self._history.append(record)
        logger.debug(
            "VoicePipeline: turn %d | transcript=%r reply=%r spoken=%s",
            turn_num, transcript[:60], reply_text[:60], spoken,
        )
        return record

    async def process_audio(self, chunk: AudioChunk) -> VoiceTurn:
        """
        Run one complete pipeline turn from raw audio bytes.
        Delegates to STT.transcribe_audio() then feeds into process_turn().
        """
        self._turn_count += 1
        turn_num = self._turn_count

        try:
            stt_result = await self.stt.transcribe_audio(chunk)
        except Exception as exc:
            logger.error("VoicePipeline: audio STT error on turn %d: %r", turn_num, exc)
            stt_result = STTResult(
                transcript="[audio transcription failed]",
                is_final=True,
                backend=self.stt.backend,
            )

        if not stt_result.is_usable():
            record = VoiceTurn(
                turn_number=turn_num,
                raw_input="<audio>",
                transcript=stt_result.transcript,
                reply_text="",
                tts_spoken=False,
                error="non-final or empty transcript",
            )
            self._history.append(record)
            return record

        # Reuse text-based path from here
        self._turn_count -= 1   # process_turn will increment again
        return await self.process_turn(stt_result.transcript)

    # ------------------------------------------------------------------
    # Public: demo / interactive text loop
    # ------------------------------------------------------------------

    async def run_text_loop(
        self,
        input_gen: Optional[AsyncIterator[str]] = None,
        on_turn: Optional[Callable[[VoiceTurn], None]] = None,
    ) -> List[VoiceTurn]:
        """
        Drive the pipeline in text mode — no audio hardware required.

        If input_gen is provided, reads from it (useful for tests / scripted demos).
        Otherwise reads from stdin interactively.

        Exit when:
          - input_gen is exhausted
          - user types an exit phrase (see VoicePipelineConfig.exit_phrases)
          - max_turns reached (if config.max_turns > 0)
          - KeyboardInterrupt

        Args:
            input_gen: optional async iterator yielding text turns
            on_turn:   optional callback invoked with each VoiceTurn

        Returns:
            list of all VoiceTurn records from this session
        """
        self.state = PipelineState.RUNNING
        logger.info("VoicePipeline: text loop started | user=%s", self.config.user_id)

        # Optional greeting turn
        if self.config.send_greeting:
            greeting_turn = await self.process_turn("hello")
            if on_turn:
                on_turn(greeting_turn)

        try:
            if input_gen is not None:
                await self._run_from_generator(input_gen, on_turn)
            else:
                await self._run_interactive(on_turn)
        except KeyboardInterrupt:
            logger.info("VoicePipeline: interrupted by user")
        except Exception as exc:
            logger.error("VoicePipeline: text loop error: %r", exc)
            self.state = PipelineState.ERROR
        finally:
            if self.state == PipelineState.RUNNING:
                self.state = PipelineState.STOPPED

        logger.info(
            "VoicePipeline: text loop ended | turns=%d", self._turn_count
        )
        return list(self._history)

    async def _run_from_generator(
        self,
        gen: AsyncIterator[str],
        on_turn: Optional[Callable[[VoiceTurn], None]],
    ) -> None:
        async for text in gen:
            if not self._should_continue():
                break
            text = text.strip()
            if self._is_exit(text):
                logger.info("VoicePipeline: exit phrase detected")
                break
            if not text:
                continue
            turn = await self.process_turn(text)
            if on_turn:
                on_turn(turn)

    async def _run_interactive(
        self, on_turn: Optional[Callable[[VoiceTurn], None]]
    ) -> None:
        loop = asyncio.get_event_loop()
        print("\n[Voice Pipeline] Type your message (or 'exit' to quit):\n", flush=True)
        while self._should_continue():
            try:
                text = await loop.run_in_executor(None, input, "You: ")
            except EOFError:
                break
            text = text.strip()
            if self._is_exit(text):
                print("[Voice Pipeline] Goodbye.", flush=True)
                break
            if not text:
                continue
            turn = await self.process_turn(text)
            if on_turn:
                on_turn(turn)

    def _should_continue(self) -> bool:
        if self.state != PipelineState.RUNNING:
            return False
        if self.config.max_turns > 0 and self._turn_count >= self.config.max_turns:
            return False
        return True

    def _is_exit(self, text: str) -> bool:
        return text.lower() in self.config.exit_phrases

    # ------------------------------------------------------------------
    # Public: pipeline control
    # ------------------------------------------------------------------

    def pause(self) -> None:
        if self.state == PipelineState.RUNNING:
            self.state = PipelineState.PAUSED
            logger.debug("VoicePipeline: paused")

    def resume(self) -> None:
        if self.state == PipelineState.PAUSED:
            self.state = PipelineState.RUNNING
            logger.debug("VoicePipeline: resumed")

    def stop(self) -> None:
        self.state = PipelineState.STOPPED
        logger.debug("VoicePipeline: stopped")

    async def close(self) -> None:
        self.stop()
        await self.stt.close()
        await self.tts.close()

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    @property
    def turn_count(self) -> int:
        return self._turn_count

    @property
    def history(self) -> List[VoiceTurn]:
        return list(self._history)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _make_input(self, transcript: str):
        """Build a channel-agnostic AssistantInput for the voice channel."""
        _runtime_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _runtime_root not in sys.path:
            sys.path.insert(0, _runtime_root)

        from core.assistant_core import AssistantInput
        from core.dialog_manager import Channel

        return AssistantInput(
            user_id=self.config.user_id,
            channel=Channel.VOICE,
            raw_text=transcript,
            metadata={"channel": "voice", "demo_mode": self.config.demo_mode},
        )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_voice_pipeline(
    demo_mode: bool = True,
    user_id: str = "voice_user",
    stt_backend: STTBackend = STTBackend.DEMO,
    tts_backend: TTSBackend = TTSBackend.DEMO,
) -> VoicePipeline:
    """
    Convenience factory: wire AssistantCore + services → VoicePipeline.
    Called by one-command boot (start_all.sh) and tests.
    """
    _runtime_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _runtime_root not in sys.path:
        sys.path.insert(0, _runtime_root)

    from core.assistant_core import AssistantCore

    config = VoicePipelineConfig(
        user_id=user_id,
        demo_mode=demo_mode,
        stt_backend=stt_backend,
        tts_backend=tts_backend,
    )
    core = AssistantCore(demo_mode=demo_mode)
    return VoicePipeline(core, config=config)


# ---------------------------------------------------------------------------
# CLI entry point — demo text loop
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    pipeline = create_voice_pipeline(demo_mode=True)
    asyncio.run(pipeline.run_text_loop())
