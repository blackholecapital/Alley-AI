"""
interaction_log.py — Global Interaction Log
EXEC-AI-RAPID-002 | S2.1 | Worker B

Single log sink for all channels (Telegram, voice, UI, future).
Channel wrappers write here; core logic does not read from here.
No channel-specific logic lives in this file.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Default log path — overridable via env
_DEFAULT_LOG_PATH = Path(
    os.environ.get(
        "INTERACTION_LOG_PATH",
        "/job_site/executive_assistant_runtime/data/interaction_log.jsonl",
    )
)

# Demo mode flag — when True, entries are tagged but still written
_DEMO_MODE: bool = os.environ.get("DEMO_MODE", "true").lower() == "true"


def _log_path() -> Path:
    """Return the resolved log path, creating parent dirs if needed."""
    path = _DEFAULT_LOG_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def log_interaction(
    *,
    channel: str,
    direction: str,
    message: str,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    action_taken: Optional[str] = None,
    action_result: Optional[str] = None,
    error: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Write one interaction entry to the global log.

    Parameters
    ----------
    channel:       Source channel. Values: "telegram", "voice", "ui", "test", "cli"
    direction:     "in" for user→system, "out" for system→user
    message:       Raw message text (user input or assistant response)
    session_id:    Conversation session identifier. Auto-generated if omitted.
    user_id:       Opaque user identifier. Optional.
    action_taken:  Action router result label, e.g. "calendar_lookup"
    action_result: Short outcome string from the action layer
    error:         Error label if the turn failed
    metadata:      Arbitrary key/value pairs for channel-specific context

    Returns
    -------
    The dict written to the log.
    """
    if direction not in ("in", "out"):
        raise ValueError(f"direction must be 'in' or 'out', got {direction!r}")

    entry: dict[str, Any] = {
        "entry_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "channel": channel,
        "direction": direction,
        "session_id": session_id or str(uuid.uuid4()),
        "message": message,
        "demo_mode": _DEMO_MODE,
    }

    if user_id is not None:
        entry["user_id"] = user_id
    if action_taken is not None:
        entry["action_taken"] = action_taken
    if action_result is not None:
        entry["action_result"] = action_result
    if error is not None:
        entry["error"] = error
    if metadata:
        entry["metadata"] = metadata

    _append_entry(entry)
    return entry


def log_turn(
    *,
    channel: str,
    session_id: str,
    user_message: str,
    assistant_response: str,
    user_id: Optional[str] = None,
    action_taken: Optional[str] = None,
    action_result: Optional[str] = None,
    error: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Convenience wrapper: log both sides of one conversational turn.

    Writes an "in" entry for the user message and an "out" entry for the
    assistant response, sharing the same session_id.

    Returns a tuple (in_entry, out_entry).
    """
    in_entry = log_interaction(
        channel=channel,
        direction="in",
        message=user_message,
        session_id=session_id,
        user_id=user_id,
        metadata=metadata,
    )
    out_entry = log_interaction(
        channel=channel,
        direction="out",
        message=assistant_response,
        session_id=session_id,
        user_id=user_id,
        action_taken=action_taken,
        action_result=action_result,
        error=error,
        metadata=metadata,
    )
    return in_entry, out_entry


def read_log(limit: int = 100) -> list[dict[str, Any]]:
    """
    Read the most recent `limit` entries from the log.
    Returns an empty list if the log file does not exist.
    """
    path = _log_path()
    if not path.exists():
        return []

    lines = path.read_text(encoding="utf-8").strip().splitlines()
    recent = lines[-limit:] if len(lines) > limit else lines
    entries = []
    for line in recent:
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return entries


def clear_log() -> None:
    """Truncate the interaction log. Intended for test teardown only."""
    path = _log_path()
    if path.exists():
        path.write_text("", encoding="utf-8")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _append_entry(entry: dict[str, Any]) -> None:
    path = _log_path()
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
