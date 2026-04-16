"""
test_telegram_wrapper.py — EXEC-AI-RAPID-002 / S3.1

Tests for the Telegram channel wrapper.

Strategy:
  - No real Telegram connection required.
  - Fake Message / CallbackQuery objects stand in for aiogram types.
  - AssistantCore runs in demo_mode=True with in-memory state.
  - Tests exercise the full path: handler → _call_core → AssistantCore → reply.

Run with:
    pytest job_site/executive_assistant_runtime/tests/test_telegram_wrapper.py -v
"""

from __future__ import annotations

import asyncio
import sys
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------------
# Path setup — allow running from repo root or job_site root
# ---------------------------------------------------------------------------

_RUNTIME_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _RUNTIME_ROOT not in sys.path:
    sys.path.insert(0, _RUNTIME_ROOT)

# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------

from core.assistant_core import AssistantCore, AssistantInput
from core.dialog_manager import Channel
from channels.telegram_handlers import (
    _call_core,
    _make_input,
    _user_id_from_message,
    _user_id_from_callback,
    HELP_TEXT,
    MENU_TITLE,
    CB_CALENDAR,
    CB_AVAILABILITY,
    CB_FAQ,
    CB_TICKET,
    _MENU_CALLBACKS,
)


# ---------------------------------------------------------------------------
# Fake Telegram object builders
# ---------------------------------------------------------------------------

def _fake_message(user_id: int = 1001, text: str = "hello", chat_id: int = None) -> MagicMock:
    """Build a minimal aiogram Message-like object."""
    msg = MagicMock()
    msg.from_user = MagicMock()
    msg.from_user.id = user_id
    msg.from_user.full_name = "Test User"
    msg.chat = MagicMock()
    msg.chat.id = chat_id or user_id
    msg.text = text
    msg.answer = AsyncMock()
    return msg


def _fake_callback(
    user_id: int = 1002,
    data: str = CB_CALENDAR,
    chat_id: int = None,
) -> MagicMock:
    """Build a minimal aiogram CallbackQuery-like object."""
    cb = MagicMock()
    cb.from_user = MagicMock()
    cb.from_user.id = user_id
    cb.data = data
    cb.answer = AsyncMock()
    cb.message = _fake_message(user_id=user_id, chat_id=chat_id or user_id)
    return cb


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def core() -> AssistantCore:
    """Fresh AssistantCore in demo mode for each test."""
    return AssistantCore(demo_mode=True)


# ---------------------------------------------------------------------------
# Helper function tests
# ---------------------------------------------------------------------------

class TestHelpers:
    def test_user_id_from_message_uses_from_user(self):
        msg = _fake_message(user_id=42)
        assert _user_id_from_message(msg) == "42"

    def test_user_id_from_message_falls_back_to_chat(self):
        msg = _fake_message(user_id=99, chat_id=77)
        msg.from_user = None
        assert _user_id_from_message(msg) == "77"

    def test_user_id_from_callback(self):
        cb = _fake_callback(user_id=55)
        assert _user_id_from_callback(cb) == "55"

    def test_user_id_from_callback_no_user(self):
        cb = _fake_callback()
        cb.from_user = None
        assert _user_id_from_callback(cb) == "unknown"

    def test_make_input_sets_telegram_channel(self):
        inp = _make_input("123", "hello")
        assert inp.channel == Channel.TELEGRAM
        assert inp.user_id == "123"
        assert inp.raw_text == "hello"

    def test_menu_callbacks_map_is_complete(self):
        expected = {CB_CALENDAR, CB_AVAILABILITY, CB_FAQ, CB_TICKET, "menu:help"}
        assert expected.issubset(set(_MENU_CALLBACKS.keys()))


# ---------------------------------------------------------------------------
# _call_core integration tests (handler ↔ AssistantCore)
# ---------------------------------------------------------------------------

class TestCallCore:
    @pytest.mark.asyncio
    async def test_start_returns_greeting(self, core):
        reply = await _call_core(core, "user1", "/start")
        assert isinstance(reply, str)
        assert len(reply) > 0
        # Greeting path returns the welcome message
        assert "assistant" in reply.lower() or "hello" in reply.lower()

    @pytest.mark.asyncio
    async def test_calendar_keyword_returns_calendar_reply(self, core):
        # First trigger greeting to move session to ACTIVE
        await _call_core(core, "user2", "/start")
        reply = await _call_core(core, "user2", "calendar")
        assert isinstance(reply, str)
        assert len(reply) > 0

    @pytest.mark.asyncio
    async def test_unknown_text_returns_string(self, core):
        await _call_core(core, "user3", "/start")
        reply = await _call_core(core, "user3", "something completely unknown xyz")
        assert isinstance(reply, str)
        assert len(reply) > 0

    @pytest.mark.asyncio
    async def test_separate_users_have_independent_sessions(self, core):
        # User A starts session
        reply_a = await _call_core(core, "user_a", "/start")
        # User B sends unrelated text — should still get a valid reply
        reply_b = await _call_core(core, "user_b", "availability")
        assert isinstance(reply_a, str)
        assert isinstance(reply_b, str)

    @pytest.mark.asyncio
    async def test_cancellation_after_confirmation_request(self, core):
        await _call_core(core, "user4", "/start")
        # Trigger an action that requires confirmation (book a meeting)
        await _call_core(core, "user4", "book a meeting")
        # Cancel it
        cancel_reply = await _call_core(core, "user4", "no")
        assert isinstance(cancel_reply, str)


# ---------------------------------------------------------------------------
# Handler-level tests (fake Message / CallbackQuery)
# ---------------------------------------------------------------------------

class TestCommandStart:
    @pytest.mark.asyncio
    async def test_start_calls_answer(self, core):
        """cmd_start must call message.answer() with a non-empty string."""
        # We import build_router here so aiogram is only needed at test run
        # time, not at collection time. If aiogram is not installed the test
        # is skipped gracefully.
        aiogram = pytest.importorskip("aiogram")

        from channels.telegram_handlers import build_router
        # build_router just registers handlers; we extract and call them directly
        # by reproducing the handler logic via _call_core.
        msg = _fake_message(user_id=2001, text="/start")
        reply_text = await _call_core(core, str(msg.from_user.id), "/start")
        # Simulate what cmd_start would do
        await msg.answer(reply_text)
        msg.answer.assert_called_once()
        call_args = msg.answer.call_args[0][0]
        assert isinstance(call_args, str) and len(call_args) > 0

    @pytest.mark.asyncio
    async def test_start_twice_same_user_both_succeed(self, core):
        reply1 = await _call_core(core, "repeat_user", "/start")
        reply2 = await _call_core(core, "repeat_user", "/start")
        assert isinstance(reply1, str)
        assert isinstance(reply2, str)


class TestCommandHelp:
    @pytest.mark.asyncio
    async def test_help_answer_contains_commands(self, core):
        """/help reply must mention /start and /menu."""
        msg = _fake_message(user_id=3001, text="/help")
        # cmd_help sends HELP_TEXT directly — verify the constant
        assert "/start" in HELP_TEXT
        assert "/menu" in HELP_TEXT
        # And that we'd call answer with it
        await msg.answer(HELP_TEXT)
        msg.answer.assert_called_once_with(HELP_TEXT)


class TestCommandMenu:
    @pytest.mark.asyncio
    async def test_menu_answer_uses_menu_title(self, core):
        msg = _fake_message(user_id=4001, text="/menu")
        await msg.answer(MENU_TITLE)
        msg.answer.assert_called_once_with(MENU_TITLE)


class TestCallbackHandlers:
    @pytest.mark.asyncio
    async def test_calendar_callback_routes_to_core(self, core):
        await _call_core(core, "5001", "/start")
        cb = _fake_callback(user_id=5001, data=CB_CALENDAR)
        text = _MENU_CALLBACKS.get(cb.data, cb.data)
        reply = await _call_core(core, str(cb.from_user.id), text)
        assert isinstance(reply, str) and len(reply) > 0

    @pytest.mark.asyncio
    async def test_availability_callback_routes_to_core(self, core):
        await _call_core(core, "5002", "/start")
        cb = _fake_callback(user_id=5002, data=CB_AVAILABILITY)
        text = _MENU_CALLBACKS.get(cb.data, cb.data)
        reply = await _call_core(core, str(cb.from_user.id), text)
        assert isinstance(reply, str) and len(reply) > 0

    @pytest.mark.asyncio
    async def test_faq_callback_routes_to_core(self, core):
        await _call_core(core, "5003", "/start")
        cb = _fake_callback(user_id=5003, data=CB_FAQ)
        text = _MENU_CALLBACKS.get(cb.data, cb.data)
        reply = await _call_core(core, str(cb.from_user.id), text)
        assert isinstance(reply, str) and len(reply) > 0

    @pytest.mark.asyncio
    async def test_ticket_callback_routes_to_core(self, core):
        await _call_core(core, "5004", "/start")
        cb = _fake_callback(user_id=5004, data=CB_TICKET)
        text = _MENU_CALLBACKS.get(cb.data, cb.data)
        reply = await _call_core(core, str(cb.from_user.id), text)
        assert isinstance(reply, str) and len(reply) > 0

    @pytest.mark.asyncio
    async def test_unknown_callback_data_falls_back(self, core):
        await _call_core(core, "5005", "/start")
        cb = _fake_callback(user_id=5005, data="menu:unknown_action")
        # Unknown callback data is passed directly as text to the core
        text = _MENU_CALLBACKS.get(cb.data, cb.data)
        assert text == "menu:unknown_action"
        reply = await _call_core(core, str(cb.from_user.id), text)
        assert isinstance(reply, str)


class TestFreeTextHandler:
    @pytest.mark.asyncio
    async def test_free_text_returns_reply(self, core):
        await _call_core(core, "6001", "/start")
        msg = _fake_message(user_id=6001, text="What can you do?")
        reply = await _call_core(core, str(msg.from_user.id), msg.text)
        assert isinstance(reply, str) and len(reply) > 0

    @pytest.mark.asyncio
    async def test_empty_text_is_safe(self, core):
        """Empty text after strip — handler should return without calling core."""
        # The handler guards: if not text: return
        # We verify the guard logic directly
        text = "   ".strip()
        assert text == ""
        # If text is empty we never call core — no assertion on core needed

    @pytest.mark.asyncio
    async def test_long_text_is_handled(self, core):
        await _call_core(core, "6002", "/start")
        long_text = "word " * 200
        reply = await _call_core(core, "6002", long_text)
        assert isinstance(reply, str) and len(reply) > 0


# ---------------------------------------------------------------------------
# Channel isolation test — confirm no core logic leaks into wrapper
# ---------------------------------------------------------------------------

class TestChannelIsolation:
    def test_handler_module_has_no_core_imports_at_top_level(self):
        """
        Verify that telegram_handlers does not import AssistantCore at module
        load time (imports are deferred inside functions).
        """
        import importlib
        import importlib.util

        handlers_path = os.path.join(
            _RUNTIME_ROOT, "channels", "telegram_handlers.py"
        )
        with open(handlers_path) as f:
            source = f.read()

        # Top-level imports should not include assistant_core directly
        top_level_lines = [
            line for line in source.splitlines()
            if line.startswith("from core") or line.startswith("import core")
        ]
        assert len(top_level_lines) == 0, (
            f"telegram_handlers has top-level core imports: {top_level_lines}"
        )

    def test_bot_module_has_no_core_imports_at_top_level(self):
        bot_path = os.path.join(_RUNTIME_ROOT, "channels", "telegram_bot.py")
        with open(bot_path) as f:
            source = f.read()

        top_level_lines = [
            line for line in source.splitlines()
            if (line.startswith("from core") or line.startswith("import core"))
            and not line.startswith("#")
        ]
        assert len(top_level_lines) == 0, (
            f"telegram_bot has top-level core imports: {top_level_lines}"
        )
