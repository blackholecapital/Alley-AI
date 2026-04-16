"""
dialog_manager.py — EXEC-AI-RAPID-002 / S2.1

Manages per-session dialog state and turn context.
Contains no channel-specific logic; channel wrappers populate TurnContext
and pass it to AssistantCore. DialogManager stores and retrieves that state.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional

from .error_models import ContextLostError, ErrorCode


# ---------------------------------------------------------------------------
# Dialog state machine
# ---------------------------------------------------------------------------

class DialogState(str, Enum):
    """Lifecycle states for a single user session."""
    NEW = "NEW"                              # session just started
    GREETING = "GREETING"                   # greeting flow in progress
    ACTIVE = "ACTIVE"                       # normal assistant turn
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"  # pending user confirm
    COMPLETED = "COMPLETED"                 # session closed cleanly
    ERROR = "ERROR"                         # session in error state


# ---------------------------------------------------------------------------
# Channel identifier — keeps channel names out of core logic
# ---------------------------------------------------------------------------

class Channel(str, Enum):
    TELEGRAM = "telegram"
    VOICE = "voice"
    UI = "ui"
    TEST = "test"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Turn context — the normalized unit passed through the whole pipeline
# ---------------------------------------------------------------------------

@dataclass
class TurnContext:
    """
    Channel-agnostic representation of one user turn.

    Channel wrappers create this from their raw event and pass it to
    AssistantCore. Nothing inside core or action_router reads raw
    channel objects.
    """
    session_id: str
    user_id: str
    channel: Channel
    raw_text: str
    turn_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = field(default_factory=dict)

    # Populated by DialogManager after lookup
    dialog_state: DialogState = DialogState.NEW
    pending_action: Optional[str] = None   # action awaiting confirmation
    pending_payload: Optional[Dict[str, Any]] = None

    def is_greeting_trigger(self) -> bool:
        """True when the turn should start the greeting flow."""
        lowered = self.raw_text.strip().lower()
        return lowered in ("/start", "hi", "hello", "hey", "start") or (
            self.dialog_state == DialogState.NEW
        )

    def is_confirmation(self) -> bool:
        """True when the user is confirming a pending action."""
        lowered = self.raw_text.strip().lower()
        return self.dialog_state == DialogState.AWAITING_CONFIRMATION and (
            lowered in ("yes", "confirm", "ok", "y", "proceed", "go ahead")
        )

    def is_cancellation(self) -> bool:
        """True when the user is cancelling a pending action."""
        lowered = self.raw_text.strip().lower()
        return self.dialog_state == DialogState.AWAITING_CONFIRMATION and (
            lowered in ("no", "cancel", "stop", "n", "nevermind", "abort")
        )


# ---------------------------------------------------------------------------
# Session record — persisted per user/channel pair
# ---------------------------------------------------------------------------

@dataclass
class SessionRecord:
    session_id: str
    user_id: str
    channel: Channel
    dialog_state: DialogState = DialogState.NEW
    pending_action: Optional[str] = None
    pending_payload: Optional[Dict[str, Any]] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    turn_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc)
        self.turn_count += 1


# ---------------------------------------------------------------------------
# Dialog Manager
# ---------------------------------------------------------------------------

class DialogManager:
    """
    In-memory dialog state store for the prototype.

    Stores one SessionRecord per (user_id, channel) pair. The session_id
    is deterministic so callers do not need to track it separately.

    Replace the internal _store dict with a real persistence layer
    (Redis, DB, etc.) without changing the public interface.
    """

    def __init__(self) -> None:
        self._store: Dict[str, SessionRecord] = {}

    # ------------------------------------------------------------------
    # Session key helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _make_session_id(user_id: str, channel: Channel) -> str:
        return f"{channel.value}:{user_id}"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_or_create_session(self, user_id: str, channel: Channel) -> SessionRecord:
        """Return the existing session or start a fresh one."""
        session_id = self._make_session_id(user_id, channel)
        if session_id not in self._store:
            self._store[session_id] = SessionRecord(
                session_id=session_id,
                user_id=user_id,
                channel=channel,
            )
        return self._store[session_id]

    def load_context(self, turn: TurnContext) -> TurnContext:
        """
        Populate turn.dialog_state and pending fields from the session store.
        Returns the enriched TurnContext.
        """
        session = self.get_or_create_session(turn.user_id, turn.channel)
        turn.session_id = session.session_id
        turn.dialog_state = session.dialog_state
        turn.pending_action = session.pending_action
        turn.pending_payload = session.pending_payload
        return turn

    def transition(
        self,
        turn: TurnContext,
        new_state: DialogState,
        *,
        pending_action: Optional[str] = None,
        pending_payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Move a session to new_state and optionally set a pending action.
        Raises ContextLostError if the session cannot be found.
        """
        session = self._store.get(turn.session_id)
        if session is None:
            raise ContextLostError(
                code=ErrorCode.CONTEXT_LOST,
                message=f"Session not found: {turn.session_id}",
            )
        session.dialog_state = new_state
        session.pending_action = pending_action
        session.pending_payload = pending_payload
        session.touch()

        # Mirror onto the turn so downstream code sees fresh state
        turn.dialog_state = new_state
        turn.pending_action = pending_action
        turn.pending_payload = pending_payload

    def clear_pending(self, turn: TurnContext) -> None:
        """Clear any pending confirmation state without changing dialog state."""
        self.transition(
            turn,
            turn.dialog_state,
            pending_action=None,
            pending_payload=None,
        )

    def reset_session(self, turn: TurnContext) -> None:
        """Hard-reset a session back to NEW state."""
        session_id = self._make_session_id(turn.user_id, turn.channel)
        if session_id in self._store:
            del self._store[session_id]
        turn.dialog_state = DialogState.NEW
        turn.pending_action = None
        turn.pending_payload = None

    def all_sessions(self) -> Dict[str, SessionRecord]:
        """Return snapshot of all sessions (for debugging / admin)."""
        return dict(self._store)
