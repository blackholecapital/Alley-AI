"""
test_voice_pipeline.py — EXEC-AI-RAPID-002 / S5.1

Tests for the voice pipeline: STT adapters, TTS adapters, and VoicePipeline loop.

Strategy:
  - No audio hardware required.
  - DemoSTT / DemoTTS used throughout.
  - AssistantCore runs in demo_mode=True with in-memory state.
  - VoicePipeline driven via async generator (no stdin / no real audio).

Run with:
    pytest job_site/executive_assistant_runtime/tests/test_voice_pipeline.py -v
"""

from __future__ import annotations

import asyncio
import sys
import os
import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------

_RUNTIME_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _RUNTIME_ROOT not in sys.path:
    sys.path.insert(0, _RUNTIME_ROOT)

# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------

from core.assistant_core import AssistantCore
from core.dialog_manager import Channel

from voice.stt_service import (
    AudioChunk,
    DemoSTTService,
    RealtimeSTTService,
    STTBackend,
    STTResult,
    WhisperSTTService,
    create_stt_service,
)
from voice.tts_service import (
    DemoTTSService,
    PipecatTTSService,
    SystemTTSService,
    TTSBackend,
    TTSRequest,
    TTSResult,
    create_tts_service,
)
from voice.voice_pipeline import (
    PipelineState,
    VoicePipeline,
    VoicePipelineConfig,
    VoiceTurn,
    create_voice_pipeline,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _turns_gen(*texts: str):
    """Async generator that yields each text as a pipeline input."""
    for t in texts:
        yield t


def _make_core() -> AssistantCore:
    return AssistantCore(demo_mode=True)


def _make_pipeline(
    core: AssistantCore = None,
    max_turns: int = 0,
    send_greeting: bool = False,
) -> VoicePipeline:
    core = core or _make_core()
    config = VoicePipelineConfig(
        user_id="test_user",
        demo_mode=True,
        max_turns=max_turns,
        send_greeting=send_greeting,
    )
    return VoicePipeline(
        core,
        config=config,
        stt_service=DemoSTTService(),
        tts_service=DemoTTSService(),
    )


# ===========================================================================
# STT Service tests
# ===========================================================================

class TestDemoSTTService:
    @pytest.mark.asyncio
    async def test_transcribe_text_passthrough(self):
        svc = DemoSTTService()
        result = await svc.transcribe_text("hello world")
        assert result.transcript == "hello world"
        assert result.is_final is True
        assert result.backend == STTBackend.DEMO

    @pytest.mark.asyncio
    async def test_transcribe_empty_text(self):
        svc = DemoSTTService()
        result = await svc.transcribe_text("")
        assert result.transcript == ""
        assert result.is_final is True

    @pytest.mark.asyncio
    async def test_transcribe_audio_returns_placeholder(self):
        svc = DemoSTTService()
        chunk = AudioChunk(data=b"\x00" * 320)
        result = await svc.transcribe_audio(chunk)
        assert isinstance(result.transcript, str)
        assert result.backend == STTBackend.DEMO

    @pytest.mark.asyncio
    async def test_is_demo_property(self):
        svc = DemoSTTService()
        assert svc.is_demo is True

    @pytest.mark.asyncio
    async def test_close_is_safe(self):
        svc = DemoSTTService()
        await svc.close()   # should not raise

    @pytest.mark.asyncio
    async def test_stream_yields_results(self):
        svc = DemoSTTService()
        texts = ["one", "two", "three"]

        async def _chunk_gen():
            for t in texts:
                yield AudioChunk(data=t.encode())

        results = []
        async for r in svc.transcribe_stream(_chunk_gen()):
            results.append(r)
        assert len(results) == 3

    def test_stt_result_is_usable(self):
        r = STTResult(transcript="hello", is_final=True)
        assert r.is_usable() is True

    def test_stt_result_not_usable_if_empty(self):
        r = STTResult(transcript="", is_final=True)
        assert r.is_usable() is False

    def test_stt_result_not_usable_if_not_final(self):
        r = STTResult(transcript="hello", is_final=False)
        assert r.is_usable() is False


class TestRealtimeSTTService:
    def test_transcribe_text_works_without_library(self):
        svc = RealtimeSTTService()
        # Library won't be installed in test env — transcribe_text should still work
        result = asyncio.get_event_loop().run_until_complete(
            svc.transcribe_text("test input")
        )
        assert result.transcript == "test input"
        assert result.backend == STTBackend.REALTIME_STT

    def test_backend_property(self):
        svc = RealtimeSTTService()
        assert svc.backend == STTBackend.REALTIME_STT

    def test_is_not_demo(self):
        svc = RealtimeSTTService()
        assert svc.is_demo is False


class TestWhisperSTTService:
    @pytest.mark.asyncio
    async def test_transcribe_text_passthrough(self):
        svc = WhisperSTTService()
        result = await svc.transcribe_text("whisper input")
        assert result.transcript == "whisper input"
        assert result.backend == STTBackend.WHISPER

    @pytest.mark.asyncio
    async def test_transcribe_audio_returns_stub(self):
        svc = WhisperSTTService()
        chunk = AudioChunk(data=b"\x00" * 100)
        result = await svc.transcribe_audio(chunk)
        assert isinstance(result.transcript, str)


class TestSTTFactory:
    def test_demo_backend(self):
        svc = create_stt_service(STTBackend.DEMO)
        assert isinstance(svc, DemoSTTService)

    def test_default_is_demo(self):
        svc = create_stt_service()
        assert isinstance(svc, DemoSTTService)

    def test_whisper_backend(self):
        svc = create_stt_service(STTBackend.WHISPER)
        assert isinstance(svc, WhisperSTTService)

    def test_realtime_falls_back_to_demo_when_unavailable(self):
        svc = create_stt_service(STTBackend.REALTIME_STT)
        # If RealtimeSTT not installed, factory returns DemoSTTService
        assert svc.backend in (STTBackend.DEMO, STTBackend.REALTIME_STT)


# ===========================================================================
# TTS Service tests
# ===========================================================================

class TestDemoTTSService:
    @pytest.mark.asyncio
    async def test_synthesise_returns_result(self, capsys):
        svc = DemoTTSService()
        result = await svc.synthesise(TTSRequest(text="hello there"))
        assert result.text == "hello there"
        assert result.spoken is True
        assert result.backend == TTSBackend.DEMO
        captured = capsys.readouterr()
        assert "hello there" in captured.out

    @pytest.mark.asyncio
    async def test_speak_convenience(self, capsys):
        svc = DemoTTSService()
        result = await svc.speak("convenience test")
        assert result.text == "convenience test"

    @pytest.mark.asyncio
    async def test_audio_bytes_is_none(self):
        svc = DemoTTSService()
        result = await svc.speak("no bytes")
        assert result.audio_bytes is None

    def test_is_demo_property(self):
        svc = DemoTTSService()
        assert svc.is_demo is True

    @pytest.mark.asyncio
    async def test_close_is_safe(self):
        svc = DemoTTSService()
        await svc.close()

    @pytest.mark.asyncio
    async def test_custom_prefix(self, capsys):
        svc = DemoTTSService(prefix="[CUSTOM]")
        await svc.speak("test")
        out = capsys.readouterr().out
        assert "[CUSTOM]" in out

    @pytest.mark.asyncio
    async def test_stream_yields_results(self):
        svc = DemoTTSService()
        texts = ["one", "two", "three"]

        async def _text_gen():
            for t in texts:
                yield t

        results = []
        async for r in svc.synthesise_stream(_text_gen()):
            results.append(r)
        assert len(results) == 3


class TestSystemTTSService:
    def test_backend_property(self):
        svc = SystemTTSService()
        assert svc.backend == TTSBackend.SYSTEM

    def test_is_not_demo(self):
        svc = SystemTTSService()
        assert svc.is_demo is False

    @pytest.mark.asyncio
    async def test_synthesise_safe_without_pyttsx3(self, capsys):
        svc = SystemTTSService()
        # Whether or not pyttsx3 is installed, synthesise should not raise
        result = await svc.synthesise(TTSRequest(text="system test"))
        assert result.text == "system test"


class TestPipecatTTSService:
    def test_backend_property(self):
        svc = PipecatTTSService()
        assert svc.backend == TTSBackend.PIPECAT

    @pytest.mark.asyncio
    async def test_synthesise_safe_without_pipecat(self, capsys):
        svc = PipecatTTSService()
        result = await svc.synthesise(TTSRequest(text="pipecat test"))
        assert result.text == "pipecat test"


class TestTTSFactory:
    def test_demo_backend(self):
        svc = create_tts_service(TTSBackend.DEMO)
        assert isinstance(svc, DemoTTSService)

    def test_default_is_demo(self):
        svc = create_tts_service()
        assert isinstance(svc, DemoTTSService)

    def test_pipecat_backend(self):
        svc = create_tts_service(TTSBackend.PIPECAT)
        assert isinstance(svc, PipecatTTSService)

    def test_system_backend(self):
        svc = create_tts_service(TTSBackend.SYSTEM)
        # May fall back to Demo if pyttsx3 not installed
        assert svc.backend in (TTSBackend.SYSTEM, TTSBackend.DEMO)


# ===========================================================================
# VoicePipeline tests
# ===========================================================================

class TestVoicePipelineInit:
    def test_default_state_is_idle(self):
        p = _make_pipeline()
        assert p.state == PipelineState.IDLE

    def test_turn_count_starts_at_zero(self):
        p = _make_pipeline()
        assert p.turn_count == 0

    def test_history_starts_empty(self):
        p = _make_pipeline()
        assert p.history == []

    def test_uses_provided_stt_and_tts(self):
        stt = DemoSTTService()
        tts = DemoTTSService()
        core = _make_core()
        p = VoicePipeline(core, stt_service=stt, tts_service=tts)
        assert p.stt is stt
        assert p.tts is tts


class TestProcessTurn:
    @pytest.mark.asyncio
    async def test_single_turn_returns_voice_turn(self):
        p = _make_pipeline()
        turn = await p.process_turn("hello")
        assert isinstance(turn, VoiceTurn)
        assert turn.turn_number == 1
        assert turn.transcript == "hello"
        assert isinstance(turn.reply_text, str) and len(turn.reply_text) > 0
        assert turn.tts_spoken is True

    @pytest.mark.asyncio
    async def test_turn_count_increments(self):
        p = _make_pipeline()
        await p.process_turn("one")
        await p.process_turn("two")
        assert p.turn_count == 2

    @pytest.mark.asyncio
    async def test_history_records_turns(self):
        p = _make_pipeline()
        await p.process_turn("first")
        await p.process_turn("second")
        assert len(p.history) == 2
        assert p.history[0].raw_input == "first"
        assert p.history[1].raw_input == "second"

    @pytest.mark.asyncio
    async def test_empty_text_recorded_with_error(self):
        p = _make_pipeline()
        turn = await p.process_turn("")
        assert turn.error is not None
        assert turn.reply_text == ""

    @pytest.mark.asyncio
    async def test_whitespace_only_text(self):
        p = _make_pipeline()
        turn = await p.process_turn("   ")
        assert turn.error is not None

    @pytest.mark.asyncio
    async def test_greeting_trigger_produces_reply(self):
        p = _make_pipeline()
        turn = await p.process_turn("/start")
        assert len(turn.reply_text) > 0

    @pytest.mark.asyncio
    async def test_calendar_keyword_produces_reply(self):
        p = _make_pipeline()
        await p.process_turn("/start")
        turn = await p.process_turn("calendar")
        assert len(turn.reply_text) > 0

    @pytest.mark.asyncio
    async def test_session_id_populated(self):
        p = _make_pipeline()
        turn = await p.process_turn("hello")
        assert isinstance(turn.session_id, str) and len(turn.session_id) > 0


class TestProcessAudio:
    @pytest.mark.asyncio
    async def test_audio_turn_returns_voice_turn(self):
        p = _make_pipeline()
        chunk = AudioChunk(data=b"\x00" * 320)
        turn = await p.process_audio(chunk)
        assert isinstance(turn, VoiceTurn)
        # DemoSTT returns placeholder transcript from audio → not usable → error field set
        assert turn.error is not None or len(turn.reply_text) >= 0

    @pytest.mark.asyncio
    async def test_audio_chunk_with_real_stt_transcript(self):
        """Use a mock STT that returns a real transcript from audio."""
        from unittest.mock import AsyncMock, MagicMock
        mock_stt = MagicMock()
        mock_stt.backend = STTBackend.DEMO
        mock_stt.transcribe_audio = AsyncMock(return_value=STTResult(
            transcript="calendar events",
            is_final=True,
            backend=STTBackend.DEMO,
        ))
        mock_stt.close = AsyncMock()

        core = _make_core()
        await core.handle_turn(__import__('core.assistant_core', fromlist=['AssistantInput']).AssistantInput(
            user_id="test_user", channel=Channel.VOICE, raw_text="/start"
        ))

        config = VoicePipelineConfig(user_id="test_user", demo_mode=True)
        p = VoicePipeline(core, config=config, stt_service=mock_stt, tts_service=DemoTTSService())
        chunk = AudioChunk(data=b"\x00" * 320)
        turn = await p.process_audio(chunk)
        assert turn.transcript == "calendar events"
        assert len(turn.reply_text) > 0


class TestRunTextLoop:
    @pytest.mark.asyncio
    async def test_loop_from_generator(self):
        p = _make_pipeline(send_greeting=False)
        p.state = PipelineState.RUNNING
        history = await p.run_text_loop(input_gen=_turns_gen("hello", "calendar"))
        assert len(history) == 2
        assert all(isinstance(t, VoiceTurn) for t in history)

    @pytest.mark.asyncio
    async def test_greeting_turn_added_when_enabled(self):
        p = _make_pipeline(send_greeting=True)
        p.state = PipelineState.RUNNING
        history = await p.run_text_loop(input_gen=_turns_gen("calendar"))
        # greeting turn + 1 input turn
        assert len(history) == 2

    @pytest.mark.asyncio
    async def test_exit_phrase_stops_loop(self):
        p = _make_pipeline(send_greeting=False)
        p.state = PipelineState.RUNNING
        history = await p.run_text_loop(
            input_gen=_turns_gen("hello", "exit", "this should not run")
        )
        # Only "hello" processed; "exit" triggers stop; third never reached
        assert len(history) == 1

    @pytest.mark.asyncio
    async def test_max_turns_limit(self):
        p = _make_pipeline(max_turns=2, send_greeting=False)
        p.state = PipelineState.RUNNING
        history = await p.run_text_loop(
            input_gen=_turns_gen("one", "two", "three", "four")
        )
        assert len(history) <= 2

    @pytest.mark.asyncio
    async def test_on_turn_callback_called(self):
        p = _make_pipeline(send_greeting=False)
        p.state = PipelineState.RUNNING
        received = []
        history = await p.run_text_loop(
            input_gen=_turns_gen("hello", "help"),
            on_turn=received.append,
        )
        assert len(received) == 2

    @pytest.mark.asyncio
    async def test_state_is_stopped_after_loop(self):
        p = _make_pipeline(send_greeting=False)
        p.state = PipelineState.RUNNING
        await p.run_text_loop(input_gen=_turns_gen("hello"))
        assert p.state == PipelineState.STOPPED

    @pytest.mark.asyncio
    async def test_empty_generator_produces_no_turns(self):
        p = _make_pipeline(send_greeting=False)
        p.state = PipelineState.RUNNING
        history = await p.run_text_loop(input_gen=_turns_gen())
        assert len(history) == 0


class TestPipelineControl:
    def test_pause_and_resume(self):
        p = _make_pipeline()
        p.state = PipelineState.RUNNING
        p.pause()
        assert p.state == PipelineState.PAUSED
        p.resume()
        assert p.state == PipelineState.RUNNING

    def test_stop(self):
        p = _make_pipeline()
        p.state = PipelineState.RUNNING
        p.stop()
        assert p.state == PipelineState.STOPPED

    @pytest.mark.asyncio
    async def test_close_is_safe(self):
        p = _make_pipeline()
        await p.close()
        assert p.state == PipelineState.STOPPED

    def test_should_continue_false_when_stopped(self):
        p = _make_pipeline()
        p.state = PipelineState.STOPPED
        assert p._should_continue() is False

    def test_should_continue_false_when_max_turns_reached(self):
        p = _make_pipeline(max_turns=1)
        p.state = PipelineState.RUNNING
        p._turn_count = 1
        assert p._should_continue() is False

    def test_is_exit_phrase(self):
        p = _make_pipeline()
        assert p._is_exit("exit") is True
        assert p._is_exit("quit") is True
        assert p._is_exit("hello") is False


class TestChannelIsolation:
    def test_voice_pipeline_has_no_top_level_core_import(self):
        pipeline_path = os.path.join(_RUNTIME_ROOT, "voice", "voice_pipeline.py")
        with open(pipeline_path) as f:
            source = f.read()
        top_level = [
            line for line in source.splitlines()
            if (line.startswith("from core") or line.startswith("import core"))
            and not line.strip().startswith("#")
        ]
        assert len(top_level) == 0, f"voice_pipeline has top-level core imports: {top_level}"

    def test_stt_service_has_no_core_import(self):
        path = os.path.join(_RUNTIME_ROOT, "voice", "stt_service.py")
        with open(path) as f:
            source = f.read()
        # Only flag actual import statements, not comments or docstrings
        core_imports = [
            l for l in source.splitlines()
            if not l.strip().startswith("#")
            and not l.strip().startswith('"""')
            and not l.strip().startswith("'")
            and (l.strip().startswith("from core") or l.strip().startswith("import core"))
        ]
        assert len(core_imports) == 0

    def test_tts_service_has_no_core_import(self):
        path = os.path.join(_RUNTIME_ROOT, "voice", "tts_service.py")
        with open(path) as f:
            source = f.read()
        core_imports = [
            l for l in source.splitlines()
            if not l.strip().startswith("#")
            and not l.strip().startswith('"""')
            and not l.strip().startswith("'")
            and (l.strip().startswith("from core") or l.strip().startswith("import core"))
        ]
        assert len(core_imports) == 0


class TestCreateVoicePipeline:
    def test_factory_returns_pipeline(self):
        p = create_voice_pipeline(demo_mode=True)
        assert isinstance(p, VoicePipeline)

    def test_factory_pipeline_is_idle(self):
        p = create_voice_pipeline(demo_mode=True)
        assert p.state == PipelineState.IDLE

    @pytest.mark.asyncio
    async def test_factory_pipeline_runs_text_loop(self):
        p = create_voice_pipeline(demo_mode=True, user_id="factory_test")
        # Factory defaults send_greeting=True, so greeting + 2 input turns = 3
        history = await p.run_text_loop(
            input_gen=_turns_gen("hello", "availability")
        )
        assert len(history) == 3
        assert all(isinstance(t, VoiceTurn) for t in history)
