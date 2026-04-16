# Golden Path Test Script — EXEC-AI-RAPID-002
**Stage:** S2 — Golden Path Assistant Core  
**Version:** S2.1-initial  
**Owner:** Worker B  
**Mode:** Human-executed known-good script (demo mode safe)

---

## Purpose

One human tester walks through the end-to-end assistant core path from cold start to logged response. This script is the acceptance gate for S2. It is updated in S6 with screenshot compare steps and in S8 with the calendar confirmation path.

Run this script after every core change before marking a stage PASS.

---

## Prerequisites

- Python 3.11+
- Dependencies installed: `pip install -r requirements.txt` (or `make install`)
- `DEMO_MODE=true` set in `.env` (default)
- No live credentials required for this pass

---

## Step 1 — Cold Boot Check

**Action:** From the project root, run:
```
make run
```
or
```
python -m executive_assistant_runtime.core.assistant_core
```

**Expected output (console):**
```
[BOOT] Assistant core initialised. DEMO_MODE=true
[BOOT] Interaction log ready at: .../data/interaction_log.jsonl
[BOOT] Action router loaded. Routes: greeting, fallback, calendar (stub)
```

**Pass condition:** No traceback. Boot message printed. Log file created (may be empty).

---

## Step 2 — Greeting Flow

**Action:** Send the input string `hello` through the test harness:
```
python -m executive_assistant_runtime.tests.run_golden_path --input "hello"
```
or invoke the assistant directly:
```python
from executive_assistant_runtime.core.assistant_core import AssistantCore
core = AssistantCore()
response = core.process("hello", session_id="test-001", channel="test")
print(response)
```

**Expected response:** Contains a greeting acknowledgement, e.g.:
```
Hello! I'm your executive assistant. How can I help you today?
```

**Pass condition:**
- Response is non-empty
- Response contains a greeting phrase (case-insensitive: "hello", "hi", "assist", "help")
- No error in console

---

## Step 3 — Main Assistant Reply

**Action:** Send a general query:
```
What is on my calendar today?
```

**Expected response (demo mode):** Returns seeded calendar data, e.g.:
```
Today you have: 10:00 AM — Team standup (30 min), 2:00 PM — Product review (1 hr).
```

**Pass condition:**
- Response is non-empty
- Response does not expose a raw Python error or stack trace
- Interaction log has a new "in" entry and "out" entry for this turn

---

## Step 4 — Action Routing Check

**Action:** Send an action-triggering phrase:
```
Book a meeting with Alex tomorrow at 3pm
```

**Expected response (demo mode):**
```
[DEMO] I would create a calendar event: "Meeting with Alex" on <tomorrow's date> at 3:00 PM.
Shall I confirm this? (yes/no)
```

**Pass condition:**
- Response contains a confirmation prompt
- Action router logs `action_taken: "calendar_create"` (visible in interaction log)
- No actual calendar write occurs (demo mode guard)

---

## Step 5 — Fallback Path

**Action:** Send an unrecognised or out-of-scope input:
```
xyzzy nonsense input 12345
```

**Expected response:**
```
I'm not sure how to help with that. Could you rephrase or choose from: calendar, contacts, FAQ.
```

**Pass condition:**
- Response is a clean fallback message
- No exception raised
- Interaction log records the turn with `action_taken: "fallback"`

---

## Step 6 — Interaction Log Verification

**Action:** Inspect the interaction log after completing Steps 2–5:
```python
from executive_assistant_runtime.core.interaction_log import read_log
entries = read_log(limit=20)
for e in entries:
    print(e["direction"], e["channel"], e["action_taken"])
```

**Expected output (one line per turn):**
```
in   test  None
out  test  None          ← greeting
in   test  None
out  test  calendar_lookup
in   test  None
out  test  calendar_create
in   test  None
out  test  fallback
```

**Pass condition:**
- At least 4 "out" entries exist
- Each "out" entry has a non-null `action_taken` (may be "fallback" or "greeting")
- All entries share valid `session_id` values
- No entries have `error` field set (unless a deliberate error test was added)

---

## Step 7 — One-Command Reboot Smoke Test

**Action:** Stop and restart the runtime. Re-run Step 2 (greeting only).

**Pass condition:**
- Boot completes cleanly again
- Interaction log appends new entries (does not overwrite prior entries)
- Entry count in log is higher than after the first run

---

## Sign-Off

| Step | Result | Tester | Notes |
|------|--------|--------|-------|
| 1 — Cold Boot | ☐ PASS / ☐ FAIL | | |
| 2 — Greeting | ☐ PASS / ☐ FAIL | | |
| 3 — Main Reply | ☐ PASS / ☐ FAIL | | |
| 4 — Action Routing | ☐ PASS / ☐ FAIL | | |
| 5 — Fallback | ☐ PASS / ☐ FAIL | | |
| 6 — Log Verify | ☐ PASS / ☐ FAIL | | |
| 7 — Reboot Smoke | ☐ PASS / ☐ FAIL | | |

**Overall result:** ☐ PASS — proceed to S3 / ☐ FAIL — return to S2

---

## Appendix — Known-Good Seed Responses (Demo Mode)

These are the expected demo-mode responses locked for S2. They will be updated in S6 after UI tighten.

| Input pattern | Expected action_taken | Expected response snippet |
|---|---|---|
| `hello` / `hi` | `greeting` | "Hello! I'm your executive assistant" |
| `calendar` / `schedule` / `what's on` | `calendar_lookup` | seeded event list |
| `book` / `schedule a meeting` | `calendar_create` | confirmation prompt |
| `[unrecognised]` | `fallback` | "I'm not sure how to help" |
