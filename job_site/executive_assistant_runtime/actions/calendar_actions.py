"""
calendar_actions.py — EXEC-AI-RAPID-002 / S8.3

Calendar action layer: read operations only (list events, check availability).

Architecture:
  CalendarActions
    ├── handle_list()         → CALENDAR_LIST   (reads provider)
    ├── handle_availability() → CALENDAR_AVAILABILITY (reads provider)
    └── handle_create()       → stub — raises, not wired in this stage

  register_calendar_handlers(router, provider)
    — swaps the three CALENDAR_* stubs in ActionRouter for real handlers

  create_calendar_actions(demo_mode, provider)
    — convenience factory; builds DemoCalendarProvider when demo_mode=True

Date-window extraction:
  Keyword-based parser — good enough for golden-path demo without NLU.
  Keywords: today, tomorrow, this week, next week, weekend (case-insensitive).
  Default window: today (midnight → midnight+1d UTC).

Confirmation gating:
  handle_create() is declared but returns NotImplementedError in this stage.
  The confirmation gate will be wired in the next sub-stage alongside the
  write path in calendar_provider.py.  AssistantCore already enforces the
  requires_confirmation flag — no changes needed there.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from .calendar_provider import (
    CalendarBackend,
    CalendarEvent,
    CalendarProvider,
    TimeSlot,
    create_provider,
)

# Deferred core imports — keep actions/ importable without core/ on sys.path
# at module load time.  Handlers import only when called.

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Date-window helpers
# ---------------------------------------------------------------------------

def _today_window(now: datetime) -> tuple[datetime, datetime]:
    """[today midnight, tomorrow midnight) in UTC."""
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight, midnight + timedelta(days=1)


def _tomorrow_window(now: datetime) -> tuple[datetime, datetime]:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = midnight + timedelta(days=1)
    return start, start + timedelta(days=1)


def _week_window(now: datetime) -> tuple[datetime, datetime]:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight, midnight + timedelta(days=7)


def _next_week_window(now: datetime) -> tuple[datetime, datetime]:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = midnight + timedelta(days=7)
    return start, start + timedelta(days=7)


def _weekend_window(now: datetime) -> tuple[datetime, datetime]:
    """Next Saturday midnight → next Monday midnight."""
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    days_until_sat = (5 - midnight.weekday()) % 7 or 7
    sat = midnight + timedelta(days=days_until_sat)
    return sat, sat + timedelta(days=2)


def extract_time_window(
    text: str,
    now: Optional[datetime] = None,
) -> tuple[datetime, datetime]:
    """
    Parse a natural-language date hint from text and return (from_dt, to_dt).

    Supported keywords (case-insensitive):
      tomorrow, next week, this week, weekend, today (default).

    Falls back to today's window when no keyword is matched.
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
    # "today" or no keyword — default
    return _today_window(now)


def _label_for_window(from_dt: datetime, to_dt: datetime) -> str:
    """Human label for the window, e.g. 'today', 'tomorrow', '7 days'."""
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
# Response formatters
# ---------------------------------------------------------------------------

def _format_events(events: List[CalendarEvent], window_label: str) -> str:
    """Render a list of events as a plain-text summary for any channel."""
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
    if len(events) == 1:
        lines.append("\nType 'availability' to find open slots.")
    else:
        lines.append(f"\n{len(events)} event(s) found.")
    return "\n".join(lines)


def _format_availability(
    free_slots: List[TimeSlot],
    window_label: str,
    slot_duration_minutes: int,
) -> str:
    """Render free slots as plain-text for any channel."""
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

    Each method matches the HandlerFn signature expected by ActionRouter:
      async def handler(req: ActionRequest) -> ActionResult

    Instantiate with a CalendarProvider and register the handlers into the
    router using register_calendar_handlers().
    """

    def __init__(
        self,
        provider: CalendarProvider,
        slot_duration_minutes: int = 30,
        now_fn=None,        # injectable for testing: () -> datetime
    ) -> None:
        self._provider = provider
        self._slot_duration = slot_duration_minutes
        self._now_fn = now_fn or (lambda: datetime.now(timezone.utc))

    # ------------------------------------------------------------------
    # handle_list — CALENDAR_LIST
    # ------------------------------------------------------------------

    async def handle_list(self, req) -> object:
        """
        List upcoming events for the requesting user.

        Extracts a date window from the turn text (keyword-based),
        queries the provider, and formats the result for any channel.
        """
        from executive_assistant_runtime.core.action_router import (
            ActionResult,
            ActionType,
        )

        now = self._now_fn()
        text = req.turn.raw_text
        from_dt, to_dt = extract_time_window(text, now)
        window_label = _label_for_window(from_dt, to_dt)

        logger.debug(
            "CalendarActions.handle_list: user=%s window=[%s, %s)",
            req.turn.user_id,
            from_dt.isoformat(timespec="minutes"),
            to_dt.isoformat(timespec="minutes"),
        )

        try:
            events = await self._provider.list_events(
                req.turn.user_id, from_dt, to_dt
            )
        except Exception as exc:
            logger.error("CalendarActions.handle_list: provider error: %r", exc)
            return ActionResult(
                action_type=ActionType.CALENDAR_LIST,
                reply_text=(
                    "I couldn't reach the calendar right now. "
                    "Please try again in a moment."
                ),
                success=False,
            )

        reply = _format_events(events, window_label)
        return ActionResult(
            action_type=ActionType.CALENDAR_LIST,
            reply_text=reply,
            success=True,
            payload={
                "event_count": len(events),
                "window_from": from_dt.isoformat(),
                "window_to": to_dt.isoformat(),
                "demo": getattr(self._provider, "_is_demo", True),
            },
        )

    # ------------------------------------------------------------------
    # handle_availability — CALENDAR_AVAILABILITY
    # ------------------------------------------------------------------

    async def handle_availability(self, req) -> object:
        """
        Check free slots in the requested window.

        Extracts a date window from turn text, queries provider for all
        slots, filters to free ones, and formats the top matches.
        """
        from executive_assistant_runtime.core.action_router import (
            ActionResult,
            ActionType,
        )

        now = self._now_fn()
        text = req.turn.raw_text
        from_dt, to_dt = extract_time_window(text, now)
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
                reply_text=(
                    "I couldn't check availability right now. "
                    "Please try again in a moment."
                ),
                success=False,
            )

        free = [s for s in slots if s.available]
        reply = _format_availability(free, window_label, self._slot_duration)
        return ActionResult(
            action_type=ActionType.CALENDAR_AVAILABILITY,
            reply_text=reply,
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
    # handle_create — CALENDAR_CREATE (stub — not wired in this stage)
    # ------------------------------------------------------------------

    async def handle_create(self, req) -> object:
        """
        Create a new calendar event after confirmation.

        NOT implemented in S8.3.  Returns a clear error result so the
        action router does not silently fall through to the stub handler.
        The confirmation gate and write path will be wired in the next stage.
        """
        from executive_assistant_runtime.core.action_router import (
            ActionResult,
            ActionType,
        )
        from executive_assistant_runtime.core.error_models import ErrorCode

        logger.info(
            "CalendarActions.handle_create: called before write path wired "
            "(session=%s) — returning not-yet-available reply",
            req.turn.session_id,
        )
        return ActionResult(
            action_type=ActionType.CALENDAR_CREATE,
            reply_text=(
                "Event creation is not yet enabled. "
                "I can show your schedule or check availability — just ask!"
            ),
            success=False,
            error_code=ErrorCode.ACTION_FAILED,
        )


# ---------------------------------------------------------------------------
# Registration helper
# ---------------------------------------------------------------------------

def register_calendar_handlers(router, provider: CalendarProvider) -> CalendarActions:
    """
    Wire CalendarActions handlers into an existing ActionRouter instance,
    replacing the three CALENDAR_* stub handlers installed at S2.1.

    Returns the CalendarActions instance so callers can inspect or test it.

    Usage:
        from executive_assistant_runtime.core.action_router import ActionRouter, ActionType
        from executive_assistant_runtime.actions.calendar_actions import (
            register_calendar_handlers,
        )
        router = ActionRouter()
        calendar = register_calendar_handlers(router, provider)
    """
    from executive_assistant_runtime.core.action_router import ActionType

    cal = CalendarActions(provider)
    router.register_handler(ActionType.CALENDAR_LIST, cal.handle_list)
    router.register_handler(ActionType.CALENDAR_AVAILABILITY, cal.handle_availability)
    router.register_handler(ActionType.CALENDAR_CREATE, cal.handle_create)
    logger.info(
        "register_calendar_handlers: CALENDAR_LIST, CALENDAR_AVAILABILITY, "
        "CALENDAR_CREATE wired to CalendarActions (provider=%s)",
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

    If provider is supplied it is used as-is.
    Otherwise a DemoCalendarProvider is created when demo_mode=True,
    and a CalComProvider stub is created when demo_mode=False.
    """
    if provider is None:
        backend = CalendarBackend.DEMO if demo_mode else CalendarBackend.CALCOM
        provider = create_provider(backend)
    return CalendarActions(provider, slot_duration_minutes=slot_duration_minutes)
