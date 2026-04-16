# Next Stage Hooks — EXEC-AI-RAPID-002
**Prepared by:** Worker B, S2.1  
**For stages:** S3 (Telegram), S5 (Voice/UI), S8 (Calendar Action Layer)

This document lists exactly what each next stage must call, import, or respect from the S2 core layer. It is a forward contract — nothing here requires implementation in S2. S3/S5/S8 workers read this doc first.

---

## 1. Core Entry Point — `AssistantCore.process()`

Every channel wrapper must call the single public entry point and nothing else inside core logic.

```python
from executive_assistant_runtime.core.assistant_core import AssistantCore

core = AssistantCore()

result: dict = core.process(
    message: str,          # Raw user text (already decoded by channel layer)
    *,
    session_id: str,       # Per-conversation ID; channel layer owns creation
    channel: str,          # "telegram" | "voice" | "ui" | "cli"
    user_id: str | None,   # Opaque user identifier; None is valid
)
```

**Returned dict (always present, never raises):**

| Key | Type | Notes |
|-----|------|-------|
| `response` | `str` | Text to send back to the user |
| `action_taken` | `str` | Label: `"greeting"`, `"calendar_lookup"`, `"calendar_create"`, `"fallback"` |
| `session_id` | `str` | Echo of the provided session_id |
| `error` | `str \| None` | Error label if the turn failed internally; `None` on success |

**Rule:** Channel wrappers MUST NOT inspect or branch on `action_taken`. That field is for logging and testing only.

---

## 2. Interaction Log — `log_turn()` / `log_interaction()`

Channel wrappers do NOT call the log directly in normal flow — the core calls it. However if a channel wrapper needs to log a channel-level event (e.g. a Telegram webhook that was rejected before reaching the core), use:

```python
from executive_assistant_runtime.core.interaction_log import log_interaction

log_interaction(
    channel="telegram",         # required
    direction="in",             # "in" or "out"
    message="<raw text>",       # required
    session_id="<session>",     # required
    user_id=None,               # optional
    action_taken=None,          # optional; set by core on "out" entries
    action_result=None,         # optional
    error="webhook_rejected",   # optional; set only on error
    metadata={"update_id": 42}, # optional; channel-specific context only
)
```

**Rule:** Log the channel event, not the core's decision. Core logs its own out-entry.

---

## 3. Session ID Contract

- Channel layer creates `session_id` on conversation start (e.g. Telegram `chat_id`, voice call UUID, UI tab UUID)
- One `session_id` per conversation, not per message
- Pass the same `session_id` on every `core.process()` call within that conversation
- Do not generate a new `session_id` mid-conversation

```python
import uuid
session_id = str(uuid.uuid4())   # created once per conversation
```

---

## 4. Demo Mode Guard

All channels must check `DEMO_MODE` before writing to live external services. The interaction log and core are demo-safe by default.

```python
import os
DEMO_MODE: bool = os.environ.get("DEMO_MODE", "true").lower() == "true"

if not DEMO_MODE:
    # call live Telegram, calendar API, etc.
    ...
else:
    # use seed data / stub responses
    ...
```

The demo mode flag is set in `.env` / `config/settings.py`. Do not hardcode it in channel wrappers.

---

## 5. Stage-Specific Hook Specs

### S3 — Telegram Channel Wrapper

**What S3 must do:**
- Import `AssistantCore` and call `core.process()` for every user text message
- Map `chat_id` → `session_id` (one per Telegram conversation)
- Pass `channel="telegram"` in every `core.process()` call
- Return `result["response"]` to the Telegram user
- Do NOT parse `action_taken` to branch behaviour
- Wrap every handler in a try/except; on error respond with the fallback copy from `config/fallback_copy.py`

**What S3 must NOT do:**
- Embed business logic (calendar checks, FAQ lookups) in the Telegram handler
- Call the interaction log directly for assistant turns (core does this)
- Import voice or UI modules

**Entry files S3 will create:**
```
channels/telegram_bot.py       ← aiogram app, bot init, startup hook
channels/telegram_handlers.py  ← /start, /help, free-text handler
```

**Minimal handler shape (S3 must match this):**
```python
@router.message()
async def handle_text(message: Message, session_id: str):
    result = core.process(
        message.text,
        session_id=session_id,
        channel="telegram",
        user_id=str(message.from_user.id),
    )
    await message.answer(result["response"])
```

---

### S5 — Voice / UI Layer

**What S5 must do:**
- Call `core.process()` with the transcript string from STT
- Pass `channel="voice"` or `channel="ui"` as appropriate
- Display `result["response"]` in the transcript pane and send to TTS
- Maintain one `session_id` per voice call / UI session
- In demo mode, skip actual STT/TTS hardware; use text passthrough

**What S5 must NOT do:**
- Hardcode responses — all content comes from `core.process()`
- Read from the interaction log to drive UI state

**Entry files S5 will create:**
```
voice/stt_service.py       ← STT adapter (real + demo mode stub)
voice/tts_service.py       ← TTS adapter (real + demo mode stub)
voice/voice_pipeline.py    ← STT → core.process() → TTS loop
ui/app.py                  ← minimal operator UI
```

**Voice pipeline call site shape:**
```python
transcript: str = await stt_service.listen()
result = core.process(transcript, session_id=session_id, channel="voice")
await tts_service.speak(result["response"])
```

---

### S8 — Calendar Action Layer

**What S8 must do:**
- Register calendar intents so `ActionRouter` dispatches to `calendar_actions.py`
- Implement explicit confirmation gate before any create/update action
- Support demo mode via seed data from `data/seed_calendar.json`
- Return structured calendar results back through `core.process()` response

**What S8 must NOT do:**
- Write calendar events without a confirmed user response ("yes" / "confirm")
- Bypass the `ActionRouter` by calling calendar logic directly from a channel

**Hook points S8 will wire into:**
```
core/action_router.py   ← register "calendar_create" and "calendar_lookup" routes
actions/calendar_actions.py  ← implement the actions
actions/calendar_provider.py ← provider adapter (real + demo stub)
```

**Confirmation gate contract:**
```python
# action_router dispatches here
def handle_calendar_create(params: dict, session: dict) -> dict:
    if not session.get("calendar_create_confirmed"):
        session["pending_action"] = {"type": "calendar_create", "params": params}
        return {"response": "[DEMO] Shall I create this event? (yes/no)", "needs_confirm": True}
    # confirmed — proceed
    result = calendar_provider.create_event(**params)
    session.pop("calendar_create_confirmed", None)
    return {"response": f"Event created: {result['summary']}", "needs_confirm": False}
```

---

## 6. Error Contract

Core always returns without raising. Channels must check `result["error"]` if they need to surface failures.

| `error` value | Meaning | Channel behaviour |
|---|---|---|
| `None` | Success | Deliver `result["response"]` normally |
| `"llm_timeout"` | Backend timed out | Deliver `result["response"]` (already a safe fallback) |
| `"action_failed"` | Action layer error | Deliver `result["response"]` (already a safe fallback) |
| `"validation_error"` | Bad input schema | Log; deliver `result["response"]` |

Channels should never surface raw error values to users. The `response` field is always safe to display.

---

## 7. Module Import Map (Read-Only Reference)

```
executive_assistant_runtime/
├── core/
│   ├── assistant_core.py      ← S2-WA: main entry point (AssistantCore)
│   ├── dialog_manager.py      ← S2-WA: session/dialog state
│   ├── action_router.py       ← S2-WA: action dispatch table
│   ├── error_models.py        ← S2-WA: error enum/dataclasses
│   └── interaction_log.py     ← S2-WB: global log (this stage)
├── channels/
│   ├── telegram_bot.py        ← S3-WA
│   ├── telegram_handlers.py   ← S3-WA
│   ├── telephony_stub.py      ← S10-WB
│   └── webchat_stub.py        ← S10-WB
├── voice/
│   ├── stt_service.py         ← S5-WA
│   ├── tts_service.py         ← S5-WA
│   └── voice_pipeline.py      ← S5-WA
├── ui/
│   └── app.py                 ← S5-WB
├── actions/
│   ├── calendar_actions.py    ← S8-WA
│   ├── calendar_provider.py   ← S8-WA
│   ├── ticket_stub.py         ← S10-WB
│   └── faq_stub.py            ← S10-WB
├── config/
│   ├── settings.py            ← S1-WB
│   ├── menu_copy.py           ← S3-WB
│   └── fallback_copy.py       ← S3-WB
├── data/
│   ├── seed_calendar.json     ← S1-WB
│   ├── seed_faq.json          ← S1-WB
│   ├── seed_contacts.json     ← S1-WB
│   └── interaction_log.jsonl  ← runtime (gitignored)
└── tests/
    ├── test_assistant_core.py       ← S2-WB (this stage)
    ├── golden_path_test.md          ← S2-WB (this stage)
    ├── test_telegram_wrapper.py     ← S3-WA
    ├── test_telegram_demo_mode.py   ← S3-WB
    ├── test_voice_pipeline.py       ← S5-WA
    ├── test_ui_boot.py              ← S5-WB
    ├── test_calendar_actions.py     ← S8-WA
    └── test_calendar_confirmation.py← S8-WB
```

---

## 8. What S3/S5/S8 Workers Must NOT Change

To protect stage boundary stability, the following items are frozen after S2:

| Item | Frozen? | Reason |
|---|---|---|
| `AssistantCore.process()` signature | YES | All channels depend on this |
| `interaction_log.log_turn()` signature | YES | Tests depend on this |
| `result` dict key names | YES | Tests assert on these |
| Log file path env var `INTERACTION_LOG_PATH` | YES | Test harness depends on this |
| `DEMO_MODE` env var name | YES | All stages check this |

If a future stage needs to extend the API, it must not rename or remove existing parameters — only add optional ones with defaults.
