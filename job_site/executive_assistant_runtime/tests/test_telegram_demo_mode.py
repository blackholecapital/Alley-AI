"""
test_telegram_demo_mode.py — Demo-mode-safe Telegram test cases
EXEC-AI-RAPID-002 | S3.1 | Worker B

Covers:
- menu_copy and fallback_copy modules (always runnable, no handler needed)
- get_error_response() helper
- Telegram handler demo-mode behaviour (stub-based until Worker A delivers handlers)
- Demo mode guard — no live API calls occur
- Copy strings are sourced from config modules, not hardcoded in handlers

No live Telegram token required. No aiogram event loop required.
Run with: pytest tests/test_telegram_demo_mode.py
"""

import importlib
import os
import sys
import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------

_RUNTIME_ROOT = Path(__file__).resolve().parent.parent
if str(_RUNTIME_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_ROOT.parent))

# Force demo mode for all tests
os.environ["DEMO_MODE"] = "true"

# Redirect interaction log to temp path
_TEST_LOG = Path(os.environ.get("TMPDIR", "/tmp")) / "tg_demo_test_log.jsonl"
os.environ["INTERACTION_LOG_PATH"] = str(_TEST_LOG)

# ---------------------------------------------------------------------------
# Imports from config modules (always available; no handler dependency)
# ---------------------------------------------------------------------------

from executive_assistant_runtime.config.menu_copy import (
    BOT_NAME,
    CANCEL_OK,
    DEMO_MODE_BANNER,
    HELP_TEXT,
    MENU_BUTTONS,
    MENU_TITLE,
    NOTHING_TO_CANCEL,
    UNKNOWN_COMMAND,
    WELCOME_MESSAGE,
    WELCOME_RETURNING,
)
from executive_assistant_runtime.config.fallback_copy import (
    AUTH_ERROR,
    CONFIRM_EXPIRED,
    CONFIRM_REQUIRED,
    DEMO_ACTION_BLOCKED,
    DEMO_UNAVAILABLE,
    EMPTY_INPUT,
    FALLBACK_RESPONSE,
    FALLBACK_SHORT,
    GENERIC_ERROR,
    RATE_LIMIT_ERROR,
    TIMEOUT_ERROR,
    UNKNOWN_COMMAND as FALLBACK_UNKNOWN_CMD,
    get_error_response,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def clear_test_log():
    if _TEST_LOG.exists():
        _TEST_LOG.write_text("")
    yield


@pytest.fixture()
def session_id() -> str:
    return f"tg-{uuid.uuid4().hex[:8]}"


@pytest.fixture()
def mock_telegram_message():
    """
    Minimal mock of an aiogram Message object.
    Covers the fields that Telegram handlers are expected to read.
    """
    msg = MagicMock()
    msg.text = "hello"
    msg.from_user = MagicMock()
    msg.from_user.id = 12345
    msg.from_user.first_name = "TestUser"
    msg.chat = MagicMock()
    msg.chat.id = 99001
    msg.answer = AsyncMock(return_value=None)
    msg.reply = AsyncMock(return_value=None)
    return msg


@pytest.fixture()
def mock_core_result():
    """Return a well-formed core result dict for mocking AssistantCore.process."""
    def _make(action="greeting", response=None, error=None):
        return {
            "response": response or "Hello! I'm your executive assistant.",
            "action_taken": action,
            "session_id": str(uuid.uuid4()),
            "error": error,
        }
    return _make


# ---------------------------------------------------------------------------
# 1. menu_copy module — structure and content
# ---------------------------------------------------------------------------


class TestMenuCopy:
    def test_welcome_message_not_empty(self):
        assert WELCOME_MESSAGE.strip()

    def test_welcome_message_mentions_calendar(self):
        assert "calendar" in WELCOME_MESSAGE.lower() or "Calendar" in WELCOME_MESSAGE

    def test_help_text_not_empty(self):
        assert HELP_TEXT.strip()

    def test_help_text_contains_start_command(self):
        assert "/start" in HELP_TEXT

    def test_help_text_contains_help_command(self):
        assert "/help" in HELP_TEXT

    def test_menu_buttons_is_list(self):
        assert isinstance(MENU_BUTTONS, list)
        assert len(MENU_BUTTONS) > 0

    def test_menu_buttons_have_label_and_callback(self):
        for btn in MENU_BUTTONS:
            assert "label" in btn, f"Button missing 'label': {btn}"
            assert "callback" in btn, f"Button missing 'callback': {btn}"
            assert btn["label"].strip()
            assert btn["callback"].strip()

    def test_menu_title_not_empty(self):
        assert MENU_TITLE.strip()

    def test_bot_name_not_empty(self):
        assert BOT_NAME.strip()

    def test_welcome_returning_not_empty(self):
        assert WELCOME_RETURNING.strip()

    def test_cancel_ok_not_empty(self):
        assert CANCEL_OK.strip()

    def test_nothing_to_cancel_not_empty(self):
        assert NOTHING_TO_CANCEL.strip()

    def test_unknown_command_not_empty(self):
        assert UNKNOWN_COMMAND.strip()

    def test_demo_mode_banner_not_empty(self):
        assert DEMO_MODE_BANNER.strip()

    def test_menu_buttons_callbacks_are_namespaced(self):
        """Callback data must use colon-namespaced format to avoid collisions."""
        for btn in MENU_BUTTONS:
            assert ":" in btn["callback"], (
                f"Callback data should be namespaced (e.g. 'menu:calendar'), got: {btn['callback']!r}"
            )


# ---------------------------------------------------------------------------
# 2. fallback_copy module — structure, content, and helper
# ---------------------------------------------------------------------------


class TestFallbackCopy:
    def test_fallback_response_not_empty(self):
        assert FALLBACK_RESPONSE.strip()

    def test_fallback_short_not_empty(self):
        assert FALLBACK_SHORT.strip()

    def test_generic_error_not_empty(self):
        assert GENERIC_ERROR.strip()

    def test_timeout_error_not_empty(self):
        assert TIMEOUT_ERROR.strip()

    def test_auth_error_not_empty(self):
        assert AUTH_ERROR.strip()

    def test_rate_limit_error_not_empty(self):
        assert RATE_LIMIT_ERROR.strip()

    def test_demo_unavailable_not_empty(self):
        assert DEMO_UNAVAILABLE.strip()

    def test_demo_action_blocked_not_empty(self):
        assert DEMO_ACTION_BLOCKED.strip()

    def test_confirm_required_not_empty(self):
        assert CONFIRM_REQUIRED.strip()

    def test_confirm_expired_not_empty(self):
        assert CONFIRM_EXPIRED.strip()

    def test_empty_input_not_empty(self):
        assert EMPTY_INPUT.strip()

    def test_all_strings_are_str(self):
        from executive_assistant_runtime.config import fallback_copy as fc
        for name in dir(fc):
            val = getattr(fc, name)
            if name.isupper() and not name.startswith("_"):
                assert isinstance(val, str), (
                    f"{name} should be str, got {type(val).__name__}"
                )

    def test_fallback_response_mentions_help(self):
        low = FALLBACK_RESPONSE.lower()
        assert "help" in low or "/help" in low

    def test_demo_action_blocked_does_not_reveal_internals(self):
        """Demo blocked message must not expose stack traces or code."""
        assert "Error" not in DEMO_ACTION_BLOCKED
        assert "Traceback" not in DEMO_ACTION_BLOCKED
        assert "Exception" not in DEMO_ACTION_BLOCKED


class TestGetErrorResponse:
    def test_none_returns_generic(self):
        assert get_error_response(None) == GENERIC_ERROR

    def test_unknown_label_returns_generic(self):
        assert get_error_response("totally_unknown_label") == GENERIC_ERROR

    def test_llm_timeout_maps_to_timeout_error(self):
        assert get_error_response("llm_timeout") == TIMEOUT_ERROR

    def test_action_failed_maps_to_generic(self):
        assert get_error_response("action_failed") == GENERIC_ERROR

    def test_auth_error_maps_correctly(self):
        assert get_error_response("auth_error") == AUTH_ERROR

    def test_rate_limit_maps_correctly(self):
        assert get_error_response("rate_limit") == RATE_LIMIT_ERROR

    def test_demo_blocked_maps_correctly(self):
        assert get_error_response("demo_blocked") == DEMO_ACTION_BLOCKED

    def test_session_reset_maps_correctly(self):
        from executive_assistant_runtime.config.fallback_copy import SESSION_RESET_NOTICE
        assert get_error_response("session_reset") == SESSION_RESET_NOTICE

    def test_return_type_is_always_str(self):
        for label in (None, "", "llm_timeout", "bogus", "auth_error"):
            result = get_error_response(label)
            assert isinstance(result, str), f"Expected str for label={label!r}"

    def test_result_never_exposes_error_label(self):
        """User-facing strings must not echo the internal error label."""
        label = "some_internal_error_code"
        result = get_error_response(label)
        assert label not in result


# ---------------------------------------------------------------------------
# 3. Demo mode guard — copy strings used, not hardcoded in handlers
# ---------------------------------------------------------------------------


class TestCopyIsExternalised:
    def test_menu_copy_importable(self):
        import importlib
        mod = importlib.import_module("executive_assistant_runtime.config.menu_copy")
        assert hasattr(mod, "WELCOME_MESSAGE")
        assert hasattr(mod, "HELP_TEXT")
        assert hasattr(mod, "FALLBACK_SHORT") is False  # fallback lives in fallback_copy

    def test_fallback_copy_importable(self):
        import importlib
        mod = importlib.import_module("executive_assistant_runtime.config.fallback_copy")
        assert hasattr(mod, "FALLBACK_RESPONSE")
        assert hasattr(mod, "get_error_response")

    def test_handler_does_not_hardcode_welcome(self):
        """
        If telegram_handlers.py exists, verify WELCOME_MESSAGE is imported
        from menu_copy rather than defined inline.
        """
        handler_path = (
            _RUNTIME_ROOT / "channels" / "telegram_handlers.py"
        )
        if not handler_path.exists():
            pytest.skip("telegram_handlers.py not yet built (Worker A S3 in progress)")

        src = handler_path.read_text(encoding="utf-8")
        # If it uses the welcome string, it must import from menu_copy
        if "WELCOME_MESSAGE" in src or "welcome" in src.lower():
            assert "from" in src and "menu_copy" in src, (
                "telegram_handlers.py references welcome text but does not import from menu_copy"
            )

    def test_handler_does_not_hardcode_fallback(self):
        """
        If telegram_handlers.py exists, verify fallback text is imported
        from fallback_copy rather than defined inline.
        """
        handler_path = (
            _RUNTIME_ROOT / "channels" / "telegram_handlers.py"
        )
        if not handler_path.exists():
            pytest.skip("telegram_handlers.py not yet built (Worker A S3 in progress)")

        src = handler_path.read_text(encoding="utf-8")
        if "fallback" in src.lower() or "I'm not sure" in src:
            assert "fallback_copy" in src, (
                "telegram_handlers.py contains fallback text but does not import from fallback_copy"
            )


# ---------------------------------------------------------------------------
# 4. Simulated Telegram handler — demo mode flow
# Stubs the handler logic so these tests run before Worker A delivers
# telegram_handlers.py. The stub matches the handler contract from
# docs/next_stage_hooks.md.
# ---------------------------------------------------------------------------


class _StubTelegramHandler:
    """
    Minimal in-process simulation of the Telegram /start, /help,
    free-text, and unknown-command flows.

    Matches the handler contract in docs/next_stage_hooks.md.
    Uses menu_copy and fallback_copy exclusively — no hardcoded text.
    """

    def __init__(self, core=None):
        import os
        self.demo_mode: bool = os.environ.get("DEMO_MODE", "true").lower() == "true"
        self._core = core or self._make_stub_core()

    @staticmethod
    def _make_stub_core():
        class _Core:
            def process(self, message, *, session_id, channel, user_id=None):
                msg = message.lower().strip()
                if any(w in msg for w in ("hello", "hi", "hey")):
                    action, resp = "greeting", "Hello! I'm your executive assistant."
                elif any(w in msg for w in ("calendar", "today", "schedule")):
                    action, resp = "calendar_lookup", "Today: 10:00 AM Standup, 2:00 PM Review."
                elif any(w in msg for w in ("book", "create", "schedule a")):
                    action, resp = "calendar_create", "[DEMO] Shall I create this event? (yes/no)"
                elif msg.strip() == "":
                    action, resp = "fallback", EMPTY_INPUT
                else:
                    action, resp = "fallback", FALLBACK_RESPONSE
                return {"response": resp, "action_taken": action, "session_id": session_id, "error": None}
        return _Core()

    def handle_start(self, chat_id: int) -> str:
        return WELCOME_MESSAGE

    def handle_help(self, chat_id: int) -> str:
        return HELP_TEXT

    def handle_cancel(self, chat_id: int, has_pending: bool = False) -> str:
        return CANCEL_OK if has_pending else NOTHING_TO_CANCEL

    def handle_unknown_command(self, command: str) -> str:
        return UNKNOWN_COMMAND

    def handle_text(self, text: str, chat_id: int, user_id: int, session_id: str) -> str:
        if not text or not text.strip():
            return EMPTY_INPUT

        result = self._core.process(
            text,
            session_id=session_id,
            channel="telegram",
            user_id=str(user_id),
        )

        if result["error"]:
            return get_error_response(result["error"])

        response = result["response"]
        if self.demo_mode:
            response += DEMO_MODE_BANNER
        return response


@pytest.fixture()
def handler() -> _StubTelegramHandler:
    return _StubTelegramHandler()


class TestHandlerStartFlow:
    def test_start_returns_welcome(self, handler):
        response = handler.handle_start(chat_id=99001)
        assert response == WELCOME_MESSAGE

    def test_start_response_not_empty(self, handler):
        assert handler.handle_start(chat_id=1).strip()

    def test_start_mentions_calendar(self, handler):
        response = handler.handle_start(chat_id=1).lower()
        assert "calendar" in response


class TestHandlerHelpFlow:
    def test_help_returns_help_text(self, handler):
        response = handler.handle_help(chat_id=99001)
        assert response == HELP_TEXT

    def test_help_contains_start_command(self, handler):
        assert "/start" in handler.handle_help(chat_id=1)

    def test_help_contains_help_command(self, handler):
        assert "/help" in handler.handle_help(chat_id=1)


class TestHandlerCancelFlow:
    def test_cancel_with_pending_action(self, handler):
        response = handler.handle_cancel(chat_id=1, has_pending=True)
        assert response == CANCEL_OK

    def test_cancel_with_nothing_pending(self, handler):
        response = handler.handle_cancel(chat_id=1, has_pending=False)
        assert response == NOTHING_TO_CANCEL


class TestHandlerUnknownCommand:
    def test_unknown_command_response(self, handler):
        response = handler.handle_unknown_command("/notacommand")
        assert response == UNKNOWN_COMMAND

    def test_unknown_command_not_empty(self, handler):
        assert handler.handle_unknown_command("/xyz").strip()


class TestHandlerFreeText:
    def test_greeting_returns_response(self, handler, session_id):
        response = handler.handle_text("hello", chat_id=1, user_id=42, session_id=session_id)
        assert response.strip()

    def test_demo_banner_appended_in_demo_mode(self, handler, session_id):
        response = handler.handle_text("hello", chat_id=1, user_id=42, session_id=session_id)
        assert DEMO_MODE_BANNER in response

    def test_empty_input_returns_empty_input_string(self, handler, session_id):
        response = handler.handle_text("", chat_id=1, user_id=42, session_id=session_id)
        assert response == EMPTY_INPUT

    def test_blank_input_returns_empty_input_string(self, handler, session_id):
        response = handler.handle_text("   ", chat_id=1, user_id=42, session_id=session_id)
        assert response == EMPTY_INPUT

    def test_unknown_input_returns_fallback(self, handler, session_id):
        response = handler.handle_text(
            "xyzzy nonsense 12345", chat_id=1, user_id=42, session_id=session_id
        )
        assert FALLBACK_RESPONSE in response or FALLBACK_SHORT in response

    def test_response_never_raises(self, handler, session_id):
        for text in ("", "hello", "book a meeting", "???", "xyzzy"):
            result = handler.handle_text(text, chat_id=1, user_id=42, session_id=session_id)
            assert isinstance(result, str)


class TestHandlerErrorSurface:
    def test_error_response_uses_fallback_copy(self, session_id):
        """When core returns an error, handler must return a fallback_copy string."""
        error_core = MagicMock()
        error_core.process.return_value = {
            "response": "Something went wrong internally.",
            "action_taken": "fallback",
            "session_id": session_id,
            "error": "llm_timeout",
        }
        h = _StubTelegramHandler(core=error_core)
        response = h.handle_text("hello", chat_id=1, user_id=42, session_id=session_id)
        assert response == TIMEOUT_ERROR

    def test_no_error_passes_core_response_through(self, session_id):
        ok_core = MagicMock()
        ok_core.process.return_value = {
            "response": "Here is your answer.",
            "action_taken": "greeting",
            "session_id": session_id,
            "error": None,
        }
        h = _StubTelegramHandler(core=ok_core)
        response = h.handle_text("hello", chat_id=1, user_id=42, session_id=session_id)
        assert "Here is your answer." in response


# ---------------------------------------------------------------------------
# 5. Demo mode guard — no live API calls
# ---------------------------------------------------------------------------


class TestDemoModeGuard:
    def test_demo_mode_env_is_true(self):
        assert os.environ.get("DEMO_MODE", "").lower() == "true"

    def test_handler_appends_demo_banner(self, handler, session_id):
        response = handler.handle_text("hello", chat_id=1, user_id=1, session_id=session_id)
        assert DEMO_MODE_BANNER in response, (
            "Demo mode banner must be appended when DEMO_MODE=true"
        )

    def test_no_aiogram_bot_instantiated_in_tests(self):
        """
        Ensure tests do not attempt to create a real aiogram Bot instance,
        which would fail without a valid token.
        """
        # If aiogram is installed but no token set, Bot() should NOT have been called
        try:
            import aiogram
            # If we reach here, aiogram is installed — verify no Bot was constructed
            # by checking that BOT_TOKEN env var is absent or dummy
            token = os.environ.get("BOT_TOKEN", "")
            assert token == "" or token == "DEMO", (
                "BOT_TOKEN is set in demo-mode tests — remove it or set to 'DEMO'"
            )
        except ImportError:
            pass  # aiogram not installed; that's fine for demo-mode tests

    def test_demo_action_blocked_string_present(self):
        """Verify the demo action blocked string is accessible for handlers to use."""
        assert DEMO_ACTION_BLOCKED.strip()
        assert "demo" in DEMO_ACTION_BLOCKED.lower()
