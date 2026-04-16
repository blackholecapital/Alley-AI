"""
calendar_provider.py — EXEC-AI-RAPID-002 / S8.2

Calendar provider abstraction: read paths only (list events, check availability).

Architecture:
  CalendarProvider (ABC)
    ├── DemoCalendarProvider  — seed-data-backed, no external calls
    └── CalComProvider        — cal.com REST API stub (wired in later stage)

Demo mode:
  Seed events are loaded from
    executive_assistant_runtime/data/seed_calendar.json
  if the file exists.  Otherwise the built-in hardcoded seed is used.
  Both paths satisfy the golden-path test without any external service.

Provider interface follows cal.com booking model patterns:
  - GET /v1/bookings          → list_events()
  - GET /v1/slots/available   → check_availability()
  Reference: https://github.com/calcom/cal.com (packages/prisma/schema.prisma,
             apps/api/v1/pages/api/bookings/_get.ts)

Write path (create_event) is declared as an abstract method so the ABC is
complete, but it is NOT implemented in this stage.  CalendarActions (S8.3)
wraps it with the confirmation gate before exposing it to the router.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data contracts
# ---------------------------------------------------------------------------

@dataclass
class CalendarEvent:
    """A single calendar booking / event."""
    event_id: str
    title: str
    start_time: datetime
    end_time: datetime
    attendees: List[str] = field(default_factory=list)
    location: str = ""
    description: str = ""
    status: str = "confirmed"     # confirmed | tentative | cancelled

    @property
    def duration_minutes(self) -> int:
        delta = self.end_time - self.start_time
        return int(delta.total_seconds() // 60)

    def human_range(self) -> str:
        """E.g. 'Mon 14 Apr  09:00 – 09:30'"""
        fmt_date = self.start_time.strftime("%a %-d %b")
        fmt_start = self.start_time.strftime("%H:%M")
        fmt_end = self.end_time.strftime("%H:%M")
        return f"{fmt_date}  {fmt_start} – {fmt_end}"


@dataclass
class TimeSlot:
    """A discrete window that is either free or busy."""
    start_time: datetime
    end_time: datetime
    available: bool = True

    def human_range(self) -> str:
        fmt_date = self.start_time.strftime("%a %-d %b")
        fmt_start = self.start_time.strftime("%H:%M")
        fmt_end = self.end_time.strftime("%H:%M")
        return f"{fmt_date}  {fmt_start} – {fmt_end}"


@dataclass
class CreateEventRequest:
    """
    Parameters for creating a new event.
    Accepted by CalendarProvider.create_event() but not yet
    wired to any live path in this stage.
    """
    title: str
    start_time: datetime
    end_time: datetime
    attendees: List[str] = field(default_factory=list)
    location: str = ""
    description: str = ""
    metadata: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class CalendarProvider(ABC):
    """
    Channel-agnostic calendar backend contract.

    All methods are async so real HTTP providers can be awaited without
    changing the call site.  The demo provider returns immediately.
    """

    @abstractmethod
    async def list_events(
        self,
        user_id: str,
        from_dt: datetime,
        to_dt: datetime,
    ) -> List[CalendarEvent]:
        """Return events in [from_dt, to_dt) for user_id."""

    @abstractmethod
    async def check_availability(
        self,
        user_id: str,
        from_dt: datetime,
        to_dt: datetime,
        slot_duration_minutes: int = 30,
    ) -> List[TimeSlot]:
        """Return free slots of slot_duration_minutes within [from_dt, to_dt)."""

    @abstractmethod
    async def create_event(
        self,
        user_id: str,
        req: CreateEventRequest,
    ) -> CalendarEvent:
        """
        Create a new event.  Callers MUST gate this behind an explicit
        user confirmation before calling — see CalendarActions.handle_create().
        """


# ---------------------------------------------------------------------------
# Seed data helpers
# ---------------------------------------------------------------------------

_SEED_PATH = (
    Path(__file__).resolve()
    .parent.parent          # executive_assistant_runtime/
    / "data"
    / "seed_calendar.json"
)

_HARDCODED_SEED: list[dict] = [
    {
        "event_id": "seed-001",
        "title": "Team standup",
        "start_offset_hours": 1,
        "duration_minutes": 30,
        "attendees": ["alice@example.com", "bob@example.com"],
        "location": "Zoom",
        "description": "Daily sync",
    },
    {
        "event_id": "seed-002",
        "title": "Product review",
        "start_offset_hours": 5,
        "duration_minutes": 60,
        "attendees": ["alice@example.com", "carol@example.com"],
        "location": "Conf Room A",
        "description": "Weekly product iteration review",
    },
    {
        "event_id": "seed-003",
        "title": "1:1 with Alex",
        "start_offset_hours": 8,
        "duration_minutes": 30,
        "attendees": ["alice@example.com", "alex@example.com"],
        "location": "",
        "description": "",
    },
    {
        "event_id": "seed-004",
        "title": "Investor call",
        "start_offset_hours": 27,   # tomorrow
        "duration_minutes": 60,
        "attendees": ["alice@example.com"],
        "location": "Google Meet",
        "description": "Quarterly update",
    },
    {
        "event_id": "seed-005",
        "title": "Engineering all-hands",
        "start_offset_hours": 30,
        "duration_minutes": 90,
        "attendees": ["alice@example.com", "bob@example.com", "carol@example.com"],
        "location": "Main auditorium",
        "description": "Quarterly engineering meeting",
    },
]


def _load_seed_events(now: datetime) -> List[CalendarEvent]:
    """
    Load seed events from JSON file if it exists, else use hardcoded list.
    All start times are anchored to `now` so demos always look current.
    """
    raw: list[dict] = []

    if _SEED_PATH.exists():
        try:
            with _SEED_PATH.open() as fh:
                data = json.load(fh)
            # Accept either a top-level list or {"events": [...]}
            raw = data if isinstance(data, list) else data.get("events", [])
            logger.debug("calendar_provider: loaded %d seed events from %s", len(raw), _SEED_PATH)
        except Exception as exc:
            logger.warning("calendar_provider: seed file load failed (%r) — using hardcoded seed", exc)
            raw = []

    if not raw:
        raw = _HARDCODED_SEED

    events: List[CalendarEvent] = []
    for item in raw:
        offset_h = float(item.get("start_offset_hours", 0))
        duration_m = int(item.get("duration_minutes", 30))
        start = now + timedelta(hours=offset_h)
        # Round to nearest quarter-hour for a clean look
        minutes = (start.minute // 15) * 15
        start = start.replace(minute=minutes, second=0, microsecond=0)
        end = start + timedelta(minutes=duration_m)

        events.append(CalendarEvent(
            event_id=str(item.get("event_id", f"seed-{len(events)}")),
            title=str(item.get("title", "Untitled")),
            start_time=start,
            end_time=end,
            attendees=list(item.get("attendees", [])),
            location=str(item.get("location", "")),
            description=str(item.get("description", "")),
            status=str(item.get("status", "confirmed")),
        ))

    return events


# ---------------------------------------------------------------------------
# Demo provider
# ---------------------------------------------------------------------------

class DemoCalendarProvider(CalendarProvider):
    """
    In-process calendar provider backed by seed data.

    All reads are served from an in-memory list that is populated at
    construction time from seed_calendar.json (or the hardcoded seed).
    Writes (create_event) append to the same list so the session stays
    consistent — no external service is required.
    """

    def __init__(self, now: Optional[datetime] = None) -> None:
        self._now = now or datetime.now(timezone.utc)
        self._events: List[CalendarEvent] = _load_seed_events(self._now)
        logger.info(
            "DemoCalendarProvider ready | %d seed events", len(self._events)
        )

    # ------------------------------------------------------------------
    # Read paths
    # ------------------------------------------------------------------

    async def list_events(
        self,
        user_id: str,
        from_dt: datetime,
        to_dt: datetime,
    ) -> List[CalendarEvent]:
        """Return confirmed/tentative events within the requested window."""
        result = [
            e for e in self._events
            if e.status != "cancelled"
            and e.start_time >= from_dt
            and e.start_time < to_dt
        ]
        result.sort(key=lambda e: e.start_time)
        logger.debug(
            "DemoCalendarProvider.list_events: user=%s window=[%s, %s) → %d events",
            user_id,
            from_dt.isoformat(timespec="minutes"),
            to_dt.isoformat(timespec="minutes"),
            len(result),
        )
        return result

    async def check_availability(
        self,
        user_id: str,
        from_dt: datetime,
        to_dt: datetime,
        slot_duration_minutes: int = 30,
    ) -> List[TimeSlot]:
        """
        Generate discrete slots of slot_duration_minutes across business hours
        (09:00 – 18:00) in [from_dt, to_dt), then mark each slot as available
        or busy based on whether a seed event overlaps it.
        """
        busy_events = [
            e for e in self._events
            if e.status not in ("cancelled",)
            and e.start_time < to_dt
            and e.end_time > from_dt
        ]

        slots: List[TimeSlot] = []
        cursor = from_dt.replace(second=0, microsecond=0)

        while cursor + timedelta(minutes=slot_duration_minutes) <= to_dt:
            slot_end = cursor + timedelta(minutes=slot_duration_minutes)

            # Business hours only (09:00 – 18:00)
            in_hours = (
                cursor.hour >= 9
                and slot_end.hour < 18
                or (slot_end.hour == 18 and slot_end.minute == 0)
            )

            if in_hours:
                busy = any(
                    e.start_time < slot_end and e.end_time > cursor
                    for e in busy_events
                )
                slots.append(TimeSlot(
                    start_time=cursor,
                    end_time=slot_end,
                    available=not busy,
                ))

            cursor = slot_end

        logger.debug(
            "DemoCalendarProvider.check_availability: user=%s slots=%d free=%d",
            user_id,
            len(slots),
            sum(1 for s in slots if s.available),
        )
        return slots

    async def create_event(
        self,
        user_id: str,
        req: CreateEventRequest,
    ) -> CalendarEvent:
        """
        Append a new event to the in-memory store.
        Callers are responsible for confirmation gating (see CalendarActions).
        """
        import uuid as _uuid
        event = CalendarEvent(
            event_id=f"demo-{_uuid.uuid4().hex[:8]}",
            title=req.title,
            start_time=req.start_time,
            end_time=req.end_time,
            attendees=list(req.attendees),
            location=req.location,
            description=req.description,
            status="confirmed",
        )
        self._events.append(event)
        logger.info(
            "DemoCalendarProvider.create_event: created event_id=%s title=%r",
            event.event_id, event.title,
        )
        return event

    # ------------------------------------------------------------------
    # Convenience helpers (not on ABC — for tests only)
    # ------------------------------------------------------------------

    def seed_count(self) -> int:
        return len(self._events)

    def all_events(self) -> List[CalendarEvent]:
        return list(self._events)


# ---------------------------------------------------------------------------
# Cal.com provider stub
# ---------------------------------------------------------------------------

class CalComProvider(CalendarProvider):
    """
    Stub for the cal.com REST API provider.

    Wire this in a later stage when a CALCOM_API_KEY and base URL are
    available.  All methods raise NotImplementedError until then so any
    accidental invocation is caught immediately rather than silently
    returning empty data.

    cal.com API patterns (v1):
      GET  /v1/bookings          — list bookings (maps to list_events)
      GET  /v1/slots/available   — available slots (maps to check_availability)
      POST /v1/bookings          — create booking (maps to create_event)

    Reference:
      https://github.com/calcom/cal.com
        apps/api/v1/pages/api/bookings/_get.ts
        apps/api/v1/pages/api/slots/available.ts
      https://github.com/calcom/cal.diy
        (DIY self-hosted deployment patterns)
    """

    def __init__(self, api_key: str = "", base_url: str = "https://api.cal.com") -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    async def list_events(
        self,
        user_id: str,
        from_dt: datetime,
        to_dt: datetime,
    ) -> List[CalendarEvent]:
        raise NotImplementedError(
            "CalComProvider.list_events not yet wired. "
            "Set CALENDAR_BACKEND=demo or provide a CALCOM_API_KEY."
        )

    async def check_availability(
        self,
        user_id: str,
        from_dt: datetime,
        to_dt: datetime,
        slot_duration_minutes: int = 30,
    ) -> List[TimeSlot]:
        raise NotImplementedError(
            "CalComProvider.check_availability not yet wired. "
            "Set CALENDAR_BACKEND=demo or provide a CALCOM_API_KEY."
        )

    async def create_event(
        self,
        user_id: str,
        req: CreateEventRequest,
    ) -> CalendarEvent:
        raise NotImplementedError(
            "CalComProvider.create_event not yet wired. "
            "Set CALENDAR_BACKEND=demo or provide a CALCOM_API_KEY."
        )


# ---------------------------------------------------------------------------
# Backend enum + factory
# ---------------------------------------------------------------------------

from enum import Enum


class CalendarBackend(str, Enum):
    DEMO = "demo"
    CALCOM = "calcom"


def create_provider(
    backend: CalendarBackend = CalendarBackend.DEMO,
    **kwargs,
) -> CalendarProvider:
    """
    Factory — returns the CalendarProvider for the requested backend.

    Usage:
        provider = create_provider(CalendarBackend.DEMO)
        provider = create_provider(CalendarBackend.CALCOM, api_key="...", base_url="...")
    """
    if backend == CalendarBackend.DEMO:
        return DemoCalendarProvider(**kwargs)
    if backend == CalendarBackend.CALCOM:
        return CalComProvider(**kwargs)
    raise ValueError(f"Unknown calendar backend: {backend!r}")
