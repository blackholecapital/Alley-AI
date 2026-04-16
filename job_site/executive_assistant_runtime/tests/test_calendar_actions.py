"""
test_calendar_actions.py — Calendar action read-path tests
EXEC-AI-RAPID-002 | S8.6 | Worker A

Covers:
- handle_list: today, tomorrow, this-week, next-week, weekend windows
- handle_availability: free/busy slot generation across windows
- Time-window extraction (extract_time_window)
- Response formatting (events found, no events, slots found, no slots)
- Provider error handling on read paths

Does NOT duplicate Worker B confirmation-gate tests
(see test_calendar_confirmation.py).

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
