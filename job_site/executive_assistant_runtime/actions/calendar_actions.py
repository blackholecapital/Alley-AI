"""
calendar_actions.py — EXEC-AI-RAPID-002 / S8.4

Calendar action layer: list events, check availability, and create event
with confirmation gating.

Architecture:
  CalendarActions
    ├── handle_list()         → CALENDAR_LIST
    ├── handle_availability() → CALENDAR_AVAILABILITY
    └── handle_create()       → CALENDAR_CREATE  ← wired in S8.4, confirmation-gated

  register_calendar_handlers(router, provider)
    — replaces the CALENDAR_* stub handlers in ActionRouter

  create_calendar_actions(demo_mode, provider)
    — convenience factory

Confirmation gate integration (no changes to assistant_core.py needed):
  AssistantCore._main_reply_path() checks ActionResult.requires_confirmation.
  When True it:
    1. Stores pending_action = turn.raw_text in the session
    2. Prompts the user to confirm
  On "yes", AssistantCore._confirmation_path() replays the original raw_text
  through the router.  handle_create() receives the same (session_id, raw_text)
  pair and resolves to the already-parsed CreateEventRequest stored in
  CalendarActions._pending_creates.

  On "no", _confirmation_path(confirmed=False) clears the session and returns a
  cancellation message WITHOUT routing, so handle_create() is never called.
  Stale entries in _pending_creates are harmlessly overwritten on the next
  create request from the same session.

Date / time parsing:
  Keyword-based, no NLU.  Sufficient for demo golden path.
  Supported patterns (case-insensitive):
    Date  : tomorrow, today, monday … sunday (next occurrence), default=tomorrow
    Time  : "at 3pm", "at 15:00", "at 9:30am", default=10:00
    Dur.  : "for 30 minutes", "for 1 hour", "for 2 hours", default=30 min
    Title : text before date/time/duration keywords, stripped of verb phrases
    Attend: "with alice@example.com" or "with Alice"
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from .calendar_provider import (
    CalendarBackend,
    CalendarEvent,
    CalendarProvider,
    CreateEventRequest,
    TimeSlot,
    create_provider,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Date-window helpers (list / availability paths)
# ---------------------------------------------------------------------------

def _today_window(now: datetime) -> Tuple[datetime, datetime]:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight, midnight + timedelta(days=1)


def _tomorrow_window(now: datetime) -> Tuple[datetime, datetime]:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = midnight + timedelta(days=1)
    return start, start + timedelta(days=1)


def _week_window(now: datetime) -> Tuple[datetime, datetime]:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight, midnight + timedelta(days=7)


def _next_week_window(now: datetime) -> Tuple[datetime, datetime]:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = midnight + timedelta(days=7)
    return start, start + timedelta(days=7)


def _weekend_window(now: datetime) -> Tuple[datetime, datetime]:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    days_until_sat = (5 - midnight.weekday()) % 7 or 7
    sat = midnight + timedelta(days=days_until_sat)
    return sat, sat + timedelta(days=2)


def extract_time_window(
    text: str,
    now: Optional[datetime] = None,
) -> Tuple[datetime, datetime]:
    """
    Parse a natural-language date hint from text → (from_dt, to_dt).
    Keyword-based, no NLU.  Default window: today.
    """
    now = now or datetime.now(timezone.utc)
    lowered = text.lower()

    if "next week" in lowered:
        return _next_week_window(now)
    if "this week" in lowered or "week" in lowered:
        return _week_window(now)
    if "weekend" in lowered:
        return _weekend_window(now)
    if "tomorrow" in lowered:
        return _tomorrow_window(now)
    return _today_window(now)


def _label_for_window(from_dt: datetime, to_dt: datetime) -> str:
    delta = to_dt - from_dt
    now = datetime.now(timezone.utc)
    today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if from_dt == today_midnight and delta.days == 1:
        return "today"
    if from_dt == today_midnight + timedelta(days=1) and delta.days == 1:
        return "tomorrow"
    if delta.days == 7:
        return f"the next {delta.days} days"
    if delta.days == 2:
        return "the weekend"
    return f"the next {delta.days} days"


# ---------------------------------------------------------------------------
# Create-event text parser
# ---------------------------------------------------------------------------

# Verb phrases to strip before extracting the title
_BOOKING_VERBS = re.compile(
    r"^(book|create|schedule|add|set up|arrange|make)\s+(a|an|new)?\s*"
    r"(meeting|call|event|appointment|sync|standup|catch[- ]?up)?\s*",
    re.IGNORECASE,
)

# Time patterns: "at 3pm", "at 3:30pm", "at 15:00", "at 9:30 am"
_TIME_RE = re.compile(
    r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b",
    re.IGNORECASE,
)

# Duration patterns: "for 30 minutes", "for 1 hour", "for 2 hours", "for 1 hr"
_DURATION_RE = re.compile(
    r"\bfor\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b",
    re.IGNORECASE,
)

# Attendee: "with alice@example.com" or "with Alice"
# Stops before date/time keywords (tomorrow, today, at, on, for, monday…sunday).
_DATE_KW = (
    "tomorrow|today|at|on|for|next|this|monday|tuesday|wednesday"
    "|thursday|friday|saturday|sunday"
)
_WITH_RE = re.compile(
    rf"\bwith\s+((?!(?:{_DATE_KW})\b)[\w.@+\-]+(?:\s+(?!(?:{_DATE_KW})\b)[\w.@+\-]+)?)\b",
    re.IGNORECASE,
)

# Day-of-week: next occurrence
_DOW = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def _parse_time(text: str, base_date: datetime, default_hour: int = 10) -> datetime:
    """
    Extract wall-clock time from text and apply it to base_date.
    Returns base_date at default_hour:00 if no time keyword is found.
    """
    m = _TIME_RE.search(text)
    if not m:
        return base_date.replace(hour=default_hour, minute=0, second=0, microsecond=0)

    hour = int(m.group(1))
    minute = int(m.group(2)) if m.group(2) else 0
    meridiem = (m.group(3) or "").lower()

    if meridiem == "pm" and hour < 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0

    # Clamp to valid range
    hour = max(0, min(23, hour))
    minute = max(0, min(59, minute))

    return base_date.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _parse_duration(text: str, default_minutes: int = 30) -> int:
    """Return event duration in minutes extracted from text."""
    m = _DURATION_RE.search(text)
    if not m:
        return default_minutes
    amount = int(m.group(1))
    unit = m.group(2).lower()
    if unit.startswith("hour") or unit.startswith("hr"):
        return amount * 60
    return amount


def _parse_date(text: str, now: datetime) -> datetime:
    """
    Extract a target date from text.
    Supports: tomorrow, today, monday … sunday.
    Default: tomorrow.
    """
    lowered = text.lower()
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if "today" in lowered:
        return midnight
    if "tomorrow" in lowered:
        return midnight + timedelta(days=1)

    for day_name, target_dow in _DOW.items():
        if day_name in lowered:
            days_ahead = (target_dow - midnight.weekday()) % 7 or 7
            return midnight + timedelta(days=days_ahead)

    # Default: tomorrow
    return midnight + timedelta(days=1)


def _parse_attendees(text: str) -> List[str]:
    """Extract attendees from "with <name/email>" clause."""
    m = _WITH_RE.search(text)
    if not m:
        return []
    raw = m.group(1).strip()
    # If it looks like an email, return as-is; otherwise treat as display name
    return [raw]


def _strip_detail_phrases(text: str) -> str:
    """Remove date/time/duration/attendee phrases before extracting title."""
    result = text
    result = _TIME_RE.sub("", result)
    result = _DURATION_RE.sub("", result)
    result = _WITH_RE.sub("", result)
    # Remove date keywords
    for kw in ("tomorrow", "today", "next week", "this week",
               "monday", "tuesday", "wednesday", "thursday",
               "friday", "saturday", "sunday"):
        result = re.sub(rf"\b{re.escape(kw)}\b", "", result, flags=re.IGNORECASE)
    return result


def parse_create_request(text: str, now: datetime) -> CreateEventRequest:
    """
    Build a CreateEventRequest from a natural-language booking phrase.

    Examples:
      "book a meeting with alice@example.com tomorrow at 3pm for 1 hour"
      "schedule a call on friday at 10am for 30 minutes"
      "create a team sync today at 2pm"
    """
    date_dt = _parse_date(text, now)
    start_dt = _parse_time(text, date_dt)
    duration_minutes = _parse_duration(text)
    end_dt = start_dt + timedelta(minutes=duration_minutes)
    attendees = _parse_attendees(text)

    # Build title: strip booking verbs then remaining detail phrases
    title_raw = _BOOKING_VERBS.sub("", text).strip()
    title_raw = _strip_detail_phrases(title_raw).strip()
    title_raw = re.sub(r"\s{2,}", " ", title_raw).strip(" ,;.")
    title = title_raw if title_raw else "New Meeting"

    return CreateEventRequest(
        title=title,
        start_time=start_dt,
        end_time=end_dt,
        attendees=attendees,
        metadata={"source_text": text},
    )


def _format_create_prompt(req: CreateEventRequest) -> str:
    """Human-readable confirmation prompt showing parsed event details."""
    lines = ["I'll create the following event:"]
    lines.append(f"  Title     : {req.title}")
    lines.append(f"  Start     : {req.start_time.strftime('%a %-d %b  %H:%M')}")
    lines.append(f"  End       : {req.end_time.strftime('%H:%M')}")
    if req.attendees:
        lines.append(f"  Attendees : {', '.join(req.attendees)}")
    if req.location:
        lines.append(f"  Location  : {req.location}")
    lines.append("\nReply 'yes' to confirm or 'no' to cancel.")
    return "\n".join(lines)


def _format_created(event: CalendarEvent) -> str:
    """Confirmation message after an event is successfully created."""
    lines = [f"Done! '{event.title}' has been added to your calendar."]
    lines.append(f"  {event.human_range()}")
    if event.attendees:
        lines.append(f"  Attendees: {', '.join(event.attendees)}")
    if event.location:
        lines.append(f"  Location : {event.location}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Response formatters (read paths)
# ---------------------------------------------------------------------------

def _format_events(events: List[CalendarEvent], window_label: str) -> str:
    if not events:
        return (
            f"You have no scheduled events {window_label}. "
            "Shall I check your availability or book something?"
        )
    lines = [f"Your schedule {window_label}:"]
    for e in events:
        line = f"• {e.human_range()}  —  {e.title}"
        if e.location:
            line += f"  ({e.location})"
        lines.append(line)
    lines.append(f"\n{len(events)} event(s) found.")
    return "\n".join(lines)


def _format_availability(
    free_slots: List[TimeSlot],
    window_label: str,
    slot_duration_minutes: int,
) -> str:
    if not free_slots:
        return (
            f"No free {slot_duration_minutes}-minute slots found {window_label}. "
            "Try a different day or ask me to check your schedule."
        )
    lines = [
        f"Free {slot_duration_minutes}-minute slots {window_label} "
        f"(showing first {min(len(free_slots), 5)}):"
    ]
    for slot in free_slots[:5]:
        lines.append(f"• {slot.human_range()}")
    if len(free_slots) > 5:
        lines.append(f"  … and {len(free_slots) - 5} more.")
    lines.append('\nSay "book a meeting at <time>" to create an event.')
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CalendarActions
# ---------------------------------------------------------------------------

class CalendarActions:
    """
    Action handlers for the calendar path.

    Each public method matches HandlerFn: async (ActionRequest) -> ActionResult.
    Register into ActionRouter via register_calendar_handlers().

    Confirmation gate for handle_create():
      _pending_creates maps (session_id, raw_text) → CreateEventRequest.
      First call parses the request, stores it, and returns requires_confirmation=True.
      AssistantCore stores the raw_text as pending_action and prompts the user.
      When the user confirms, _confirmation_path replays the same raw_text through
      the router.  handle_create() finds the stored request and executes the write.
      Cancelled flows never reach handle_create() again; stale entries are
      overwritten on the next create request from the same session.
    """

    def __init__(
        self,
        provider: CalendarProvider,
        slot_duration_minutes: int = 30,
        now_fn=None,
    ) -> None:
        self._provider = provider
        self._slot_duration = slot_duration_minutes
        self._now_fn = now_fn or (lambda: datetime.now(timezone.utc))
        # (session_id, raw_text) → CreateEventRequest
        self._pending_creates: Dict[Tuple[str, str], CreateEventRequest] = {}

    # ------------------------------------------------------------------
    # handle_list — CALENDAR_LIST
    # ------------------------------------------------------------------

    async def handle_list(self, req) -> object:
        """List upcoming events; extracts date window from turn text."""
        from executive_assistant_runtime.core.action_router import ActionResult, ActionType

        now = self._now_fn()
        from_dt, to_dt = extract_time_window(req.turn.raw_text, now)
        window_label = _label_for_window(from_dt, to_dt)

        logger.debug(
            "CalendarActions.handle_list: user=%s window=[%s, %s)",
            req.turn.user_id,
            from_dt.isoformat(timespec="minutes"),
            to_dt.isoformat(timespec="minutes"),
        )

        try:
            events = await self._provider.list_events(req.turn.user_id, from_dt, to_dt)
        except Exception as exc:
            logger.error("CalendarActions.handle_list: provider error: %r", exc)
            return ActionResult(
                action_type=ActionType.CALENDAR_LIST,
                reply_text="I couldn't reach the calendar right now. Please try again.",
                success=False,
            )

        return ActionResult(
            action_type=ActionType.CALENDAR_LIST,
            reply_text=_format_events(events, window_label),
            success=True,
            payload={
                "event_count": len(events),
                "window_from": from_dt.isoformat(),
                "window_to": to_dt.isoformat(),
            },
        )

    # ------------------------------------------------------------------
    # handle_availability — CALENDAR_AVAILABILITY
    # ------------------------------------------------------------------

    async def handle_availability(self, req) -> object:
        """Check free slots in the requested window."""
        from executive_assistant_runtime.core.action_router import ActionResult, ActionType

        now = self._now_fn()
        from_dt, to_dt = extract_time_window(req.turn.raw_text, now)
        window_label = _label_for_window(from_dt, to_dt)

        logger.debug(
            "CalendarActions.handle_availability: user=%s window=[%s, %s) slot=%dmin",
            req.turn.user_id,
            from_dt.isoformat(timespec="minutes"),
            to_dt.isoformat(timespec="minutes"),
            self._slot_duration,
        )

        try:
            slots = await self._provider.check_availability(
                req.turn.user_id, from_dt, to_dt, self._slot_duration
            )
        except Exception as exc:
            logger.error("CalendarActions.handle_availability: provider error: %r", exc)
            return ActionResult(
                action_type=ActionType.CALENDAR_AVAILABILITY,
                reply_text="I couldn't check availability right now. Please try again.",
                success=False,
            )

        free = [s for s in slots if s.available]
        return ActionResult(
            action_type=ActionType.CALENDAR_AVAILABILITY,
            reply_text=_format_availability(free, window_label, self._slot_duration),
            success=True,
            payload={
                "total_slots": len(slots),
                "free_slots": len(free),
                "window_from": from_dt.isoformat(),
                "window_to": to_dt.isoformat(),
                "slot_duration_minutes": self._slot_duration,
            },
        )

    # ------------------------------------------------------------------
    # handle_create — CALENDAR_CREATE (confirmation-gated)
    # ------------------------------------------------------------------

    async def handle_create(self, req) -> object:
        """
        Create a new calendar event — confirmation required before any write.

        Two-phase flow (driven by AssistantCore's existing confirmation gate):

        Phase 1 — First call with this (session_id, raw_text):
          Parse event details from req.turn.raw_text.
          Store the CreateEventRequest under (session_id, raw_text).
          Return ActionResult(requires_confirmation=True, confirmation_prompt=...).
          AssistantCore stores raw_text as pending_action and prompts the user.

        Phase 2 — Confirmed replay (same session_id and raw_text):
          Retrieve and delete the stored CreateEventRequest.
          Call provider.create_event() — the ONLY write path.
          Return success ActionResult with event details.

        Invariant: provider.create_event() is NEVER called without the user
        first having received and acknowledged a confirmation prompt.
        """
        from executive_assistant_runtime.core.action_router import ActionResult, ActionType

        now = self._now_fn()
        session_id = req.turn.session_id
        raw_text = req.turn.raw_text
        key = (session_id, raw_text)

        # ------ Phase 2: confirmed replay --------------------------------
        if key in self._pending_creates:
            event_req = self._pending_creates.pop(key)
            logger.info(
                "CalendarActions.handle_create: CONFIRMED — creating event "
                "title=%r session=%s",
                event_req.title, session_id,
            )
            try:
                event = await self._provider.create_event(req.turn.user_id, event_req)
            except Exception as exc:
                logger.error("CalendarActions.handle_create: provider error: %r", exc)
                return ActionResult(
                    action_type=ActionType.CALENDAR_CREATE,
                    reply_text=(
                        "Something went wrong creating the event. "
                        "Please try again."
                    ),
                    success=False,
                )
            return ActionResult(
                action_type=ActionType.CALENDAR_CREATE,
                reply_text=_format_created(event),
                success=True,
                payload={
                    "event_id": event.event_id,
                    "title": event.title,
                    "start_time": event.start_time.isoformat(),
                    "end_time": event.end_time.isoformat(),
                },
            )

        # ------ Phase 1: parse + gate -----------------------------------
        logger.debug(
            "CalendarActions.handle_create: PHASE-1 parse — session=%s text=%r "
            "dialog_state=%s",
            session_id, raw_text, req.turn.dialog_state,
        )
        try:
            event_req = parse_create_request(raw_text, now)
        except Exception as exc:
            logger.error("CalendarActions.handle_create: parse error: %r", exc)
            return ActionResult(
                action_type=ActionType.CALENDAR_CREATE,
                reply_text=(
                    "I couldn't understand those event details. "
                    "Try: 'book a meeting tomorrow at 3pm for 30 minutes'."
                ),
                success=False,
            )

        # Only store the pending create when the session can actually gate the
        # confirmation.  AssistantCore._greeting_path routes through the action
        # router but transitions directly to ACTIVE (bypassing the confirmation
        # gate in _main_reply_path), so a create request arriving during the
        # greeting phase must not be pre-stored — it would be silently executed
        # on the next identical text without showing the user a confirmation.
        from executive_assistant_runtime.core.dialog_manager import DialogState
        if req.turn.dialog_state != DialogState.GREETING:
            self._pending_creates[key] = event_req
        prompt = _format_create_prompt(event_req)

        return ActionResult(
            action_type=ActionType.CALENDAR_CREATE,
            reply_text=prompt,
            success=True,
            requires_confirmation=True,
            confirmation_prompt=prompt,
            payload={
                "title": event_req.title,
                "start_time": event_req.start_time.isoformat(),
                "end_time": event_req.end_time.isoformat(),
                "attendees": event_req.attendees,
            },
        )


# ---------------------------------------------------------------------------
# Registration helper
# ---------------------------------------------------------------------------

def register_calendar_handlers(router, provider: CalendarProvider) -> CalendarActions:
    """
    Wire CalendarActions handlers into an existing ActionRouter, replacing
    the three CALENDAR_* stubs installed at S2.1.

    Returns the CalendarActions instance for inspection / testing.
    """
    from executive_assistant_runtime.core.action_router import ActionType

    cal = CalendarActions(provider)
    router.register_handler(ActionType.CALENDAR_LIST, cal.handle_list)
    router.register_handler(ActionType.CALENDAR_AVAILABILITY, cal.handle_availability)
    router.register_handler(ActionType.CALENDAR_CREATE, cal.handle_create)
    logger.info(
        "register_calendar_handlers: wired CalendarActions (provider=%s)",
        type(provider).__name__,
    )
    return cal


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_calendar_actions(
    demo_mode: bool = True,
    provider: Optional[CalendarProvider] = None,
    slot_duration_minutes: int = 30,
) -> CalendarActions:
    """
    Build a CalendarActions instance.
    Uses DemoCalendarProvider when demo_mode=True (default).
    Accepts an explicit provider to override both demo_mode and the default.
    """
    if provider is None:
        backend = CalendarBackend.DEMO if demo_mode else CalendarBackend.CALCOM
        provider = create_provider(backend)
    return CalendarActions(provider, slot_duration_minutes=slot_duration_minutes)
