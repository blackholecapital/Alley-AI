"""
app.py — Minimal Operator UI
EXEC-AI-RAPID-002 | S5.1 | Worker B

Panels:
  - Transcript pane   : running log of user inputs
  - Response pane     : running log of assistant responses
  - Talk control      : push-to-talk button (demo mode = text passthrough)
  - System status bar : demo mode flag, service health, session ID

Boot:
  python -m executive_assistant_runtime.ui.app
  or: flask --app executive_assistant_runtime.ui.app run --port 5050

Demo mode: DEMO_MODE=true (default) — no live voice or calendar required.
"""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEMO_MODE: bool = os.environ.get("DEMO_MODE", "true").lower() == "true"
HOST: str = os.environ.get("UI_HOST", "127.0.0.1")
PORT: int = int(os.environ.get("UI_PORT", "5050"))
DEBUG: bool = os.environ.get("UI_DEBUG", "false").lower() == "true"

_BOOT_TIME: str = datetime.now(timezone.utc).isoformat()

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------

app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static",
)
app.config["SECRET_KEY"] = os.environ.get("UI_SECRET_KEY", "dev-only-secret")

# ---------------------------------------------------------------------------
# Assistant core — load real core if available, else use in-process stub
# ---------------------------------------------------------------------------

def _load_core():
    try:
        # Add project root to path if needed
        _root = Path(__file__).resolve().parent.parent.parent
        if str(_root) not in sys.path:
            sys.path.insert(0, str(_root))
        from executive_assistant_runtime.core.assistant_core import AssistantCore
        return AssistantCore()
    except ImportError:
        return _StubCore()


class _StubCore:
    """In-process stub matching AssistantCore.process() contract."""

    def process(
        self,
        message: str,
        *,
        session_id: str,
        channel: str = "ui",
        user_id: str | None = None,
    ) -> dict[str, Any]:
        from executive_assistant_runtime.core.interaction_log import log_turn

        msg = message.lower().strip()
        if not msg:
            action, response = "fallback", "Please type a message or use the Talk button."
        elif any(w in msg for w in ("hello", "hi", "hey")):
            action = "greeting"
            response = "Hello! I'm your executive assistant. How can I help you today?"
        elif any(w in msg for w in ("calendar", "today", "schedule", "what's on")):
            action = "calendar_lookup"
            response = (
                "[Demo] Today: 10:00 AM — Team standup (30 min) · "
                "2:00 PM — Product review (1 hr)"
            )
        elif any(w in msg for w in ("book", "create", "schedule a", "add meeting")):
            action = "calendar_create"
            response = "[Demo] I would create that event. Shall I confirm? (yes / no)"
        elif any(w in msg for w in ("status", "health", "ping")):
            action = "status_check"
            response = (
                f"System status: OK · Demo mode: {'ON' if DEMO_MODE else 'OFF'} · "
                f"Boot: {_BOOT_TIME[:19]}Z"
            )
        else:
            action = "fallback"
            response = (
                "I'm not sure how to help with that. Try: calendar, book a meeting, or /help."
            )

        log_turn(
            channel=channel,
            session_id=session_id,
            user_message=message,
            assistant_response=response,
            user_id=user_id,
            action_taken=action,
        )

        return {
            "response": response,
            "action_taken": action,
            "session_id": session_id,
            "error": None,
        }


_core = _load_core()

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    """Render the operator UI."""
    return render_template(
        "index.html",
        demo_mode=DEMO_MODE,
        boot_time=_BOOT_TIME[:19] + "Z",
    )


@app.route("/api/message", methods=["POST"])
def api_message():
    """
    POST /api/message
    Body: { "text": "...", "session_id": "..." }
    Returns: { "response": "...", "action_taken": "...", "session_id": "...", "error": null }
    """
    data: dict = request.get_json(force=True, silent=True) or {}
    text: str = str(data.get("text", "")).strip()
    session_id: str = str(data.get("session_id", uuid.uuid4()))

    if not text:
        return jsonify({
            "response": "Please enter a message.",
            "action_taken": "fallback",
            "session_id": session_id,
            "error": "empty_input",
        })

    result = _core.process(text, session_id=session_id, channel="ui")
    return jsonify(result)


@app.route("/api/status")
def api_status():
    """
    GET /api/status
    Returns current system health, mode flags, and service states.
    """
    voice_status = "demo_passthrough" if DEMO_MODE else "unknown"
    core_class = type(_core).__name__

    return jsonify({
        "demo_mode": DEMO_MODE,
        "core_status": "ok",
        "core_class": core_class,
        "voice_status": voice_status,
        "boot_time": _BOOT_TIME,
        "server_time": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/api/log")
def api_log():
    """
    GET /api/log?limit=50
    Returns recent interaction log entries.
    """
    limit = min(int(request.args.get("limit", 50)), 200)
    try:
        from executive_assistant_runtime.core.interaction_log import read_log
        entries = read_log(limit=limit)
    except Exception:
        entries = []
    return jsonify({"entries": entries, "count": len(entries)})


@app.route("/health")
def health():
    """Simple liveness probe — returns 200 with no body overhead."""
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"[UI] Starting operator UI on http://{HOST}:{PORT}")
    print(f"[UI] DEMO_MODE={DEMO_MODE}")
    print(f"[UI] Core: {type(_core).__name__}")
    app.run(host=HOST, port=PORT, debug=DEBUG)
