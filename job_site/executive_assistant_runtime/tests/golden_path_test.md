# Golden Path Test Script — EXEC-AI-RAPID-002
**Stage:** S6 — Screenshot Checkpoint and UI Tighten Pass  
**Version:** S6.1 (updated from S2.1-initial)  
**Owner:** Worker B  
**Mode:** Human-executed known-good script (demo mode safe)

**Change log:**
- S2.1-initial: core path only (Steps 1–7)
- S6.1: added UI boot section (Steps 8–14), screenshot compare steps throughout, Telegram channel smoke test (Step 15), updated sign-off table

---

## Purpose

One human tester walks through the complete golden path end-to-end: core, operator UI, Telegram smoke, and interaction log. This script is the acceptance gate for S6 and the standing regression script for all subsequent stages.

Run this script in full before marking any stage PASS from S6 onward.

---

## Prerequisites

- Python 3.11+
- Flask installed: `pip install flask` (or `make install`)
- `DEMO_MODE=true` in `.env` (default — no live credentials required)
- Reference screenshots SS-01 through SS-05 captured at S5 boot (see `docs/screenshot_protocol.md`)
- Browser open at `http://127.0.0.1:5050/` for UI steps

---

## How Screenshot Compare Steps Work

Steps marked **📸 SCREENSHOT COMPARE** require the tester to:

1. Capture a fresh screenshot using the method in `docs/screenshot_protocol.md`
2. Open the reference screenshot (SS-0X from S5) side-by-side
3. Tick each named check — all checks must pass for the step to PASS
4. Save the new screenshot as `ss-0X-s6-<date>.png` in `docs/screenshots/`

A step FAILS if any screenshot check fails. Record the defect in the sign-off notes column.

---

## ── PART A: ASSISTANT CORE ──────────────────────────────────────────────

## Step 1 — Cold Boot Check

**Action:** From the project root, run:
```
make run
```
or:
```
python -m executive_assistant_runtime.core.assistant_core
```

**Expected console output:**
```
[BOOT] Assistant core initialised. DEMO_MODE=true
[BOOT] Interaction log ready at: .../data/interaction_log.jsonl
[BOOT] Action router loaded. Routes: greeting, fallback, calendar (stub)
```

**Pass condition:**
- No traceback
- Boot message printed
- Log file created (may be empty)

---

## Step 2 — Greeting Flow

**Action:** Send the input string `hello`:
```python
from executive_assistant_runtime.core.assistant_core import AssistantCore
core = AssistantCore()
result = core.process("hello", session_id="test-001", channel="test")
print(result["response"])
```

**Expected response:** Contains a greeting acknowledgement, e.g.:
```
Hello! I'm your executive assistant. How can I help you today?
```

**Pass condition:**
- Response is non-empty
- Response contains at least one of: "hello", "hi", "assist", "help" (case-insensitive)
- `result["error"]` is `None`
- `result["action_taken"]` is `"greeting"`

---

## Step 3 — Main Assistant Reply

**Action:** Send `What is on my calendar today?`

**Expected response (demo mode):**
```
Today you have: 10:00 AM — Team standup (30 min), 2:00 PM — Product review (1 hr).
```

**Pass condition:**
- Response is non-empty
- No Python traceback or raw error string in response
- `result["action_taken"]` is `"calendar_lookup"`
- Interaction log has a new "in" and "out" entry for this turn

---

## Step 4 — Action Routing Check

**Action:** Send `Book a meeting with Alex tomorrow at 3pm`

**Expected response (demo mode):**
```
[DEMO] I would create a calendar event. Shall I confirm? (yes/no)
```

**Pass condition:**
- Response contains a confirmation prompt (contains "confirm", "yes", or "no")
- `result["action_taken"]` is `"calendar_create"`
- No actual calendar write occurs

---

## Step 5 — Fallback Path

**Action:** Send `xyzzy nonsense input 12345`

**Expected response:**
```
I'm not sure how to help with that. Could you rephrase or choose from: calendar, contacts, FAQ.
```

**Pass condition:**
- Response is a clean fallback message
- `result["action_taken"]` is `"fallback"`
- `result["error"]` is `None`

---

## Step 6 — Interaction Log Verification

**Action:** Inspect the log after Steps 2–5:
```python
from executive_assistant_runtime.core.interaction_log import read_log
entries = read_log(limit=20)
for e in entries:
    print(e["direction"], e["channel"], e.get("action_taken"))
```

**Expected output:**
```
in   test  None
out  test  greeting
in   test  None
out  test  calendar_lookup
in   test  None
out  test  calendar_create
in   test  None
out  test  fallback
```

**Pass condition:**
- At least 4 "out" entries exist
- Every "out" entry has a non-null `action_taken`
- All entries share valid `session_id` values
- No entries have `error` field set (unless deliberate)

---

## Step 7 — Reboot Smoke Test

**Action:** Stop and restart the runtime. Re-run Step 2 (greeting only).

**Pass condition:**
- Boot completes cleanly
- Interaction log appends new entries (does not overwrite)
- Entry count is higher than after the first run

---

## ── PART B: OPERATOR UI ─────────────────────────────────────────────────

## Step 8 — UI Cold Boot

**Action:** Start the Flask UI:
```
python -m executive_assistant_runtime.ui.app
```
Open `http://127.0.0.1:5050/` in a browser.

**Pass condition (functional):**
- Page loads without error (HTTP 200)
- No JavaScript errors in browser console (open DevTools → Console)
- Status bar visible at the top
- Transcript pane visible on the left
- Response pane visible on the right
- Input bar visible at the bottom

**📸 SCREENSHOT COMPARE — SS-01**
Compare your fresh capture against `ss-01-cold-boot.png`:

| Check | Expected | Pass? |
|-------|----------|-------|
| Status bar present | Visible at top of window | ☐ |
| `DEMO MODE` badge | Orange/amber badge in status bar | ☐ |
| Core status | Shows `ok` | ☐ |
| Voice status | Shows `demo_passthrough` | ☐ |
| Session ID | 8-char prefix visible | ☐ |
| Transcript pane | Left pane with placeholder text | ☐ |
| Response pane | Right pane with placeholder text | ☐ |
| Input bar | Talk button + text field + Send button visible | ☐ |
| Talk button | Visually disabled / dimmed (demo mode) | ☐ |
| Boot time | Populated in status bar | ☐ |

---

## Step 9 — UI Greeting Flow

**Action:** Click the text input field. Type `hello`. Press Enter.

**Pass condition (functional):**
- Text input clears after submission
- Thinking indicator appears briefly then disappears
- Transcript pane shows the submitted text `hello` with a timestamp
- Response pane shows a greeting response with a timestamp
- An action tag chip labelled `greeting` appears below the response

**📸 SCREENSHOT COMPARE — SS-02**
Compare your fresh capture against `ss-02-greeting-response.png`:

| Check | Expected | Pass? |
|-------|----------|-------|
| Transcript entry visible | `hello` with timestamp | ☐ |
| Response entry visible | Greeting text with timestamp | ☐ |
| Action tag chip | `greeting` label present | ☐ |
| Thinking indicator | NOT visible after response arrives | ☐ |
| Status bar unchanged | `DEMO MODE` badge still present | ☐ |
| No error text visible | No traceback or HTTP error string | ☐ |

---

## Step 10 — UI Calendar Query

**Action:** Type `What is on my calendar today?` and press Enter.

**Pass condition (functional):**
- Response pane adds a new entry with seeded calendar events
- Action tag chip shows `calendar_lookup`
- Transcript pane adds the query entry

**📸 SCREENSHOT COMPARE — SS-03**
Compare your fresh capture against `ss-03-calendar-demo.png`:

| Check | Expected | Pass? |
|-------|----------|-------|
| Transcript entry visible | Calendar query with timestamp | ☐ |
| Response entry visible | Event list from demo seed data | ☐ |
| Action tag chip | `calendar_lookup` label present | ☐ |
| No API error | No "failed to reach backend" text | ☐ |
| Pane scrolls | Both panes show all entries (scroll if needed) | ☐ |

---

## Step 11 — UI Fallback Response

**Action:** Type `xyzzy nonsense input` and press Enter.

**Pass condition (functional):**
- Response pane adds fallback copy text (from `config/fallback_copy.py`)
- Action tag chip shows `fallback`
- No raw Python exception or HTTP error visible anywhere on the page

**📸 SCREENSHOT COMPARE — SS-04**
Compare your fresh capture against `ss-04-fallback.png`:

| Check | Expected | Pass? |
|-------|----------|-------|
| Response entry visible | Fallback text with timestamp | ☐ |
| Action tag chip | `fallback` label present | ☐ |
| No error text | No `500`, `Traceback`, `Exception` visible | ☐ |
| Transcript entry visible | Input logged with timestamp | ☐ |

---

## Step 12 — UI Status Bar Live Check

**Action:** No new input. Check the status bar in its current state.

**Pass condition (functional):**
- Core status reads `ok`
- Voice status reads `demo_passthrough`
- Session ID prefix is visible (8 characters, alphanumeric)

**📸 SCREENSHOT COMPARE — SS-05**
Compare your fresh capture against `ss-05-status-bar.png`:

| Check | Expected | Pass? |
|-------|----------|-------|
| Core value | `ok` (not `checking…` or `err`) | ☐ |
| Voice value | `demo_passthrough` | ☐ |
| Session ID | 8-char hex prefix + ellipsis | ☐ |
| All dividers visible | Status bar items separated cleanly | ☐ |

---

## Step 13 — UI Pane Clear Control

**Action:** Click the `Clear` button in the Transcript pane header. Then click `Clear` in the Response pane header.

**Pass condition:**
- Transcript pane empties immediately (no page reload)
- Response pane empties immediately (no page reload)
- Input bar remains unchanged
- Status bar remains unchanged

---

## Step 14 — UI Reboot Persistence Check

**Action:** Stop and restart the Flask server. Reload `http://127.0.0.1:5050/` in the browser.

**Pass condition:**
- Page loads cleanly (no 500 error)
- Panes are empty (session state not persisted — expected)
- Status bar shows a fresh boot time

---

## ── PART C: TELEGRAM SMOKE TEST ─────────────────────────────────────────

## Step 15 — Telegram Demo-Mode Smoke (pytest only)

*Full live Telegram flow requires a bot token and is skipped in demo mode. Run the test suite instead.*

**Action:**
```bash
pytest tests/test_telegram_demo_mode.py -v
```

**Pass condition:**
- All tests pass (0 failures)
- No test is erroring on `ImportError` for `telegram_handlers` unless marked as `skip`
- `TestHandlerStartFlow`, `TestHandlerHelpFlow`, `TestHandlerFreeText` all PASS

---

## ── PART D: END-TO-END LOG CHECK ────────────────────────────────────────

## Step 16 — Full Log Audit

**Action:** After completing Steps 8–15, inspect the log via the UI API:
```
GET http://127.0.0.1:5050/api/log?limit=50
```
or via Python:
```python
from executive_assistant_runtime.core.interaction_log import read_log
entries = read_log(limit=50)
print(f"Total entries: {len(entries)}")
channels = set(e["channel"] for e in entries)
print("Channels seen:", channels)
```

**Pass condition:**
- Total entries ≥ 8 (4 core turns + 4 UI turns)
- `"ui"` channel present in entries
- `"test"` channel present in entries
- Every entry has: `entry_id`, `timestamp`, `channel`, `direction`, `session_id`, `message`
- No entry has a `direction` value other than `"in"` or `"out"`

---

## Sign-Off

| Step | Category | Result | Tester | Screenshot saved? | Notes |
|------|----------|--------|--------|-------------------|-------|
| 1 — Core Boot | Core | ☐ PASS / ☐ FAIL | | — | |
| 2 — Greeting | Core | ☐ PASS / ☐ FAIL | | — | |
| 3 — Calendar Reply | Core | ☐ PASS / ☐ FAIL | | — | |
| 4 — Action Routing | Core | ☐ PASS / ☐ FAIL | | — | |
| 5 — Fallback | Core | ☐ PASS / ☐ FAIL | | — | |
| 6 — Log Verify | Core | ☐ PASS / ☐ FAIL | | — | |
| 7 — Reboot Smoke | Core | ☐ PASS / ☐ FAIL | | — | |
| 8 — UI Cold Boot | UI | ☐ PASS / ☐ FAIL | | ss-01-s6-\<date\>.png | |
| 9 — UI Greeting | UI | ☐ PASS / ☐ FAIL | | ss-02-s6-\<date\>.png | |
| 10 — UI Calendar | UI | ☐ PASS / ☐ FAIL | | ss-03-s6-\<date\>.png | |
| 11 — UI Fallback | UI | ☐ PASS / ☐ FAIL | | ss-04-s6-\<date\>.png | |
| 12 — UI Status Bar | UI | ☐ PASS / ☐ FAIL | | ss-05-s6-\<date\>.png | |
| 13 — UI Pane Clear | UI | ☐ PASS / ☐ FAIL | | — | |
| 14 — UI Reboot | UI | ☐ PASS / ☐ FAIL | | — | |
| 15 — Telegram pytest | Telegram | ☐ PASS / ☐ FAIL | | — | |
| 16 — Full Log Audit | Log | ☐ PASS / ☐ FAIL | | — | |

**Overall result:** ☐ PASS — proceed to S7 / ☐ FAIL — return to S6 tighten pass

**Open defects (FAIL items):**

| # | Step | Defect description | Severity | Fixed in |
|---|------|--------------------|----------|----------|
| | | | | |

---

## Appendix A — Known-Good Seed Responses (Demo Mode, locked at S6)

| Input pattern | Expected `action_taken` | Expected response snippet |
|---|---|---|
| `hello` / `hi` | `greeting` | "Hello! I'm your executive assistant" |
| `calendar` / `schedule` / `what's on` | `calendar_lookup` | seeded event list |
| `book` / `schedule a meeting` | `calendar_create` | "[Demo] … Shall I confirm? (yes/no)" |
| `status` / `health` / `ping` | `status_check` | "System status: OK · Demo mode: ON" |
| `[unrecognised]` | `fallback` | "I'm not sure how to help" |

---

## Appendix B — Screenshot File Index (S6)

| File | Step | Reference SS | Accept criteria doc |
|------|------|--------------|---------------------|
| `ss-01-s6-<date>.png` | 8 | SS-01 | `ui_acceptance.md` §2 |
| `ss-02-s6-<date>.png` | 9 | SS-02 | `ui_acceptance.md` §3 |
| `ss-03-s6-<date>.png` | 10 | SS-03 | `ui_acceptance.md` §4 |
| `ss-04-s6-<date>.png` | 11 | SS-04 | `ui_acceptance.md` §5 |
| `ss-05-s6-<date>.png` | 12 | SS-05 | `ui_acceptance.md` §6 |

Screenshots are gitignored. Save to `docs/screenshots/` and attach to checksum handoff.

---

## Appendix C — Defect Severity Guide

| Severity | Definition | S6 action |
|----------|------------|-----------|
| **P1 — Blocker** | Panel missing, page doesn't load, data not rendered | Must fix before PASS |
| **P2 — Major** | Wrong action tag, pane not scrolling, button non-functional | Must fix before PASS |
| **P3 — Minor** | Misaligned spacing, font size off, colour drift | Fix in tighten pass; document in `ui_patch_notes.md` |
| **P4 — Cosmetic** | Padding 2–4 px off, slightly inconsistent capitalisation | Log only; acceptable for rough pass |
