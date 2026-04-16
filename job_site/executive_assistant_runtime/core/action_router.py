"""
action_router.py — EXEC-AI-RAPID-002 / S2.1

Routes a normalized TurnContext to the correct action handler.
All handler slots are present as stubs so downstream stages can wire
real logic without touching this file's routing table.

No channel logic here. No Telegram imports. No voice imports.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, Optional

from .dialog_manager import TurnContext
from .error_models import (
    ActionRoutingError,
    ErrorCode,
    UnhandledError,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Action types
# ---------------------------------------------------------------------------

class ActionType(str, Enum):
    GREETING = "GREETING"
    CALENDAR_LIST = "CALENDAR_LIST"
    CALENDAR_AVAILABILITY = "CALENDAR_AVAILABILITY"
    CALENDAR_CREATE = "CALENDAR_CREATE"
    FAQ = "FAQ"
    TICKET = "TICKET"
    DIRECT_REPLY = "DIRECT_REPLY"     # LLM free-form reply
    FALLBACK = "FALLBACK"             # catch-all


# ---------------------------------------------------------------------------
# Action request / result contracts
# ---------------------------------------------------------------------------

@dataclass
class ActionRequest:
    """Input to an action handler."""
    action_type: ActionType
    turn: TurnContext
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ActionResult:
    """Output from an action handler."""
    action_type: ActionType
    reply_text: str
    success: bool = True
    requires_confirmation: bool = False
    confirmation_prompt: Optional[str] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    error_code: Optional[ErrorCode] = None


# ---------------------------------------------------------------------------
# Handler type alias
# ---------------------------------------------------------------------------

HandlerFn = Callable[[ActionRequest], Awaitable[ActionResult]]


# ---------------------------------------------------------------------------
# Built-in stub handlers
# All return sensible demo-mode responses until real backends are wired.
# ---------------------------------------------------------------------------

async def _handle_greeting(req: ActionRequest) -> ActionResult:
    return ActionResult(
        action_type=ActionType.GREETING,
        reply_text=(
            "Hello! I'm your executive assistant. "
            "I can help with your calendar, answer questions, and more. "
            "What can I do for you today?"
        ),
    )


async def _handle_calendar_list(req: ActionRequest) -> ActionResult:
    # Placeholder — S8 wires real calendar provider
    return ActionResult(
        action_type=ActionType.CALENDAR_LIST,
        reply_text=(
            "[DEMO] Here are your upcoming events:\n"
            "• 09:00 – Team standup\n"
            "• 14:00 – Product review\n"
            "• 16:30 – 1:1 with Alex\n"
            "\nType 'availability' to check open slots."
        ),
        payload={"demo": True},
    )


async def _handle_calendar_availability(req: ActionRequest) -> ActionResult:
    return ActionResult(
        action_type=ActionType.CALENDAR_AVAILABILITY,
        reply_text=(
            "[DEMO] You have availability at:\n"
            "• Tomorrow 10:00–11:00\n"
            "• Tomorrow 15:00–16:00\n"
            "\nShall I book a slot for you?"
        ),
        payload={"demo": True},
    )


async def _handle_calendar_create(req: ActionRequest) -> ActionResult:
    # Requires confirmation gate — assistant_core must enforce this
    return ActionResult(
        action_type=ActionType.CALENDAR_CREATE,
        reply_text="[DEMO] Event created: 'New Meeting' tomorrow at 10:00.",
        payload={"demo": True},
    )


async def _handle_faq(req: ActionRequest) -> ActionResult:
    # Placeholder — S10 wires real FAQ store
    return ActionResult(
        action_type=ActionType.FAQ,
        reply_text=(
            "[DEMO] Here's what I found in the FAQ:\n"
            "No matching entry yet. Check back soon."
        ),
        payload={"demo": True},
    )


async def _handle_ticket(req: ActionRequest) -> ActionResult:
    # Placeholder — S10 wires real ticket system
    return ActionResult(
        action_type=ActionType.TICKET,
        reply_text=(
            "[DEMO] Ticket noted. A support agent will follow up shortly."
        ),
        payload={"demo": True},
    )


async def _handle_direct_reply(req: ActionRequest) -> ActionResult:
    # Placeholder — wires Claude / LLM in later stage
    user_text = req.turn.raw_text
    return ActionResult(
        action_type=ActionType.DIRECT_REPLY,
        reply_text=(
            f"[DEMO] You said: {user_text!r}\n"
            "Full assistant reply coming once the LLM backend is wired."
        ),
        payload={"demo": True},
    )


async def _handle_fallback(req: ActionRequest) -> ActionResult:
    return ActionResult(
        action_type=ActionType.FALLBACK,
        reply_text=(
            "I'm not sure how to help with that. "
            "You can try: 'calendar', 'availability', or 'help'."
        ),
        success=True,
    )


# ---------------------------------------------------------------------------
# Intent classifier (keyword-based stub)
# Replace with a real NLU / LLM classification call in a later stage.
# ---------------------------------------------------------------------------

def classify_intent(turn: TurnContext) -> ActionType:
    """
    Map raw text to an ActionType.
    Keyword heuristics only — good enough for demo golden path.
    """
    text = turn.raw_text.strip().lower()

    if turn.is_greeting_trigger():
        return ActionType.GREETING

    if any(kw in text for kw in ("calendar", "events", "schedule", "meetings")):
        return ActionType.CALENDAR_LIST

    if any(kw in text for kw in ("available", "availability", "free", "open slot")):
        return ActionType.CALENDAR_AVAILABILITY

    if any(kw in text for kw in ("book", "create event", "new meeting", "schedule a")):
        return ActionType.CALENDAR_CREATE

    if any(kw in text for kw in ("faq", "how do i", "what is", "explain")):
        return ActionType.FAQ

    if any(kw in text for kw in ("ticket", "issue", "bug", "problem", "support")):
        return ActionType.TICKET

    if any(kw in text for kw in ("help", "/help")):
        return ActionType.DIRECT_REPLY

    # Default to direct (LLM) reply; fallback is reserved for handler errors
    return ActionType.DIRECT_REPLY


# ---------------------------------------------------------------------------
# Action Router
# ---------------------------------------------------------------------------

_DEFAULT_HANDLERS: Dict[ActionType, HandlerFn] = {
    ActionType.GREETING: _handle_greeting,
    ActionType.CALENDAR_LIST: _handle_calendar_list,
    ActionType.CALENDAR_AVAILABILITY: _handle_calendar_availability,
    ActionType.CALENDAR_CREATE: _handle_calendar_create,
    ActionType.FAQ: _handle_faq,
    ActionType.TICKET: _handle_ticket,
    ActionType.DIRECT_REPLY: _handle_direct_reply,
    ActionType.FALLBACK: _handle_fallback,
}


class ActionRouter:
    """
    Routes a TurnContext to the correct handler and returns an ActionResult.

    Handlers can be replaced at runtime (e.g., to swap demo stubs for real
    implementations) by calling register_handler().
    """

    def __init__(self) -> None:
        self._handlers: Dict[ActionType, HandlerFn] = dict(_DEFAULT_HANDLERS)

    def register_handler(self, action_type: ActionType, handler: HandlerFn) -> None:
        """Register or replace the handler for an ActionType."""
        self._handlers[action_type] = handler
        logger.debug("ActionRouter: registered handler for %s", action_type)

    async def route(self, turn: TurnContext) -> ActionResult:
        """
        Classify intent from the turn and dispatch to the matching handler.
        Falls back to FALLBACK handler on any routing error.
        """
        intent = classify_intent(turn)
        logger.debug(
            "ActionRouter: user=%s channel=%s intent=%s",
            turn.user_id, turn.channel, intent,
        )

        handler = self._handlers.get(intent)
        if handler is None:
            logger.warning("ActionRouter: no handler for %s — using FALLBACK", intent)
            handler = self._handlers[ActionType.FALLBACK]
            intent = ActionType.FALLBACK

        req = ActionRequest(action_type=intent, turn=turn)

        try:
            result = await handler(req)
        except Exception as exc:
            logger.error("ActionRouter: handler %s raised %r", intent, exc)
            fallback_handler = self._handlers.get(ActionType.FALLBACK, _handle_fallback)
            fallback_req = ActionRequest(action_type=ActionType.FALLBACK, turn=turn)
            result = await fallback_handler(fallback_req)
            result.success = False
            result.error_code = ErrorCode.ACTION_FAILED

        return result
