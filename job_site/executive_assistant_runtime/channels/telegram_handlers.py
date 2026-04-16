"""
telegram_handlers.py — EXEC-AI-RAPID-002 / S3.1

aiogram v3 handler definitions for the Telegram channel wrapper.

Supported entry points:
  /start        — greeting path (new session or explicit restart)
  /help         — static help text + menu
  /menu         — show main inline keyboard menu
  free text     — routed through AssistantCore.handle_turn()
  callback_data — inline keyboard button actions (menu shortcuts)

Separation rule: this file creates AssistantInput, calls AssistantCore,
and formats AssistantOutput into Telegram messages. Zero assistant logic lives here.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # These are only resolved at runtime when aiogram is installed.
    from aiogram.types import Message, CallbackQuery

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Menu copy (inline — menu_copy.py owns the canonical strings in S3.2,
# but we keep sensible defaults here so this file is self-contained)
# ---------------------------------------------------------------------------

HELP_TEXT = (
    "<b>Executive Assistant — Help</b>\n\n"
    "Commands:\n"
    "  /start  — start or restart the assistant\n"
    "  /help   — show this help message\n"
    "  /menu   — open the main menu\n\n"
    "Or just type any question and I'll do my best to help."
)

MENU_TITLE = "What would you like to do?"

# Callback data tokens — keep in sync with _MENU_CALLBACKS below
CB_CALENDAR = "menu:calendar"
CB_AVAILABILITY = "menu:availability"
CB_FAQ = "menu:faq"
CB_TICKET = "menu:ticket"
CB_HELP = "menu:help"

# Map callback data → text to feed into AssistantCore
_MENU_CALLBACKS: dict[str, str] = {
    CB_CALENDAR: "calendar",
    CB_AVAILABILITY: "availability",
    CB_FAQ: "faq",
    CB_TICKET: "ticket",
    CB_HELP: "help",
}


# ---------------------------------------------------------------------------
# Keyboard builder
# ---------------------------------------------------------------------------

def _build_main_menu():
    """
    Return an InlineKeyboardMarkup for the main menu.
    Imported lazily so aiogram is not required at module load.
    """
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="📅 Calendar", callback_data=CB_CALENDAR),
                InlineKeyboardButton(text="🕐 Availability", callback_data=CB_AVAILABILITY),
            ],
            [
                InlineKeyboardButton(text="❓ FAQ", callback_data=CB_FAQ),
                InlineKeyboardButton(text="🎫 Support", callback_data=CB_TICKET),
            ],
            [
                InlineKeyboardButton(text="ℹ️ Help", callback_data=CB_HELP),
            ],
        ]
    )


# ---------------------------------------------------------------------------
# Shared helpers — testable without a real Telegram connection
# ---------------------------------------------------------------------------

def _user_id_from_message(message) -> str:
    """Extract a stable string user identifier from a Telegram Message."""
    if message.from_user:
        return str(message.from_user.id)
    return str(message.chat.id)


def _user_id_from_callback(callback) -> str:
    """Extract a stable string user identifier from a CallbackQuery."""
    if callback.from_user:
        return str(callback.from_user.id)
    return "unknown"


def _make_input(user_id: str, text: str):
    """
    Build a channel-agnostic AssistantInput for the Telegram channel.
    Imported lazily to keep this module importable without the core package
    on sys.path during test collection.
    """
    import sys, os
    # Ensure core package is reachable when this file is imported stand-alone
    _runtime_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _runtime_root not in sys.path:
        sys.path.insert(0, _runtime_root)

    from core.assistant_core import AssistantInput
    from core.dialog_manager import Channel

    return AssistantInput(
        user_id=user_id,
        channel=Channel.TELEGRAM,
        raw_text=text,
        metadata={"channel": "telegram"},
    )


async def _call_core(core, user_id: str, text: str) -> str:
    """
    Send one turn to AssistantCore and return the reply text.
    All Telegram handlers funnel through this function.
    """
    inp = _make_input(user_id, text)
    output = await core.handle_turn(inp)
    return output.reply_text


# ---------------------------------------------------------------------------
# Router factory — called by TelegramBot with a shared AssistantCore
# ---------------------------------------------------------------------------

def build_router(core):
    """
    Build and return an aiogram Router with all Telegram handlers wired.

    Each handler closes over `core` (AssistantCore) so the router is
    self-contained and testable by calling handlers directly.

    Args:
        core: An initialised AssistantCore instance.

    Returns:
        aiogram.Router
    """
    from aiogram import F, Router
    from aiogram.filters import Command, CommandStart

    router = Router(name="telegram_main")

    # ----------------------------------------------------------------
    # /start — greeting path
    # ----------------------------------------------------------------

    @router.message(CommandStart())
    async def cmd_start(message: Message) -> None:
        """Trigger the greeting flow in AssistantCore."""
        user_id = _user_id_from_message(message)
        logger.info("Telegram /start | user=%s", user_id)
        reply = await _call_core(core, user_id, "/start")
        await message.answer(reply, reply_markup=_build_main_menu())

    # ----------------------------------------------------------------
    # /help
    # ----------------------------------------------------------------

    @router.message(Command("help"))
    async def cmd_help(message: Message) -> None:
        """Return static help text with main menu."""
        user_id = _user_id_from_message(message)
        logger.info("Telegram /help | user=%s", user_id)
        await message.answer(HELP_TEXT, reply_markup=_build_main_menu())

    # ----------------------------------------------------------------
    # /menu
    # ----------------------------------------------------------------

    @router.message(Command("menu"))
    async def cmd_menu(message: Message) -> None:
        """Display the inline keyboard main menu."""
        user_id = _user_id_from_message(message)
        logger.info("Telegram /menu | user=%s", user_id)
        await message.answer(MENU_TITLE, reply_markup=_build_main_menu())

    # ----------------------------------------------------------------
    # Inline keyboard callbacks
    # ----------------------------------------------------------------

    @router.callback_query()
    async def handle_callback(callback: CallbackQuery) -> None:
        """
        Route inline keyboard button presses through AssistantCore.
        Maps callback_data → text keyword → core intent classifier.
        """
        user_id = _user_id_from_callback(callback)
        data = callback.data or ""
        logger.info("Telegram callback | user=%s data=%r", user_id, data)

        text = _MENU_CALLBACKS.get(data, data)
        reply = await _call_core(core, user_id, text)

        # Acknowledge the callback first (removes the loading spinner)
        await callback.answer()
        await callback.message.answer(reply)

    # ----------------------------------------------------------------
    # Free-text messages — main assistant entry
    # ----------------------------------------------------------------

    @router.message(F.text)
    async def handle_text(message: Message) -> None:
        """Route any free-text message through AssistantCore."""
        user_id = _user_id_from_message(message)
        text = (message.text or "").strip()
        if not text:
            return

        logger.info(
            "Telegram text | user=%s len=%d preview=%r",
            user_id, len(text), text[:60],
        )
        reply = await _call_core(core, user_id, text)
        await message.answer(reply)

    return router
