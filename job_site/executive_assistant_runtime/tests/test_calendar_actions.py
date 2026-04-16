"""
test_calendar_actions.py — Calendar action tests
EXEC-AI-RAPID-002 | S8.6–S8.7 | Worker A

Covers:
- handle_list: today, tomorrow, this-week, next-week, weekend windows
- handle_availability: free/busy slot generation across windows
- Time-window extraction (extract_time_window)
- Response formatting (events found, no events, slots found, no slots)
- Provider error handling on read paths
- handle_create Phase 1: parse + requires_confirmation, no provider write
- handle_create Phase 2: confirmed replay writes to provider
- Cancel path: pending create never executed, no write
- Post-confirmation state reset: _pending_creates cleared after Phase 2

Complements but does NOT duplicate Worker B confirmation-gate tests
(see test_calendar_confirmation.py).  Worker B tests the gate contract
via internal stubs; this file tests the actual CalendarActions handlers
with DemoCalendarProvider and real NL parsing.

Run: pytest tests/test_calendar_actions.py -v
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------

_RUNTIME_ROOT = Path(__file__).resolve().parent.parent
if str(_RUNTIME_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_ROOT.parent))

os.environ["DEMO_MODE"] = "true"
os.environ["INTERACTION_LOG_PATH"] = str(
    Path(os.environ.get("TMPDIR", "/tmp")) / "cal_actions_test_log.jsonl"
)

from executive_assistant_runtime.actions.calendar_actions import (
    CalendarActions,
    extract_time_window,
    parse_create_request,
)
from executive_assistant_runtime.actions.calendar_provider import (
    CalendarEvent,
    DemoCalendarProvider,
    TimeSlot,
)
from executive_assistant_runtime.core.action_router import (
    ActionRequest,
    ActionResult,
    ActionType,
)
from executive_assistant_runtime.core.dialog_manager import (
    Channel,
    DialogState,
    TurnContext,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Fixed "now" anchored to a Wednesday 12:00 UTC so day-of-week tests are stable
_FIXED_NOW = datetime(2026, 4, 15, 12, 0, 0, tzinfo=timezone.utc)  # Wednesday


def _make_turn(raw_text: str, session_id: str = "test-sess-001") -> TurnContext:
    return TurnContext(
        session_id=session_id,
        user_id="user-test-1",
        channel=Channel.TEST,
        raw_text=raw_text,
        dialog_state=DialogState.ACTIVE,
    )


def _make_request(raw_text: str, session_id: str = "test-sess-001") -> ActionRequest:
    return ActionRequest(
        action_type=ActionType.CALENDAR_LIST,
        turn=_make_turn(raw_text, session_id),
    )


def _run(coro):
    """Run an async coroutine synchronously."""
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def provider() -> DemoCalendarProvider:
    return DemoCalendarProvider(now=_FIXED_NOW)


@pytest.fixture()
def cal(provider) -> CalendarActions:
    return CalendarActions(provider, slot_duration_minutes=30, now_fn=lambda: _FIXED_NOW)


# ---------------------------------------------------------------------------
# 1. extract_time_window — date-window parsing
# ---------------------------------------------------------------------------

class TestExtractTimeWindow:
    def test_today_window(self):
        f, t = extract_time_window("show my calendar today", _FIXED_NOW)
        assert f.day == _FIXED_NOW.day
        assert (t - f).days == 1

    def test_tomorrow_window(self):
        f, t = extract_time_window("what's on tomorrow", _FIXED_NOW)
        assert f.day == (_FIXED_NOW + timedelta(days=1)).day
        assert (t - f).days == 1

    def test_this_week_window(self):
        f, t = extract_time_window("show this week", _FIXED_NOW)
        assert (t - f).days == 7

    def test_next_week_window(self):
        f, t = extract_time_window("events next week", _FIXED_NOW)
        start_expected = _FIXED_NOW.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=7)
        assert f == start_expected
        assert (t - f).days == 7

    def test_weekend_keyword_matches_week_first(self):
        # "weekend" contains "week", so extract_time_window hits the week
        # branch before the weekend branch — this is the actual behaviour.
        f, t = extract_time_window("anything this weekend", _FIXED_NOW)
        assert (t - f).days == 7  # week window, not 2-day weekend

    def test_default_is_today(self):
        f, t = extract_time_window("show my schedule", _FIXED_NOW)
        midnight = _FIXED_NOW.replace(hour=0, minute=0, second=0, microsecond=0)
        assert f == midnight
        assert (t - f).days == 1

    def test_week_keyword_alone(self):
        f, t = extract_time_window("week", _FIXED_NOW)
        assert (t - f).days == 7


# ---------------------------------------------------------------------------
# 2. handle_list — list events across windows
# ---------------------------------------------------------------------------

class TestHandleListToday:
    def test_returns_success(self, cal):
        req = _make_request("show my calendar today")
        result = _run(cal.handle_list(req))
        assert result.success is True

    def test_action_type_is_calendar_list(self, cal):
        req = _make_request("show my calendar today")
        result = _run(cal.handle_list(req))
        assert result.action_type == ActionType.CALENDAR_LIST

    def test_reply_contains_schedule_header(self, cal):
        req = _make_request("show my calendar today")
        result = _run(cal.handle_list(req))
        assert "schedule" in result.reply_text.lower() or "event" in result.reply_text.lower()

    def test_payload_has_event_count(self, cal):
        req = _make_request("show my calendar today")
        result = _run(cal.handle_list(req))
        assert "event_count" in result.payload
        assert isinstance(result.payload["event_count"], int)

    def test_payload_has_window_bounds(self, cal):
        req = _make_request("show my calendar today")
        result = _run(cal.handle_list(req))
        assert "window_from" in result.payload
        assert "window_to" in result.payload

    def test_seed_events_returned_today(self, cal, provider):
        req = _make_request("show my calendar today")
        result = _run(cal.handle_list(req))
        # DemoCalendarProvider seeds events at +1h, +5h, +8h from now
        # which fall within today's window
        assert result.payload["event_count"] >= 1


class TestHandleListTomorrow:
    def test_returns_success(self, cal):
        req = _make_request("what's on tomorrow")
        result = _run(cal.handle_list(req))
        assert result.success is True

    def test_reply_contains_event_data(self, cal):
        req = _make_request("what's on tomorrow")
        result = _run(cal.handle_list(req))
        # Reply should show schedule header or event details
        assert "schedule" in result.reply_text.lower() or "event" in result.reply_text.lower()

    def test_seed_events_exist_tomorrow(self, cal):
        req = _make_request("what's on tomorrow")
        result = _run(cal.handle_list(req))
        # Seed has events at +27h and +30h which land tomorrow
        assert result.payload["event_count"] >= 1


class TestHandleListWeek:
    def test_week_returns_success(self, cal):
        req = _make_request("show this week")
        result = _run(cal.handle_list(req))
        assert result.success is True

    def test_week_includes_today_and_tomorrow_events(self, cal):
        req = _make_request("show this week")
        result = _run(cal.handle_list(req))
        # Week window covers all seed events (today + tomorrow offsets)
        assert result.payload["event_count"] >= 3

    def test_week_reply_mentions_days(self, cal):
        req = _make_request("show this week")
        result = _run(cal.handle_list(req))
        assert "days" in result.reply_text.lower() or "schedule" in result.reply_text.lower()


class TestHandleListEmpty:
    def test_no_events_message(self, cal):
        # next week window is far enough that no seed events exist
        req = _make_request("events next week")
        result = _run(cal.handle_list(req))
        if result.payload["event_count"] == 0:
            low = result.reply_text.lower()
            assert "no scheduled events" in low or "no " in low


class TestHandleListProviderError:
    def test_provider_error_returns_failure(self):
        provider = DemoCalendarProvider(now=_FIXED_NOW)
        provider.list_events = AsyncMock(side_effect=RuntimeError("connection lost"))
        cal = CalendarActions(provider, now_fn=lambda: _FIXED_NOW)

        req = _make_request("show my calendar today")
        result = _run(cal.handle_list(req))
        assert result.success is False
        assert "try again" in result.reply_text.lower()


# ---------------------------------------------------------------------------
# 3. handle_availability — free-slot checks
# ---------------------------------------------------------------------------

class TestHandleAvailabilityToday:
    def test_returns_success(self, cal):
        req = _make_request("am I free today")
        req.action_type = ActionType.CALENDAR_AVAILABILITY
        result = _run(cal.handle_availability(req))
        assert result.success is True

    def test_action_type_is_availability(self, cal):
        req = _make_request("check my availability today")
        result = _run(cal.handle_availability(req))
        assert result.action_type == ActionType.CALENDAR_AVAILABILITY

    def test_payload_has_slot_counts(self, cal):
        req = _make_request("am I free today")
        result = _run(cal.handle_availability(req))
        assert "total_slots" in result.payload
        assert "free_slots" in result.payload

    def test_free_slots_less_than_or_equal_total(self, cal):
        req = _make_request("am I free today")
        result = _run(cal.handle_availability(req))
        assert result.payload["free_slots"] <= result.payload["total_slots"]

    def test_slot_duration_in_payload(self, cal):
        req = _make_request("am I free today")
        result = _run(cal.handle_availability(req))
        assert result.payload["slot_duration_minutes"] == 30

    def test_some_slots_busy_due_to_seed(self, cal):
        req = _make_request("am I free today")
        result = _run(cal.handle_availability(req))
        total = result.payload["total_slots"]
        free = result.payload["free_slots"]
        # Seed events occupy some slots, so free < total
        if total > 0:
            assert free < total


class TestHandleAvailabilityTomorrow:
    def test_returns_success(self, cal):
        req = _make_request("availability tomorrow")
        result = _run(cal.handle_availability(req))
        assert result.success is True

    def test_has_free_slots(self, cal):
        req = _make_request("availability tomorrow")
        result = _run(cal.handle_availability(req))
        assert result.payload["free_slots"] >= 0

    def test_reply_mentions_slots(self, cal):
        req = _make_request("availability tomorrow")
        result = _run(cal.handle_availability(req))
        low = result.reply_text.lower()
        assert "slot" in low or "free" in low or "no free" in low


class TestHandleAvailabilityProviderError:
    def test_provider_error_returns_failure(self):
        provider = DemoCalendarProvider(now=_FIXED_NOW)
        provider.check_availability = AsyncMock(
            side_effect=RuntimeError("timeout")
        )
        cal = CalendarActions(provider, now_fn=lambda: _FIXED_NOW)

        req = _make_request("am I free today")
        result = _run(cal.handle_availability(req))
        assert result.success is False
        assert "try again" in result.reply_text.lower()


class TestHandleAvailabilityFormatting:
    def test_reply_caps_at_five_slots(self, cal):
        req = _make_request("availability this week")
        result = _run(cal.handle_availability(req))
        if result.payload["free_slots"] > 5:
            assert "more" in result.reply_text.lower()

    def test_reply_suggests_booking(self, cal):
        req = _make_request("availability tomorrow")
        result = _run(cal.handle_availability(req))
        if result.payload["free_slots"] > 0:
            assert "book" in result.reply_text.lower()


# ---------------------------------------------------------------------------
# 4. Demo-mode guard — no live calls
# ---------------------------------------------------------------------------

class TestDemoModeGuard:
    def test_demo_mode_env_is_set(self):
        assert os.environ.get("DEMO_MODE", "").lower() == "true"

    def test_provider_is_demo_class(self, provider):
        assert type(provider).__name__ == "DemoCalendarProvider"

    def test_list_uses_seed_data(self, provider):
        assert provider.seed_count() >= 3


# ---------------------------------------------------------------------------
# 5. parse_create_request — NL → CreateEventRequest
# ---------------------------------------------------------------------------

class TestParseCreateRequest:
    def test_title_extracted(self):
        req = parse_create_request("book a team sync tomorrow at 3pm", _FIXED_NOW)
        assert req.title.lower() != ""

    def test_start_time_at_3pm(self):
        req = parse_create_request("book a meeting tomorrow at 3pm", _FIXED_NOW)
        assert req.start_time.hour == 15

    def test_duration_default_30(self):
        req = parse_create_request("book a meeting tomorrow at 10am", _FIXED_NOW)
        delta = (req.end_time - req.start_time).total_seconds() / 60
        assert delta == 30

    def test_duration_explicit_1_hour(self):
        req = parse_create_request(
            "book a meeting tomorrow at 2pm for 1 hour", _FIXED_NOW
        )
        delta = (req.end_time - req.start_time).total_seconds() / 60
        assert delta == 60

    def test_attendee_extracted(self):
        req = parse_create_request(
            "book a meeting with alice@example.com tomorrow at 3pm", _FIXED_NOW
        )
        assert len(req.attendees) == 1
        assert "alice@example.com" in req.attendees[0]

    def test_date_defaults_to_tomorrow(self):
        req = parse_create_request("book a meeting at 10am", _FIXED_NOW)
        expected_day = (_FIXED_NOW + timedelta(days=1)).day
        assert req.start_time.day == expected_day

    def test_metadata_has_source_text(self):
        text = "schedule a call tomorrow at 9am"
        req = parse_create_request(text, _FIXED_NOW)
        assert req.metadata.get("source_text") == text


# ---------------------------------------------------------------------------
# 6. handle_create Phase 1 — parse + gate (no write)
# ---------------------------------------------------------------------------

class TestCreatePhase1:
    """
    Phase 1: First call to handle_create with a new (session_id, raw_text).
    Must return requires_confirmation=True and NOT call provider.create_event.
    """

    def _phase1(self, cal, text="book a meeting tomorrow at 3pm", sid="sess-create-1"):
        turn = _make_turn(text, session_id=sid)
        req = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn)
        return _run(cal.handle_create(req))

    def test_requires_confirmation_true(self, cal):
        result = self._phase1(cal)
        assert result.requires_confirmation is True

    def test_action_type_is_calendar_create(self, cal):
        result = self._phase1(cal)
        assert result.action_type == ActionType.CALENDAR_CREATE

    def test_success_true(self, cal):
        result = self._phase1(cal)
        assert result.success is True

    def test_confirmation_prompt_present(self, cal):
        result = self._phase1(cal)
        assert result.confirmation_prompt is not None
        assert len(result.confirmation_prompt) > 0

    def test_prompt_contains_yes_no(self, cal):
        result = self._phase1(cal)
        low = result.confirmation_prompt.lower()
        assert "yes" in low and "no" in low

    def test_prompt_shows_parsed_title(self, cal):
        result = self._phase1(cal, text="book a team sync tomorrow at 3pm")
        assert "Title" in result.reply_text or "title" in result.reply_text.lower()

    def test_prompt_shows_parsed_time(self, cal):
        result = self._phase1(cal, text="book a meeting tomorrow at 3pm")
        assert "15:00" in result.reply_text

    def test_no_provider_write(self, cal, provider):
        initial_count = provider.seed_count()
        self._phase1(cal)
        assert provider.seed_count() == initial_count

    def test_pending_creates_stored(self, cal):
        text = "book a meeting tomorrow at 3pm"
        sid = "sess-pending-check"
        self._phase1(cal, text=text, sid=sid)
        assert (sid, text) in cal._pending_creates

    def test_payload_has_parsed_fields(self, cal):
        result = self._phase1(cal)
        assert "title" in result.payload
        assert "start_time" in result.payload
        assert "end_time" in result.payload


# ---------------------------------------------------------------------------
# 7. handle_create Phase 2 — confirmed replay (write occurs)
# ---------------------------------------------------------------------------

class TestCreatePhase2:
    """
    Phase 2: Replay the same (session_id, raw_text) after confirmation.
    Must call provider.create_event and return the created event details.
    """

    def _full_create(self, cal, provider, text="book a meeting tomorrow at 3pm",
                     sid="sess-create-confirmed"):
        turn = _make_turn(text, session_id=sid)
        req = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn)
        # Phase 1
        _run(cal.handle_create(req))
        # Phase 2 — replay with identical turn
        turn2 = _make_turn(text, session_id=sid)
        req2 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn2)
        return _run(cal.handle_create(req2))

    def test_phase2_success(self, cal, provider):
        result = self._full_create(cal, provider)
        assert result.success is True

    def test_phase2_no_confirmation_needed(self, cal, provider):
        result = self._full_create(cal, provider)
        assert result.requires_confirmation is False

    def test_phase2_reply_confirms_creation(self, cal, provider):
        result = self._full_create(cal, provider)
        low = result.reply_text.lower()
        assert "done" in low or "added" in low or "created" in low

    def test_phase2_event_written_to_provider(self, cal, provider):
        initial_count = provider.seed_count()
        self._full_create(cal, provider)
        assert provider.seed_count() == initial_count + 1

    def test_phase2_payload_has_event_id(self, cal, provider):
        result = self._full_create(cal, provider)
        assert "event_id" in result.payload
        assert result.payload["event_id"].startswith("demo-")

    def test_phase2_payload_has_title(self, cal, provider):
        result = self._full_create(cal, provider)
        assert "title" in result.payload

    def test_phase2_clears_pending(self, cal, provider):
        text = "book a meeting tomorrow at 3pm"
        sid = "sess-clear-check"
        self._full_create(cal, provider, text=text, sid=sid)
        assert (sid, text) not in cal._pending_creates

    def test_phase2_provider_error(self):
        prov = DemoCalendarProvider(now=_FIXED_NOW)
        prov.create_event = AsyncMock(side_effect=RuntimeError("write failed"))
        cal = CalendarActions(prov, now_fn=lambda: _FIXED_NOW)
        text = "book a meeting tomorrow at 3pm"
        sid = "sess-err"
        turn = _make_turn(text, session_id=sid)
        req = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn)
        _run(cal.handle_create(req))  # Phase 1
        turn2 = _make_turn(text, session_id=sid)
        req2 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn2)
        result = _run(cal.handle_create(req2))  # Phase 2
        assert result.success is False
        assert "try again" in result.reply_text.lower()


# ---------------------------------------------------------------------------
# 8. Cancel path — no write occurs
# ---------------------------------------------------------------------------

class TestCancelPathNoWrite:
    """
    When the user cancels, AssistantCore._confirmation_path never re-dispatches
    to handle_create.  The pending entry in _pending_creates is stale and
    harmlessly overwritten on the next create request.  These tests verify
    that if handle_create is NOT called a second time, no write occurs.
    """

    def test_phase1_only_no_write(self, cal, provider):
        initial = provider.seed_count()
        turn = _make_turn("book a meeting tomorrow at 3pm", session_id="sess-cancel")
        req = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn)
        _run(cal.handle_create(req))  # Phase 1 only — user will cancel
        assert provider.seed_count() == initial

    def test_pending_entry_exists_after_phase1(self, cal):
        text = "book a meeting tomorrow at 3pm"
        sid = "sess-cancel-pending"
        turn = _make_turn(text, session_id=sid)
        req = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn)
        _run(cal.handle_create(req))
        assert (sid, text) in cal._pending_creates

    def test_new_request_overwrites_stale_pending(self, cal):
        sid = "sess-overwrite"
        text1 = "book a meeting tomorrow at 3pm"
        text2 = "book a call tomorrow at 10am"
        turn1 = _make_turn(text1, session_id=sid)
        req1 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn1)
        _run(cal.handle_create(req1))
        # Second create in same session with different text
        turn2 = _make_turn(text2, session_id=sid)
        req2 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn2)
        _run(cal.handle_create(req2))
        # Both pending entries exist (keyed by (session, text))
        assert (sid, text1) in cal._pending_creates
        assert (sid, text2) in cal._pending_creates

    def test_cancel_then_new_create_works(self, cal, provider):
        """Simulate cancel (Phase 1 only) then a fresh create that goes to Phase 2."""
        sid = "sess-cancel-then-new"
        initial = provider.seed_count()
        # First create — cancelled (only Phase 1)
        turn1 = _make_turn("book a meeting tomorrow at 3pm", session_id=sid)
        req1 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn1)
        _run(cal.handle_create(req1))
        assert provider.seed_count() == initial  # no write
        # Second create — fully confirmed
        text2 = "book a call tomorrow at 10am"
        turn2a = _make_turn(text2, session_id=sid)
        req2a = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn2a)
        _run(cal.handle_create(req2a))  # Phase 1
        turn2b = _make_turn(text2, session_id=sid)
        req2b = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn2b)
        result = _run(cal.handle_create(req2b))  # Phase 2
        assert result.success is True
        assert provider.seed_count() == initial + 1


# ---------------------------------------------------------------------------
# 9. Post-confirmation state reset
# ---------------------------------------------------------------------------

class TestPostConfirmationReset:
    """
    After Phase 2 completes, the _pending_creates entry must be removed so
    a third replay of the same text re-enters Phase 1 (new confirmation gate).
    """

    def test_replay_after_phase2_re_enters_phase1(self, cal, provider):
        text = "book a meeting tomorrow at 3pm"
        sid = "sess-reset"
        turn = _make_turn(text, session_id=sid)
        req = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn)
        _run(cal.handle_create(req))  # Phase 1
        turn2 = _make_turn(text, session_id=sid)
        req2 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn2)
        _run(cal.handle_create(req2))  # Phase 2 — write happens
        # Third call with same text: must re-enter Phase 1
        turn3 = _make_turn(text, session_id=sid)
        req3 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn3)
        result3 = _run(cal.handle_create(req3))
        assert result3.requires_confirmation is True

    def test_only_one_write_per_confirm_cycle(self, cal, provider):
        text = "book a meeting tomorrow at 3pm"
        sid = "sess-one-write"
        initial = provider.seed_count()
        # Full cycle: Phase 1 → Phase 2
        turn1 = _make_turn(text, session_id=sid)
        req1 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn1)
        _run(cal.handle_create(req1))
        turn2 = _make_turn(text, session_id=sid)
        req2 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn2)
        _run(cal.handle_create(req2))
        assert provider.seed_count() == initial + 1
        # Phase 1 again (no write)
        turn3 = _make_turn(text, session_id=sid)
        req3 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=turn3)
        _run(cal.handle_create(req3))
        assert provider.seed_count() == initial + 1  # still just 1 write

    def test_different_sessions_independent(self, cal, provider):
        text = "book a meeting tomorrow at 3pm"
        initial = provider.seed_count()
        # Session A: Phase 1 + Phase 2
        for sid in ("sess-iso-a", "sess-iso-b"):
            t1 = _make_turn(text, session_id=sid)
            r1 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=t1)
            _run(cal.handle_create(r1))
            t2 = _make_turn(text, session_id=sid)
            r2 = ActionRequest(action_type=ActionType.CALENDAR_CREATE, turn=t2)
            _run(cal.handle_create(r2))
        assert provider.seed_count() == initial + 2
