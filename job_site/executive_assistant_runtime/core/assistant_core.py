"""
assistant_core.py — EXEC-AI-RAPID-002 / S2.1

Central processing hub for the executive assistant.

Entry point for all channels. Channel wrappers (Telegram, voice, UI, etc.)
call AssistantCore.handle_turn() with a populated TurnContext and receive
back an AssistantOutput. No channel-specific objects, imports, or logic
belong here.

Paths implemented in this module:
  1. Greeting path      — new session or /start trigger
  2. Confirmation path  — user confirming or cancelling a pending action
  3. Main reply path    — normal assistant turn routed through ActionRouter
  4. Fallback path      — any unhandled error produces a safe response
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .action_router import ActionResult, ActionRouter, ActionType
from .dialog_manager import Channel, DialogManager, DialogState, TurnContext
from .error_models import (
    AssistantError,
    ErrorCode,
    ErrorResponse,
    UnhandledError,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public data contracts
# ---------------------------------------------------------------------------

@dataclass
class AssistantInput:
    """
    Minimal structure for callers that want to create a TurnContext
    without importing dialog_manager directly.
    """
    user_id: str
    channel: Channel
    raw_text: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AssistantOutput:
    """
    What AssistantCore returns to the channel wrapper.

    The channel is responsible for formatting reply_text into its own
    message type (Telegram message, TTS utterance, UI card, etc.).
    """
    reply_text: str
    session_id: str
    turn_id: str
    action_type: ActionType
    success: bool = True
    requires_confirmation: bool = False
    confirmation_prompt: Optional[str] = None
    error_response: Optional[ErrorResponse] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Assistant Core
# ---------------------------------------------------------------------------

class AssistantCore:
    """
    The single brain of the executive assistant prototype.

    Instantiate once and share across all active channels.
    Thread / async safe as long as DialogManager's backing store is.
    """

    def __init__(
        self,
        dialog_manager: Optional[DialogManager] = None,
        action_router: Optional[ActionRouter] = None,
        demo_mode: bool = True,
    ) -> None:
        self.dialog_manager = dialog_manager or DialogManager()
        self.action_router = action_router or ActionRouter()
        self.demo_mode = demo_mode
        logger.info(
            "AssistantCore initialized | demo_mode=%s", self.demo_mode
        )

    # ------------------------------------------------------------------
    # Public entry point — called by every channel wrapper
    # ------------------------------------------------------------------

    async def handle_turn(self, inp: AssistantInput) -> AssistantOutput:
        """
        Process one user turn and return a channel-ready output.

        This is the only method channel wrappers should call.
        """
        turn = TurnContext(
            session_id="",          # filled by load_context
            user_id=inp.user_id,
            channel=inp.channel,
            raw_text=inp.raw_text,
            metadata=inp.metadata,
        )

        try:
            turn = self.dialog_manager.load_context(turn)
            return await self._dispatch(turn)

        except AssistantError as err:
            return self._fallback_output(turn, err)

        except Exception as exc:
            wrapped = UnhandledError(
                code=ErrorCode.UNHANDLED,
                message="Unexpected error in handle_turn",
                detail=repr(exc),
            )
            logger.exception("AssistantCore.handle_turn unhandled: %r", exc)
            return self._fallback_output(turn, wrapped)

    # ------------------------------------------------------------------
    # Internal dispatch — selects the right processing path
    # ------------------------------------------------------------------

    async def _dispatch(self, turn: TurnContext) -> AssistantOutput:
        """Route the turn to the correct processing path."""

        # Path 1 — Greeting
        if turn.is_greeting_trigger():
            return await self._greeting_path(turn)

        # Path 2a — User is confirming a pending action
        if turn.is_confirmation():
            return await self._confirmation_path(turn, confirmed=True)

        # Path 2b — User is cancelling a pending action
        if turn.is_cancellation():
            return await self._confirmation_path(turn, confirmed=False)

        # Path 3 — Normal assistant turn (routed through ActionRouter)
        return await self._main_reply_path(turn)

    # ------------------------------------------------------------------
    # Path 1 — Greeting
    # ------------------------------------------------------------------

    async def _greeting_path(self, turn: TurnContext) -> AssistantOutput:
        """Send greeting and transition session to ACTIVE."""
        logger.debug("AssistantCore: greeting_path | session=%s", turn.session_id)

        self.dialog_manager.transition(turn, DialogState.GREETING)
        result: ActionResult = await self.action_router.route(turn)
        self.dialog_manager.transition(turn, DialogState.ACTIVE)

        return self._build_output(turn, result)

    # ------------------------------------------------------------------
    # Path 2 — Confirmation
    # ------------------------------------------------------------------

    async def _confirmation_path(
        self, turn: TurnContext, *, confirmed: bool
    ) -> AssistantOutput:
        """
        Handle a yes/no response to a pending action.

        If confirmed, re-run the pending action from the stored payload.
        If cancelled, clear pending state and acknowledge cancellation.
        """
        logger.debug(
            "AssistantCore: confirmation_path | session=%s confirmed=%s",
            turn.session_id, confirmed,
        )

        if not confirmed:
            self.dialog_manager.clear_pending(turn)
            self.dialog_manager.transition(turn, DialogState.ACTIVE)
            return AssistantOutput(
                reply_text="Got it — action cancelled. What else can I help you with?",
                session_id=turn.session_id,
                turn_id=turn.turn_id,
                action_type=ActionType.FALLBACK,
                success=True,
            )

        # Re-dispatch the stored pending action
        pending_action = turn.pending_action
        if pending_action is None:
            self.dialog_manager.transition(turn, DialogState.ACTIVE)
            return AssistantOutput(
                reply_text=(
                    "I lost track of what we were confirming. "
                    "Could you repeat your request?"
                ),
                session_id=turn.session_id,
                turn_id=turn.turn_id,
                action_type=ActionType.FALLBACK,
                success=False,
            )

        self.dialog_manager.clear_pending(turn)
        self.dialog_manager.transition(turn, DialogState.ACTIVE)

        # Replay the confirmed action through the router
        turn.raw_text = pending_action
        result = await self.action_router.route(turn)
        return self._build_output(turn, result)

    # ------------------------------------------------------------------
    # Path 3 — Main reply
    # ------------------------------------------------------------------

    async def _main_reply_path(self, turn: TurnContext) -> AssistantOutput:
        """
        Route the turn through ActionRouter and handle confirmation gating.

        If the result requires confirmation, save the pending action and
        prompt the user before executing any state-changing operation.
        """
        logger.debug(
            "AssistantCore: main_reply_path | session=%s text=%r",
            turn.session_id, turn.raw_text,
        )

        result: ActionResult = await self.action_router.route(turn)

        if result.requires_confirmation:
            self.dialog_manager.transition(
                turn,
                DialogState.AWAITING_CONFIRMATION,
                pending_action=turn.raw_text,
                pending_payload=result.payload,
            )
            prompt = result.confirmation_prompt or (
                f"Are you sure you want to proceed with: {turn.raw_text!r}? "
                "Reply 'yes' to confirm or 'no' to cancel."
            )
            return AssistantOutput(
                reply_text=prompt,
                session_id=turn.session_id,
                turn_id=turn.turn_id,
                action_type=result.action_type,
                success=True,
                requires_confirmation=True,
                confirmation_prompt=prompt,
                payload=result.payload,
            )

        self.dialog_manager.transition(turn, DialogState.ACTIVE)
        return self._build_output(turn, result)

    # ------------------------------------------------------------------
    # Path 4 — Fallback (error recovery)
    # ------------------------------------------------------------------

    def _fallback_path(self, turn: TurnContext, error: AssistantError) -> AssistantOutput:
        """
        Produce a safe user-facing response when an error cannot be recovered.
        Keeps the session in ACTIVE state so the user can try again.
        """
        logger.error(
            "AssistantCore: fallback_path | session=%s error=%s",
            turn.session_id, error,
        )
        try:
            self.dialog_manager.transition(turn, DialogState.ACTIVE)
        except Exception:
            pass  # best-effort; don't raise inside fallback

        err_resp = ErrorResponse.from_error(
            error,
            user_message=(
                "I ran into a problem processing your request. "
                "Please try again or type 'help'."
            ),
        )
        return AssistantOutput(
            reply_text=err_resp.user_message,
            session_id=turn.session_id,
            turn_id=turn.turn_id,
            action_type=ActionType.FALLBACK,
            success=False,
            error_response=err_resp,
        )

    def _fallback_output(
        self, turn: TurnContext, error: AssistantError
    ) -> AssistantOutput:
        """Alias used in handle_turn's except block."""
        return self._fallback_path(turn, error)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_output(turn: TurnContext, result: ActionResult) -> AssistantOutput:
        return AssistantOutput(
            reply_text=result.reply_text,
            session_id=turn.session_id,
            turn_id=turn.turn_id,
            action_type=result.action_type,
            success=result.success,
            requires_confirmation=result.requires_confirmation,
            confirmation_prompt=result.confirmation_prompt,
            payload=result.payload,
            error_response=(
                ErrorResponse(
                    code=result.error_code,
                    user_message=result.reply_text,
                    recoverable=True,
                )
                if result.error_code
                else None
            ),
        )
