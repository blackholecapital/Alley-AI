"""
menu_copy.py — Telegram UI text and menu labels
EXEC-AI-RAPID-002 | S3.1 | Worker B

All user-visible strings for the Telegram channel live here.
Telegram handler code imports from this module; text is never hardcoded
in telegram_bot.py or telegram_handlers.py.

Edit this file freely — no core logic depends on it.
"""

# ---------------------------------------------------------------------------
# Bot identity
# ---------------------------------------------------------------------------

BOT_NAME = "Executive Assistant"
BOT_SHORTNAME = "EA"

# ---------------------------------------------------------------------------
# /start — first contact or re-entry
# ---------------------------------------------------------------------------

WELCOME_MESSAGE = (
    "👋 Hello! I'm your *Executive Assistant*.\n\n"
    "I can help you with:\n"
    "• 📅 Calendar — check, book, or update events\n"
    "• 👤 Contacts — look up people or details\n"
    "• ❓ FAQ — quick answers to common questions\n\n"
    "Type a message or use /help to see what I can do."
)

WELCOME_RETURNING = (
    "Welcome back! How can I help you today?\n"
    "Use /help for a list of commands."
)

# ---------------------------------------------------------------------------
# /help — command reference
# ---------------------------------------------------------------------------

HELP_TEXT = (
    "*Executive Assistant — Commands*\n\n"
    "/start — restart and show welcome message\n"
    "/help — show this help\n"
    "/calendar — view or manage your calendar\n"
    "/contacts — search your contacts\n"
    "/faq — browse frequently asked questions\n"
    "/cancel — cancel the current action\n\n"
    "Or just type naturally — I'll do my best to understand you."
)

# ---------------------------------------------------------------------------
# Main menu — inline keyboard labels and callback data
# (handler code builds the keyboard; labels live here)
# ---------------------------------------------------------------------------

MENU_TITLE = "What would you like to do?"

MENU_BUTTONS: list[dict[str, str]] = [
    {"label": "📅 Calendar",  "callback": "menu:calendar"},
    {"label": "👤 Contacts",  "callback": "menu:contacts"},
    {"label": "❓ FAQ",       "callback": "menu:faq"},
    {"label": "⚙️ Settings",  "callback": "menu:settings"},
]

# ---------------------------------------------------------------------------
# Calendar sub-menu labels
# ---------------------------------------------------------------------------

CALENDAR_MENU_TITLE = "Calendar — what would you like to do?"

CALENDAR_BUTTONS: list[dict[str, str]] = [
    {"label": "📋 View today's events",   "callback": "calendar:today"},
    {"label": "📆 View upcoming events",  "callback": "calendar:upcoming"},
    {"label": "➕ Book a meeting",        "callback": "calendar:book"},
    {"label": "◀ Back",                  "callback": "menu:main"},
]

# Confirmation prompts (used before write actions)
CALENDAR_CONFIRM_PROMPT = (
    "Please confirm:\n\n{event_summary}\n\n"
    "Shall I create this event?"
)
CALENDAR_CONFIRM_YES = "✅ Yes, create it"
CALENDAR_CONFIRM_NO  = "❌ Cancel"

CALENDAR_CREATED_OK = "✅ Event created: *{summary}* on {date} at {time}."
CALENDAR_CREATE_CANCELLED = "Cancelled. No event was created."

CALENDAR_NO_EVENTS_TODAY = "You have no events scheduled for today."
CALENDAR_EVENTS_HEADER = "Here are your events:\n\n"

# ---------------------------------------------------------------------------
# Contacts sub-menu labels
# ---------------------------------------------------------------------------

CONTACTS_MENU_TITLE = "Contacts — search or browse."
CONTACTS_PROMPT = "Type a name or keyword to search your contacts:"
CONTACTS_NO_RESULTS = "No contacts found matching *{query}*."

# ---------------------------------------------------------------------------
# FAQ labels
# ---------------------------------------------------------------------------

FAQ_MENU_TITLE = "FAQ — select a topic:"
FAQ_NO_RESULTS = "No FAQ entries matched *{query}*. Try rephrasing."

# ---------------------------------------------------------------------------
# Settings labels
# ---------------------------------------------------------------------------

SETTINGS_MENU_TITLE = "Settings"
SETTINGS_DEMO_MODE_ON  = "⚠️ Demo mode is ON. Responses use seed data."
SETTINGS_DEMO_MODE_OFF = "✅ Live mode active."

# ---------------------------------------------------------------------------
# /cancel response
# ---------------------------------------------------------------------------

CANCEL_OK      = "Cancelled. Is there anything else I can help with?"
NOTHING_TO_CANCEL = "Nothing to cancel. How can I help?"

# ---------------------------------------------------------------------------
# Typing / status indicators
# ---------------------------------------------------------------------------

THINKING_TEXT = "Thinking…"

# ---------------------------------------------------------------------------
# Demo mode banner (appended to responses when DEMO_MODE=true)
# ---------------------------------------------------------------------------

DEMO_MODE_BANNER = "\n\n_[Demo mode — responses use seed data]_"
