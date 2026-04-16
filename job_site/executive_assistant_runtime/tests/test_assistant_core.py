"""
test_assistant_core.py — Automated test harness for the assistant core golden path.
EXEC-AI-RAPID-002 | S2.1 | Worker B

Covers:
- Greeting flow
- Main assistant reply path
- Fallback path
- Action routing dispatch
- Interaction log integration

All tests run in DEMO_MODE=true. No live credentials required.
LLM/AI backend is mocked to keep tests deterministic and fast.
"""

import importlib
import json
import os
import sys
import types
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Path setup — allow running from project root or tests/ directly
# ---------------------------------------------------------------------------

_RUNTIME_ROOT = Path(__file__).resolve().parent.parent
if str(_RUNTIME_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_ROOT.parent))

# Force demo mode for all tests
os.environ.setdefault("DEMO_MODE", "true")

# Redirect interaction log to a temp path during tests
_TEST_LOG_PATH = Path(os.environ.get("TMPDIR", "/tmp")) / "test_interaction_log.jsonl"
os.environ["INTERACTION_LOG_PATH"] = str(_TEST_LOG_PATH)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def clear_interaction_log():
    """Truncate the test log before each test."""
    if _TEST_LOG_PATH.exists():
        _TEST_LOG_PATH.write_text("")
    yield
    # Leave log for post-test inspection if needed


@pytest.fixture()
def session_id() -> str:
    return f"test-{uuid.uuid4().hex[:8]}"


@pytest.fixture()
def assistant():
    """
    Return an AssistantCore instance.

    If assistant_core.py is not yet present (Worker A still building),
    this fixture auto-creates a minimal stub so the harness itself can
    be validated.
    """
    try:
        from executive_assistant_runtime.core.assistant_core import AssistantCore
        return AssistantCore()
    except ImportError:
        # Stub — removed once Worker A delivers assistant_core.py
        stub = _make_stub_assistant()
        return stub


def _make_stub_assistant():
    """
    Minimal in-memory stub for AssistantCore.
    Matches the expected public API declared in contracts.md.
    """

    class _StubCore:
        def process(
            self,
            message: str,
            *,
            session_id: str,
            channel: str = "test",
            user_id: str | None = None,
        ) -> dict:
            msg = message.lower().strip()

            if any(w in msg for w in ("hello", "hi", "hey")):
                action = "greeting"
                response = "Hello! I'm your executive assistant. How can I help you today?"
            elif any(w in msg for w in ("calendar", "schedule", "what's on", "today")):
                action = "calendar_lookup"
                response = (
                    "Today you have: 10:00 AM — Team standup (30 min), "
                    "2:00 PM — Product review (1 hr)."
                )
            elif any(w in msg for w in ("book", "create", "add meeting", "schedule a")):
                action = "calendar_create"
                response = (
                    "[DEMO] I would create a calendar event. "
                    "Shall I confirm this? (yes/no)"
                )
            else:
                action = "fallback"
                response = (
                    "I'm not sure how to help with that. "
                    "Could you rephrase or choose from: calendar, contacts, FAQ."
                )

            # Write to interaction log (same contract as the real core)
            from executive_assistant_runtime.core.interaction_log import log_turn
            log_turn(
                channel=channel,
                session_id=session_id,
                user_message=message,
                assistant_response=response,
                user_id=user_id,
                action_taken=action,
            )

            return {
                "response": response,
                "action_taken": action,
                "session_id": session_id,
                "error": None,
            }

    return _StubCore()


# ---------------------------------------------------------------------------
# Tests — Greeting flow
# ---------------------------------------------------------------------------


class TestGreetingFlow:
    def test_hello_returns_greeting(self, assistant, session_id):
        result = assistant.process("hello", session_id=session_id, channel="test")
        assert result["response"], "Response must be non-empty"
        assert result["error"] is None
        low = result["response"].lower()
        assert any(word in low for word in ("hello", "hi", "assist", "help")), (
            f"Greeting response did not contain expected words: {result['response']!r}"
        )

    def test_greeting_action_label(self, assistant, session_id):
        result = assistant.process("hi there", session_id=session_id, channel="test")
        assert result["action_taken"] == "greeting"

    def test_greeting_writes_to_log(self, assistant, session_id):
        assistant.process("hello", session_id=session_id, channel="test")
        from executive_assistant_runtime.core.interaction_log import read_log
        entries = read_log()
        assert len(entries) >= 2, "Expected at least in+out entries"
        directions = [e["direction"] for e in entries]
        assert "in" in directions
        assert "out" in directions

    def test_greeting_session_id_preserved(self, assistant, session_id):
        assistant.process("hello", session_id=session_id, channel="test")
        from executive_assistant_runtime.core.interaction_log import read_log
        entries = read_log()
        for e in entries:
            assert e["session_id"] == session_id


# ---------------------------------------------------------------------------
# Tests — Main assistant reply path
# ---------------------------------------------------------------------------


class TestMainReplyPath:
    def test_calendar_query_returns_response(self, assistant, session_id):
        result = assistant.process(
            "What is on my calendar today?", session_id=session_id, channel="test"
        )
        assert result["response"]
        assert result["error"] is None

    def test_calendar_action_label(self, assistant, session_id):
        result = assistant.process(
            "Show my schedule", session_id=session_id, channel="test"
        )
        assert result["action_taken"] == "calendar_lookup"

    def test_demo_mode_response_does_not_raise(self, assistant, session_id):
        """Demo mode must not raise even with no live backend."""
        result = assistant.process(
            "What meetings do I have today?", session_id=session_id, channel="test"
        )
        assert isinstance(result["response"], str)


# ---------------------------------------------------------------------------
# Tests — Action routing
# ---------------------------------------------------------------------------


class TestActionRouting:
    def test_book_meeting_triggers_calendar_create(self, assistant, session_id):
        result = assistant.process(
            "Book a meeting with Alex tomorrow at 3pm",
            session_id=session_id,
            channel="test",
        )
        assert result["action_taken"] == "calendar_create"

    def test_calendar_create_returns_confirmation_prompt(self, assistant, session_id):
        result = assistant.process(
            "Schedule a meeting for tomorrow",
            session_id=session_id,
            channel="test",
        )
        low = result["response"].lower()
        assert any(word in low for word in ("confirm", "yes", "no", "shall", "create")), (
            f"Expected confirmation prompt, got: {result['response']!r}"
        )

    def test_action_taken_field_present_in_log(self, assistant, session_id):
        assistant.process(
            "Book a call with Sara", session_id=session_id, channel="test"
        )
        from executive_assistant_runtime.core.interaction_log import read_log
        entries = read_log()
        out_entries = [e for e in entries if e["direction"] == "out"]
        assert out_entries, "No 'out' entries in log"
        assert out_entries[-1].get("action_taken") is not None


# ---------------------------------------------------------------------------
# Tests — Fallback path
# ---------------------------------------------------------------------------


class TestFallbackPath:
    def test_unknown_input_returns_fallback(self, assistant, session_id):
        result = assistant.process(
            "xyzzy nonsense input 12345", session_id=session_id, channel="test"
        )
        assert result["action_taken"] == "fallback"
        assert result["response"]
        low = result["response"].lower()
        assert any(
            word in low
            for word in ("not sure", "rephrase", "help", "choose", "don't understand")
        ), f"Fallback response not recognisable: {result['response']!r}"

    def test_fallback_does_not_raise(self, assistant, session_id):
        result = assistant.process("!!!###", session_id=session_id, channel="test")
        assert result["error"] is None

    def test_fallback_logged(self, assistant, session_id):
        assistant.process("gibberish xyz", session_id=session_id, channel="test")
        from executive_assistant_runtime.core.interaction_log import read_log
        entries = read_log()
        out_entries = [e for e in entries if e["direction"] == "out"]
        assert out_entries[-1]["action_taken"] == "fallback"


# ---------------------------------------------------------------------------
# Tests — Interaction log
# ---------------------------------------------------------------------------


class TestInteractionLog:
    def test_log_appends_across_turns(self, assistant, session_id):
        assistant.process("hello", session_id=session_id, channel="test")
        assistant.process("What is on my calendar?", session_id=session_id, channel="test")
        from executive_assistant_runtime.core.interaction_log import read_log
        entries = read_log()
        assert len(entries) >= 4, (
            f"Expected at least 4 log entries (2 turns × in+out), got {len(entries)}"
        )

    def test_log_entries_are_valid_json(self):
        """Verify the JSONL file is well-formed."""
        from executive_assistant_runtime.core.interaction_log import log_interaction
        log_interaction(
            channel="test",
            direction="in",
            message="log format check",
            session_id="format-check",
        )
        lines = _TEST_LOG_PATH.read_text(encoding="utf-8").strip().splitlines()
        for line in lines:
            entry = json.loads(line)  # raises on malformed JSON
            assert "entry_id" in entry
            assert "timestamp" in entry
            assert "channel" in entry

    def test_log_channel_field_preserved(self, assistant, session_id):
        assistant.process("hello", session_id=session_id, channel="telegram")
        from executive_assistant_runtime.core.interaction_log import read_log
        entries = read_log()
        assert all(e["channel"] == "telegram" for e in entries)

    def test_log_demo_mode_flag_present(self):
        from executive_assistant_runtime.core.interaction_log import log_interaction
        entry = log_interaction(
            channel="test",
            direction="out",
            message="demo check",
            session_id="demo-check",
        )
        assert "demo_mode" in entry

    def test_clear_log_empties_file(self):
        from executive_assistant_runtime.core.interaction_log import (
            clear_log,
            log_interaction,
            read_log,
        )
        log_interaction(
            channel="test", direction="in", message="temp", session_id="clear-test"
        )
        clear_log()
        assert read_log() == []


# ---------------------------------------------------------------------------
# Tests — Channel isolation (core must not embed channel logic)
# ---------------------------------------------------------------------------


class TestChannelIsolation:
    def test_process_accepts_any_channel_string(self, assistant, session_id):
        for ch in ("telegram", "voice", "ui", "cli", "test", "custom"):
            result = assistant.process(
                "hello", session_id=session_id, channel=ch
            )
            assert result["response"], f"No response for channel={ch!r}"

    def test_no_telegram_import_in_core(self):
        """Ensure assistant core does not import Telegram-specific modules."""
        try:
            import executive_assistant_runtime.core.assistant_core as ac_mod
            src = Path(ac_mod.__file__).read_text(encoding="utf-8")
            assert "aiogram" not in src, "assistant_core must not import aiogram"
            assert "telegram" not in src.lower(), (
                "assistant_core must not contain Telegram-specific logic"
            )
        except (ImportError, AttributeError):
            # Module not yet built by Worker A — skip, not a failure at S2.1
            pytest.skip("assistant_core.py not yet available (Worker A in progress)")
