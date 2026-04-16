# Calendar Flow — EXEC-AI-RAPID-002
**Owner:** Worker B, S8.1  
**Scope:** Calendar action routing, confirmation gate contract, channel wiring, demo mode, session state

---

## 1. Two Action Types — Gate vs No-Gate

All calendar intents route through `action_router.py` to `calendar_actions.py`. The gate rule is simple:

| Action | Gate required | Provider called on first turn |
|--------|--------------|-------------------------------|
| `calendar_lookup` | No | Yes (read-only) |
| `calendar_create` | **Yes** | No — only after confirmed `yes` |
| `calendar_update` | **Yes** | No — only after confirmed `yes` |
| `calendar_delete` | **Yes** (future) | No — only after confirmed `yes` |

**Rule:** Any action that writes or modifies calendar data must pass through the confirmation gate. Read-only actions do not.

---

## 2. Full Flow Diagrams

### 2.1 Lookup Flow (no gate)

```
User: "What's on my calendar today?"
        │
        ▼
AssistantCore.process()
        │  action_taken = "calendar_lookup"
        ▼
ActionRouter → calendar_actions.handle("calendar_lookup", params, session_id)
        │
        ▼
CalendarProvider.list_events()          ← real API call or demo seed data
        │
        ▼
Returns: { response: "Today: ...", action_taken: "calendar_lookup", needs_confirm: False }
        │
        ▼
Channel wrapper sends response to user
        │
        ▼
interaction_log: in + out entries written
```

### 2.2 Create Flow (with confirmation gate)

**Turn 1 — Gate fires:**
```
User: "Book a meeting with Alex tomorrow at 3pm"
        │
        ▼
AssistantCore.process()
        │  action_taken = "calendar_create"
        ▼
ActionRouter → calendar_actions.handle("calendar_create", params, session_id)
        │
        ├─ pending_action NOT yet set
        │
        ▼
Store in session: { pending_action: { type: "calendar_create", params: {...} } }
        │
        ▼
Returns: { response: '[Demo] Shall I create "Meeting with Alex"? (yes / no)',
           needs_confirm: True }
        │
        ▼
Channel wrapper sends confirmation prompt to user
NO provider call yet.
```

**Turn 2a — User replies `yes`:**
```
User: "yes"
        │
        ▼
AssistantCore.process()
        │  action_taken = "calendar_confirm"   ← resolved from session state
        ▼
ActionRouter → calendar_actions.handle("calendar_confirm", {}, session_id)
        │
        ├─ pending_action exists in session
        │
        ▼
CalendarProvider.create_event(**pending_params)  ← provider called here only
        │
        ▼
Clear pending_action from session
        │
        ▼
Returns: { response: '[Demo] Event created: "Meeting with Alex".',
           action_taken: "calendar_confirm", needs_confirm: False }
        │
        ▼
Channel wrapper sends confirmation to user
```

**Turn 2b — User replies `no`:**
```
User: "no"
        │
        ▼
AssistantCore.process()
        │  action_taken = "calendar_cancel"
        ▼
ActionRouter → calendar_actions.handle("calendar_cancel", {}, session_id)
        │
        ├─ pending_action exists — discarded
        │
        ▼
Clear pending_action from session
        │
        ▼
Returns: { response: "Cancelled. No event was created.",
           action_taken: "calendar_cancel", needs_confirm: False }
        │
        ▼
Channel wrapper sends cancellation to user
NO provider call at any point.
```

---

## 3. Confirmation Gate Contract

This is the authoritative contract. Every implementation of `calendar_actions.py` must match it exactly.

### 3.1 Session state keys

| Key | Type | Set when | Cleared when |
|-----|------|----------|--------------|
| `pending_action.type` | `str` | Gate fires on `calendar_create` / `calendar_update` | `calendar_confirm` or `calendar_cancel` resolves it |
| `pending_action.params` | `dict` | Gate fires | Same as above |

No other session keys are written by the calendar action layer.

### 3.2 Returned dict shape (all calendar actions)

```python
{
    "response":     str,              # always non-empty; safe to display
    "action_taken": str,              # see table above
    "needs_confirm": bool,            # True only when prompt was just issued
    "error":        str | None,       # None on success
}
```

### 3.3 Python contract (from `docs/next_stage_hooks.md`)

```python
def handle_calendar_create(params: dict, session: dict) -> dict:
    if not session.get("pending_action"):
        # First turn — issue prompt
        session["pending_action"] = {"type": "calendar_create", "params": params}
        return {
            "response": f'[Demo] Shall I create "{params["summary"]}"? (yes / no)',
            "action_taken": "calendar_create",
            "needs_confirm": True,
            "error": None,
        }
    # Should not reach here via normal dispatch — confirm/cancel handles resolution
```

```python
def handle_calendar_confirm(session: dict, provider) -> dict:
    pending = session.pop("pending_action", None)
    if not pending:
        return {"response": "No pending action.", "action_taken": "calendar_cancel",
                "needs_confirm": False, "error": None}
    result = provider.create_event(**pending["params"])
    return {
        "response": f'[Demo] Event created: "{result["summary"]}".',
        "action_taken": "calendar_confirm",
        "needs_confirm": False,
        "error": None,
    }
```

---

## 4. Wiring into Each Channel

### 4.1 All channels — shared rule

The confirmation gate lives in the **action layer**, not in channel wrappers. Channel wrappers:
- Call `core.process(text, session_id=..., channel=...)` — one call per user turn
- Return `result["response"]` to the user — no branching on `action_taken`
- Do NOT manage `pending_action` themselves

The `session_id` carries the pending state between turns. Each channel is responsible for using a stable `session_id` throughout a conversation.

### 4.2 Telegram

```
User message → aiogram handler → core.process(text, session_id=str(chat_id), channel="telegram")
                                       │
                                       ▼
                                 result["response"]  (may be confirmation prompt)
                                       │
                                       ▼
                              await message.answer(result["response"])
```

If `result["response"]` is a confirmation prompt, the user types `yes` or `no` in the next message. The handler processes it identically — no special case in `telegram_handlers.py`.

**Session ID:** Use `str(message.chat.id)` — one stable ID per Telegram conversation.

### 4.3 Operator UI (Flask)

```
POST /api/message { text, session_id }
        │
        ▼
core.process(text, session_id=session_id, channel="ui")
        │
        ▼
result["response"] rendered in response pane
action tag chip shows action_taken label
```

If the response pane shows a confirmation prompt, the user types `yes` or `no` in the text input. The same `session_id` must be sent in the next POST — the browser's `SESSION_ID` constant (set at page load) handles this automatically.

### 4.4 Voice / UI (future S5 wiring)

```
STT transcript → core.process(transcript, session_id=call_session_id, channel="voice")
                       │
                       ▼
                 result["response"] → TTS → spoken to user
```

The voice pipeline holds one `session_id` per call. The confirmation prompt is spoken aloud. The user's spoken `yes` or `no` is transcribed by STT and sent as the next `core.process()` call in the same session.

---

## 5. Demo Mode Behaviour

When `DEMO_MODE=true`:

| Event | Demo behaviour |
|-------|----------------|
| `calendar_lookup` | Returns seed events from `data/seed_calendar.json` |
| `calendar_create` (turn 1) | Issues confirmation prompt — identical to live mode |
| `calendar_create` + `yes` (turn 2) | Returns `[Demo] Event created: "..."` — no API call |
| `calendar_create` + `no` (turn 2) | Returns cancellation — identical to live mode |
| `calendar_update` + `yes` | Returns `[Demo] Event updated: "..."` — no API call |

The gate fires identically in demo and live mode. The only difference is whether `CalendarProvider` calls a real API or returns a stub result.

**Demo mode guard rule:** `CalendarProvider` must check `DEMO_MODE` before making any HTTP call:

```python
import os

class CalendarProvider:
    DEMO_MODE = os.environ.get("DEMO_MODE", "true").lower() == "true"

    def create_event(self, **params) -> dict:
        if self.DEMO_MODE:
            return {"summary": params.get("summary", "New Event"), "id": "demo-001"}
        # live: call real calendar API
        ...
```

---

## 6. Seed Data

Demo mode reads from `data/seed_calendar.json`. Format:

```json
[
  {
    "id": "seed-001",
    "summary": "Team standup",
    "start": "2026-04-16T10:00:00",
    "end":   "2026-04-16T10:30:00",
    "attendees": []
  },
  {
    "id": "seed-002",
    "summary": "Product review",
    "start": "2026-04-16T14:00:00",
    "end":   "2026-04-16T15:00:00",
    "attendees": []
  }
]
```

`CalendarProvider.list_events()` returns this list when `DEMO_MODE=true`.

---

## 7. Provider Adapter Interface

`actions/calendar_provider.py` exposes this interface. Both the demo stub and the real provider implement it:

```python
class CalendarProvider:
    def list_events(self, date: str | None = None) -> list[dict]:
        """Return events for date (ISO format) or today if None."""
        ...

    def create_event(self, summary: str, start: str, end: str, **kwargs) -> dict:
        """Create an event. Returns created event dict with id."""
        ...

    def update_event(self, event_id: str, **kwargs) -> dict:
        """Update fields on an existing event."""
        ...

    def delete_event(self, event_id: str) -> bool:
        """Delete an event. Returns True on success."""
        ...
```

The real provider wires to a cal.com or Google Calendar API (S8 Worker A scope). The demo stub returns hardcoded responses from seed data.

---

## 8. S9 Checksum Evidence

For Foreman B to mark S9 PASS, evidence must show:

1. `calendar_lookup` returns seeded events in demo mode
2. `calendar_create` first turn returns a confirmation prompt (`needs_confirm: True`)
3. `calendar_create` + `yes` second turn returns creation confirmation — provider stub called
4. `calendar_create` + `no` second turn returns cancellation — provider stub NOT called
5. All four points above demonstrated through at least one active interface (Telegram stub, UI, or core test)
6. `pytest tests/test_calendar_confirmation.py` — all tests PASS

Accepted evidence: repo URL at this branch, or attached filesystem showing all artifacts.
