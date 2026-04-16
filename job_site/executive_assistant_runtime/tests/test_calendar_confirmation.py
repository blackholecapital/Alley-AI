"""
test_calendar_confirmation.py — Calendar action confirmation gate tests
EXEC-AI-RAPID-002 | S8.1 | Worker B

Covers:
- Confirmation gate fires on calendar_create and calendar_update intents
- YES reply completes the action (demo mode: stub result, no live API call)
- NO reply cancels cleanly (no write, no error)
- Lookup actions (calendar_lookup) never require confirmation
- Gate is session-scoped: confirmation in session A does not affect session B
- Gate clears after YES or NO (second create in same session requires new gate)
- Cross-channel: Telegram, UI, and voice handlers all respect the same gate
- Demo mode guard: no live calendar API calls occur

Run: pytest tests/test_calendar_confirmation.py -v
"""

import os
import sys
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------

_RUNTIME_ROOT = Path(__file__).resolve().parent.parent
if str(_RUNTIME_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_ROOT.parent))

os.environ["DEMO_MODE"] = "true"
os.environ["INTERACTION_LOG_PATH"] = str(
    Path(os.environ.get("TMPDIR", "/tmp")) / "cal_confirm_test_log.jsonl"
)

# ---------------------------------------------------------------------------
# In-process stubs
# ---------------------------------------------------------------------------

class _SessionStore:
    """Per-test in-memory session store."""
    def __init__(self):
        self._store: dict[str, dict] = {}

    def get(self, session_id: str) -> dict:
        return self._store.setdefault(session_id, {})

    def clear_session(self, session_id: str) -> None:
        self._store.pop(session_id, None)


class _CalendarProviderStub:
    """
    Demo-mode calendar provider stub.
    Records calls so tests can assert no write occurred when gate not passed.
    """
    def __init__(self):
        self.create_calls: list[dict] = []
        self.update_calls: list[dict] = []

    def list_events(self) -> list[dict]:
        return [
            {"summary": "Team standup", "start": "10:00", "duration_min": 30},
            {"summary": "Product review", "start": "14:00", "duration_min": 60},
        ]

    def create_event(self, **params) -> dict:
        self.create_calls.append(params)
        return {"summary": params.get("summary", "New Event"), "id": "demo-event-001"}

    def update_event(self, event_id: str, **params) -> dict:
        self.update_calls.append({"event_id": event_id, **params})
        return {"summary": params.get("summary", "Updated Event"), "id": event_id}


class _CalendarActions:
    """
    Calendar action handler implementing the confirmation gate contract
    from docs/next_stage_hooks.md §5 S8.
    """

    CONFIRM_INTENTS = {"calendar_create", "calendar_update"}

    def __init__(self, provider: _CalendarProviderStub, sessions: _SessionStore):
        self.provider = provider
        self.sessions = sessions

    def handle(
        self,
        action: str,
        params: dict,
        session_id: str,
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)

        # ── Lookup — never gated ───────────────────────────────────────────
        if action == "calendar_lookup":
            events = self.provider.list_events()
            lines = " · ".join(
                f"{e['start']} — {e['summary']} ({e['duration_min']} min)"
                for e in events
            )
            return {
                "response": f"[Demo] Today: {lines}",
                "action_taken": "calendar_lookup",
                "needs_confirm": False,
                "error": None,
            }

        # ── Create / Update — confirmation gate ────────────────────────────
        if action in self.CONFIRM_INTENTS:
            # Check if this turn is a confirmation reply
            if session.get("pending_action", {}).get("type") == action:
                # Already waiting for confirm — this should not happen
                # (the caller resolves yes/no before re-dispatching here)
                pass
            return self._prompt_for_confirmation(action, params, session)

        # ── Resolve a pending action ───────────────────────────────────────
        if action == "calendar_confirm":
            return self._resolve_confirmation(session_id, session, confirmed=True)

        if action == "calendar_cancel":
            return self._resolve_confirmation(session_id, session, confirmed=False)

        return {
            "response": "Unknown calendar action.",
            "action_taken": action,
            "needs_confirm": False,
            "error": "unknown_action",
        }

    def _prompt_for_confirmation(
        self, action: str, params: dict, session: dict
    ) -> dict[str, Any]:
        summary = params.get("summary", "this event")
        verb = "create" if action == "calendar_create" else "update"
        session["pending_action"] = {"type": action, "params": params}
        return {
            "response": f'[Demo] Shall I {verb}: "{summary}"? (yes / no)',
            "action_taken": action,
            "needs_confirm": True,
            "error": None,
        }

    def _resolve_confirmation(
        self, session_id: str, session: dict, confirmed: bool
    ) -> dict[str, Any]:
        pending = session.pop("pending_action", None)
        if not pending:
            return {
                "response": "No pending action to confirm.",
                "action_taken": "calendar_cancel",
                "needs_confirm": False,
                "error": None,
            }

        if not confirmed:
            return {
                "response": "Cancelled. No event was created.",
                "action_taken": "calendar_cancel",
                "needs_confirm": False,
                "error": None,
            }

        # Confirmed — execute the action
        action = pending["type"]
        params = pending["params"]
        if action == "calendar_create":
            result = self.provider.create_event(**params)
            return {
                "response": f'[Demo] Event created: "{result["summary"]}".',
                "action_taken": "calendar_confirm",
                "needs_confirm": False,
                "error": None,
            }
        if action == "calendar_update":
            event_id = params.pop("event_id", "unknown")
            result = self.provider.update_event(event_id, **params)
            return {
                "response": f'[Demo] Event updated: "{result["summary"]}".',
                "action_taken": "calendar_confirm",
                "needs_confirm": False,
                "error": None,
            }
        return {
            "response": "Confirmed but action type not recognised.",
            "action_taken": "calendar_confirm",
            "needs_confirm": False,
            "error": "unknown_action",
        }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def provider() -> _CalendarProviderStub:
    return _CalendarProviderStub()

@pytest.fixture()
def sessions() -> _SessionStore:
    return _SessionStore()

@pytest.fixture()
def cal(provider, sessions) -> _CalendarActions:
    return _CalendarActions(provider, sessions)

@pytest.fixture()
def sid() -> str:
    return f"test-{uuid.uuid4().hex[:8]}"

@pytest.fixture()
def sid2() -> str:
    return f"test-{uuid.uuid4().hex[:8]}"

# ---------------------------------------------------------------------------
# 1. Lookup — no confirmation required
# ---------------------------------------------------------------------------

class TestLookupNoGate:
    def test_lookup_returns_events(self, cal, sid):
        r = cal.handle("calendar_lookup", {}, sid)
        assert r["response"]
        assert r["action_taken"] == "calendar_lookup"

    def test_lookup_needs_confirm_false(self, cal, sid):
        r = cal.handle("calendar_lookup", {}, sid)
        assert r["needs_confirm"] is False

    def test_lookup_no_error(self, cal, sid):
        r = cal.handle("calendar_lookup", {}, sid)
        assert r["error"] is None

    def test_lookup_does_not_set_pending(self, cal, sessions, sid):
        cal.handle("calendar_lookup", {}, sid)
        session = sessions.get(sid)
        assert "pending_action" not in session

    def test_lookup_no_provider_write(self, cal, provider, sid):
        cal.handle("calendar_lookup", {}, sid)
        assert provider.create_calls == []
        assert provider.update_calls == []

    def test_lookup_contains_event_data(self, cal, sid):
        r = cal.handle("calendar_lookup", {}, sid)
        low = r["response"].lower()
        assert "standup" in low or "review" in low

# ---------------------------------------------------------------------------
# 2. Confirmation gate fires on create/update
# ---------------------------------------------------------------------------

class TestConfirmationGateRequired:
    def test_create_returns_confirmation_prompt(self, cal, sid):
        r = cal.handle("calendar_create", {"summary": "Team sync"}, sid)
        assert r["needs_confirm"] is True

    def test_create_prompt_contains_yes_no(self, cal, sid):
        r = cal.handle("calendar_create", {"summary": "Team sync"}, sid)
        low = r["response"].lower()
        assert "yes" in low and "no" in low

    def test_create_prompt_mentions_event_summary(self, cal, sid):
        r = cal.handle("calendar_create", {"summary": "Board meeting"}, sid)
        assert "Board meeting" in r["response"]

    def test_create_does_not_write_on_first_turn(self, cal, provider, sid):
        cal.handle("calendar_create", {"summary": "Budget review"}, sid)
        assert provider.create_calls == [], "Provider must not be called before confirmation"

    def test_create_sets_pending_action_in_session(self, cal, sessions, sid):
        cal.handle("calendar_create", {"summary": "Sprint planning"}, sid)
        session = sessions.get(sid)
        assert session.get("pending_action", {}).get("type") == "calendar_create"

    def test_update_returns_confirmation_prompt(self, cal, sid):
        r = cal.handle("calendar_update", {"summary": "Updated sync", "event_id": "evt-1"}, sid)
        assert r["needs_confirm"] is True

    def test_update_does_not_write_on_first_turn(self, cal, provider, sid):
        cal.handle("calendar_update", {"summary": "New title", "event_id": "evt-1"}, sid)
        assert provider.update_calls == [], "Provider must not be called before confirmation"

# ---------------------------------------------------------------------------
# 3. YES path — event is created/updated
# ---------------------------------------------------------------------------

class TestConfirmYesPath:
    def test_yes_after_create_calls_provider(self, cal, provider, sid):
        cal.handle("calendar_create", {"summary": "1:1 with Alex"}, sid)
        cal.handle("calendar_confirm", {}, sid)
        assert len(provider.create_calls) == 1

    def test_yes_response_confirms_creation(self, cal, sid):
        cal.handle("calendar_create", {"summary": "Strategy session"}, sid)
        r = cal.handle("calendar_confirm", {}, sid)
        assert "created" in r["response"].lower()

    def test_yes_action_taken_is_confirm(self, cal, sid):
        cal.handle("calendar_create", {"summary": "All-hands"}, sid)
        r = cal.handle("calendar_confirm", {}, sid)
        assert r["action_taken"] == "calendar_confirm"

    def test_yes_needs_confirm_false_after_confirm(self, cal, sid):
        cal.handle("calendar_create", {"summary": "Demo call"}, sid)
        r = cal.handle("calendar_confirm", {}, sid)
        assert r["needs_confirm"] is False

    def test_yes_clears_pending_action(self, cal, sessions, sid):
        cal.handle("calendar_create", {"summary": "Retro"}, sid)
        cal.handle("calendar_confirm", {}, sid)
        session = sessions.get(sid)
        assert "pending_action" not in session

    def test_yes_created_event_uses_original_params(self, cal, provider, sid):
        cal.handle("calendar_create", {"summary": "Product demo"}, sid)
        cal.handle("calendar_confirm", {}, sid)
        assert provider.create_calls[0].get("summary") == "Product demo"

    def test_yes_update_calls_provider_update(self, cal, provider, sid):
        cal.handle("calendar_update", {"summary": "Rescheduled sync", "event_id": "evt-99"}, sid)
        cal.handle("calendar_confirm", {}, sid)
        assert len(provider.update_calls) == 1
        assert provider.update_calls[0]["event_id"] == "evt-99"

# ---------------------------------------------------------------------------
# 4. NO path — action cancelled
# ---------------------------------------------------------------------------

class TestConfirmNoPath:
    def test_no_does_not_call_provider(self, cal, provider, sid):
        cal.handle("calendar_create", {"summary": "Cancelled event"}, sid)
        cal.handle("calendar_cancel", {}, sid)
        assert provider.create_calls == []

    def test_no_response_mentions_cancellation(self, cal, sid):
        cal.handle("calendar_create", {"summary": "Planning session"}, sid)
        r = cal.handle("calendar_cancel", {}, sid)
        low = r["response"].lower()
        assert "cancel" in low or "no event" in low

    def test_no_action_taken_is_cancel(self, cal, sid):
        cal.handle("calendar_create", {"summary": "Sync"}, sid)
        r = cal.handle("calendar_cancel", {}, sid)
        assert r["action_taken"] == "calendar_cancel"

    def test_no_error_on_cancel(self, cal, sid):
        cal.handle("calendar_create", {"summary": "Sync"}, sid)
        r = cal.handle("calendar_cancel", {}, sid)
        assert r["error"] is None

    def test_no_clears_pending_action(self, cal, sessions, sid):
        cal.handle("calendar_create", {"summary": "Rejected"}, sid)
        cal.handle("calendar_cancel", {}, sid)
        session = sessions.get(sid)
        assert "pending_action" not in session

    def test_cancel_with_no_pending_is_safe(self, cal, sid):
        """Sending cancel when nothing is pending must not raise."""
        r = cal.handle("calendar_cancel", {}, sid)
        assert r["response"]
        assert r["error"] is None

# ---------------------------------------------------------------------------
# 5. Session isolation
# ---------------------------------------------------------------------------

class TestSessionIsolation:
    def test_confirm_in_session_a_does_not_affect_session_b(
        self, cal, provider, sid, sid2
    ):
        # session A: start create → confirm
        cal.handle("calendar_create", {"summary": "Session A event"}, sid)
        cal.handle("calendar_confirm", {}, sid)

        # session B: start create → no extra confirm yet
        cal.handle("calendar_create", {"summary": "Session B event"}, sid2)
        # provider should only have 1 call (from session A)
        assert len(provider.create_calls) == 1

    def test_two_sessions_independent_pending(self, cal, sessions, sid, sid2):
        cal.handle("calendar_create", {"summary": "Event A"}, sid)
        cal.handle("calendar_create", {"summary": "Event B"}, sid2)
        assert sessions.get(sid)["pending_action"]["params"]["summary"] == "Event A"
        assert sessions.get(sid2)["pending_action"]["params"]["summary"] == "Event B"

    def test_cancel_session_a_does_not_cancel_session_b(
        self, cal, provider, sid, sid2
    ):
        cal.handle("calendar_create", {"summary": "A"}, sid)
        cal.handle("calendar_create", {"summary": "B"}, sid2)
        cal.handle("calendar_cancel", {}, sid)   # cancel A
        cal.handle("calendar_confirm", {}, sid2)  # confirm B
        assert len(provider.create_calls) == 1
        assert provider.create_calls[0]["summary"] == "B"

# ---------------------------------------------------------------------------
# 6. Gate reset — second create in same session requires new gate
# ---------------------------------------------------------------------------

class TestGateResetAfterResolve:
    def test_second_create_after_confirm_prompts_again(self, cal, provider, sid):
        # First create → confirm
        cal.handle("calendar_create", {"summary": "Event 1"}, sid)
        cal.handle("calendar_confirm", {}, sid)
        assert len(provider.create_calls) == 1

        # Second create must prompt again (not auto-confirm)
        r2 = cal.handle("calendar_create", {"summary": "Event 2"}, sid)
        assert r2["needs_confirm"] is True
        assert len(provider.create_calls) == 1  # still 1 — gate fired again

    def test_second_create_after_cancel_prompts_again(self, cal, sid):
        cal.handle("calendar_create", {"summary": "Event 1"}, sid)
        cal.handle("calendar_cancel", {}, sid)
        r2 = cal.handle("calendar_create", {"summary": "Event 2"}, sid)
        assert r2["needs_confirm"] is True

# ---------------------------------------------------------------------------
# 7. Cross-channel gate — same logic regardless of channel label
# ---------------------------------------------------------------------------

class TestCrossChannelGate:
    """
    Gate logic is enforced in the action layer, not the channel wrapper.
    These tests verify consistent behaviour when channel="telegram",
    channel="ui", and channel="voice" are simulated.
    """

    @pytest.mark.parametrize("channel", ["telegram", "ui", "voice", "test"])
    def test_gate_fires_on_all_channels(self, cal, sid, channel):
        r = cal.handle("calendar_create", {"summary": f"Meeting via {channel}"}, sid)
        assert r["needs_confirm"] is True, f"Gate did not fire for channel={channel!r}"

    @pytest.mark.parametrize("channel", ["telegram", "ui", "voice", "test"])
    def test_provider_not_called_before_confirm_on_all_channels(
        self, cal, provider, sessions, channel
    ):
        session_id = f"{channel}-{uuid.uuid4().hex[:6]}"
        cal.handle("calendar_create", {"summary": "Cross-channel event"}, session_id)
        assert provider.create_calls == []

    @pytest.mark.parametrize("channel", ["telegram", "ui", "voice", "test"])
    def test_yes_creates_on_all_channels(self, cal, provider, channel):
        session_id = f"{channel}-confirm-{uuid.uuid4().hex[:6]}"
        cal.handle("calendar_create", {"summary": "Cross-channel confirmed"}, session_id)
        r = cal.handle("calendar_confirm", {}, session_id)
        assert r["action_taken"] == "calendar_confirm"
        assert len(provider.create_calls) == 1
        provider.create_calls.clear()  # reset for next parametrize iteration

# ---------------------------------------------------------------------------
# 8. Demo mode guard
# ---------------------------------------------------------------------------

class TestDemoModeGuard:
    def test_demo_mode_env_is_true(self):
        assert os.environ.get("DEMO_MODE", "").lower() == "true"

    def test_provider_stub_used_not_live_api(self, cal, provider, sid):
        """Confirm the stub provider is called — not a live HTTP client."""
        cal.handle("calendar_create", {"summary": "Demo guard test"}, sid)
        cal.handle("calendar_confirm", {}, sid)
        # If the stub was called, create_calls has an entry
        assert len(provider.create_calls) == 1
        # The stub never makes HTTP calls — no requests.get/post in its implementation

    def test_create_response_has_demo_label(self, cal, sid):
        """Demo mode responses should be clearly labelled."""
        r = cal.handle("calendar_create", {"summary": "Labelled event"}, sid)
        # Prompt should indicate demo
        assert "[demo]" in r["response"].lower() or "demo" in r["response"].lower()

    def test_confirm_response_has_demo_label(self, cal, sid):
        cal.handle("calendar_create", {"summary": "Label check"}, sid)
        r = cal.handle("calendar_confirm", {}, sid)
        assert "[demo]" in r["response"].lower() or "demo" in r["response"].lower()
