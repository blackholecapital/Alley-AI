"""
fallback_copy.py — Fallback, error, and edge-case response strings
EXEC-AI-RAPID-002 | S3.1 | Worker B

All strings used when the assistant cannot fulfil a request normally.
Telegram handlers import from this module. Text is never hardcoded in
telegram_bot.py or telegram_handlers.py.

Edit this file freely — no core logic depends on it.
"""

# ---------------------------------------------------------------------------
# Primary fallback — assistant understood the input but has no action for it
# ---------------------------------------------------------------------------

FALLBACK_RESPONSE = (
    "I'm not sure how to help with that.\n\n"
    "You can ask me about:\n"
    "• 📅 Calendar — events, bookings, availability\n"
    "• 👤 Contacts — search people\n"
    "• ❓ FAQ — quick answers\n\n"
    "Or type /help to see all commands."
)

# Shorter one-liner variant used mid-conversation
FALLBACK_SHORT = (
    "Sorry, I didn't catch that. Could you rephrase, "
    "or use /help to see what I can do?"
)

# ---------------------------------------------------------------------------
# Unknown command (e.g. /unknowncmd)
# ---------------------------------------------------------------------------

UNKNOWN_COMMAND = (
    "I don't recognise that command. "
    "Use /help to see what I can do."
)

# ---------------------------------------------------------------------------
# Empty / blank input
# ---------------------------------------------------------------------------

EMPTY_INPUT = (
    "It looks like your message was empty. "
    "Try typing a question or use /help."
)

# ---------------------------------------------------------------------------
# System / backend errors
# Shown to user when the assistant core returns an error field.
# The {error_label} placeholder is NOT shown to the user — it is for logging.
# ---------------------------------------------------------------------------

GENERIC_ERROR = (
    "Something went wrong on my end. Please try again in a moment.\n"
    "If the problem persists, use /start to reset."
)

TIMEOUT_ERROR = (
    "That took longer than expected and I had to stop. "
    "Please try again — a simpler question may work better right now."
)

AUTH_ERROR = (
    "I'm having trouble accessing that service right now. "
    "Please try again later or contact support."
)

RATE_LIMIT_ERROR = (
    "I'm receiving too many requests right now. "
    "Please wait a moment and try again."
)

# ---------------------------------------------------------------------------
# Confirmation / action-gate responses
# ---------------------------------------------------------------------------

CONFIRM_REQUIRED = (
    "Please confirm the action above before I proceed. "
    "Reply *yes* to confirm or *no* to cancel."
)

CONFIRM_EXPIRED = (
    "The confirmation window has expired. "
    "Please start the action again if you still want to proceed."
)

# ---------------------------------------------------------------------------
# Demo mode — responses when live backend is unavailable
# ---------------------------------------------------------------------------

DEMO_UNAVAILABLE = (
    "This feature requires a live connection that isn't set up yet.\n"
    "_[Demo mode — using seed data]_"
)

DEMO_ACTION_BLOCKED = (
    "This action is disabled in demo mode. "
    "No changes have been made.\n"
    "_[Demo mode — live writes are disabled]_"
)

# ---------------------------------------------------------------------------
# Session / context errors
# ---------------------------------------------------------------------------

SESSION_RESET_NOTICE = (
    "It looks like our conversation was reset. "
    "Let's start fresh — how can I help you today?"
)

# ---------------------------------------------------------------------------
# Rate/size limits
# ---------------------------------------------------------------------------

MESSAGE_TOO_LONG = (
    "Your message is too long for me to process. "
    "Please try a shorter question."
)

# ---------------------------------------------------------------------------
# Helper — pick the right error string for a core error label
# ---------------------------------------------------------------------------

_ERROR_MAP: dict[str, str] = {
    "llm_timeout":        TIMEOUT_ERROR,
    "action_failed":      GENERIC_ERROR,
    "validation_error":   FALLBACK_SHORT,
    "auth_error":         AUTH_ERROR,
    "rate_limit":         RATE_LIMIT_ERROR,
    "demo_blocked":       DEMO_ACTION_BLOCKED,
    "session_reset":      SESSION_RESET_NOTICE,
}


def get_error_response(error_label: str | None) -> str:
    """
    Map a core error label to a user-safe fallback string.
    Returns GENERIC_ERROR for unknown or None labels.
    Never surfaces the raw error_label to the user.
    """
    if not error_label:
        return GENERIC_ERROR
    return _ERROR_MAP.get(error_label, GENERIC_ERROR)
