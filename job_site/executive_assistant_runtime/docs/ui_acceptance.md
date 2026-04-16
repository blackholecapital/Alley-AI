# UI Acceptance Checks — EXEC-AI-RAPID-002
**Owner:** Worker B, S6.1  
**Used by:** S6 tighten pass, S7 Voice/UI Checksum (Foreman B), Final Validation  
**Reference:** `docs/screenshot_protocol.md`, `tests/golden_path_test.md`

This document defines the specific pass/fail criteria for every visible UI element in the operator UI. It replaces eyeball guessing with a named checklist. Foreman B uses this document alongside actual screenshots to make a binary PASS / PATCH decision.

---

## 1. How to Use This Document

1. Boot the UI: `python -m executive_assistant_runtime.ui.app`
2. Complete golden path Steps 8–14 in `tests/golden_path_test.md`
3. Capture the 5 named screenshots (SS-01 through SS-05)
4. Work through each section below — one section per UI panel
5. Mark each check ☑ PASS or ☒ FAIL
6. Any P1 or P2 FAIL blocks the stage — do not mark PASS
7. Log all FAILs in `docs/ui_patch_notes.md` with severity and fix applied

---

## 2. Status Bar

**Element:** Fixed header bar at the top of the page  
**Reference screenshot:** SS-01 (cold boot), SS-05 (status bar detail)

### 2.1 Presence and Layout

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| SB-01 | Status bar is visible | Bar spans full width, fixed at top, not scrolled away | P1 |
| SB-02 | Bar does not overlap content | Transcript and response panes begin below the bar | P1 |
| SB-03 | All status items are on one line | No wrapping onto a second row at 1280×800 | P3 |
| SB-04 | Bar background is distinct from pane background | Visually separated (different shade or border) | P3 |

### 2.2 Demo Mode Badge

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| SB-05 | Badge is present | `DEMO MODE` text visible in status bar | P1 |
| SB-06 | Badge colour is amber/orange | Not green (green = live mode) | P2 |
| SB-07 | Badge text reads `DEMO MODE` | Exact string, not `demo`, `Demo Mode`, or similar | P3 |
| SB-08 | Badge is not present in live mode | When `DEMO_MODE=false`, badge absent or shows `LIVE` | P2 |

### 2.3 Service Status Fields

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| SB-09 | Core status field present | Label `Core:` and value visible | P2 |
| SB-10 | Core status value is `ok` after boot | Not `checking…`, not `err` | P2 |
| SB-11 | Voice status field present | Label `Voice:` and value visible | P2 |
| SB-12 | Voice status is `demo_passthrough` in demo mode | Exact string from `/api/status` | P2 |
| SB-13 | Status values update after 10 s | Poll fires; values refresh without page reload | P3 |

### 2.4 Session ID

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| SB-14 | Session ID prefix visible | `Session:` label + 8-char hex prefix + `…` | P2 |
| SB-15 | Session ID uses monospace font | Visually distinct from surrounding text | P4 |
| SB-16 | Session ID does not change on page interaction | Same value throughout a session | P2 |

### 2.5 Boot Time

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| SB-17 | Boot time is populated | Not blank, not `undefined` | P2 |
| SB-18 | Boot time format is ISO-like | Resembles `2026-04-16T10:23:45Z` | P3 |

---

## 3. Transcript Pane

**Element:** Left half of the main panel area  
**Reference screenshot:** SS-02 (after greeting), SS-03 (after calendar query)

### 3.1 Presence and Layout

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| TP-01 | Pane is visible | Left panel present, clearly bounded | P1 |
| TP-02 | Pane header is present | Contains label `Transcript` and a `Clear` button | P2 |
| TP-03 | Pane fills its column | No large gap between pane edge and viewport edge | P3 |
| TP-04 | Pane does not overlap response pane | Clean vertical split, no overlap | P1 |
| TP-05 | Pane has its own scrollbar | Content taller than pane scrolls independently | P2 |

### 3.2 Placeholder State (empty)

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| TP-06 | Placeholder text is visible when empty | Italic/muted placeholder message present | P3 |
| TP-07 | Placeholder disappears on first entry | First user input removes the placeholder | P2 |

### 3.3 Entry Display

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| TP-08 | User input appears as a new entry | Each submitted message creates a new block | P1 |
| TP-09 | Entry text matches submitted input exactly | No truncation, no alteration | P1 |
| TP-10 | Entry shows a timestamp | `HH:MM:SS` format visible below or within entry | P2 |
| TP-11 | Entry has distinct left-border accent | Blue/accent border on left side | P3 |
| TP-12 | Multiple entries stack vertically | Second entry appears below first, not replacing it | P1 |
| TP-13 | Pane auto-scrolls to latest entry | After each submission, newest entry is visible | P2 |

### 3.4 Clear Control

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| TP-14 | Clear button is clickable | Hover state changes; click responds | P2 |
| TP-15 | Clear removes all entries | Pane is empty immediately after click (no reload) | P2 |
| TP-16 | Clear does not affect response pane | Response pane unchanged after transcript clear | P1 |

---

## 4. Response Pane

**Element:** Right half of the main panel area  
**Reference screenshot:** SS-02 (greeting response), SS-04 (fallback response)

### 4.1 Presence and Layout

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| RP-01 | Pane is visible | Right panel present, clearly bounded | P1 |
| RP-02 | Pane header is present | Contains label `Assistant Response` and `Clear` button | P2 |
| RP-03 | Pane is equal width to transcript pane | 50/50 split at 1280 px | P3 |
| RP-04 | Pane has its own scrollbar | Independent scroll from transcript pane | P2 |

### 4.2 Entry Display

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| RP-05 | Assistant response appears in pane | Each reply creates a new block | P1 |
| RP-06 | Response text is readable | Not clipped, not overflowing out of pane | P1 |
| RP-07 | Response entry shows a timestamp | `HH:MM:SS` format visible | P2 |
| RP-08 | Response entry has distinct left-border accent | Green/different colour from transcript entries | P3 |
| RP-09 | Multiple responses stack vertically | Second response below first, not replacing it | P1 |
| RP-10 | Pane auto-scrolls to latest response | Newest response visible after each reply | P2 |

### 4.3 Action Tag Chip

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| RP-11 | Action tag chip is present | Small label chip visible within or below entry | P2 |
| RP-12 | Tag reads correct action label | `greeting`, `calendar_lookup`, `calendar_create`, or `fallback` | P2 |
| RP-13 | Tag is visually distinct | Different background/border from entry body text | P3 |
| RP-14 | Tag is not present on "in" entries | Only response (out) entries carry action tags | P2 |

### 4.4 Error State Display

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| RP-15 | No raw Python traceback visible | No `Traceback (most recent call last)` text in pane | P1 |
| RP-16 | No HTTP error strings visible | No `500 Internal Server Error`, `404 Not Found` in pane | P1 |
| RP-17 | Network error shows safe message | If API fails, response shows `⚠ Network error…` copy | P2 |

---

## 5. Input Bar

**Element:** Fixed footer bar at the bottom of the page  
**Reference screenshot:** SS-01 (cold boot layout)

### 5.1 Presence and Layout

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| IB-01 | Input bar is visible | Footer bar fixed at bottom, full width | P1 |
| IB-02 | Bar does not overlap pane content | Panes end above the bar | P1 |
| IB-03 | Three controls in one row | Talk button · Text input · Send button, left to right | P2 |

### 5.2 Text Input Field

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| IB-04 | Text input is present and focusable | Click lands cursor in field | P1 |
| IB-05 | Placeholder text is visible when empty | Muted hint text visible | P3 |
| IB-06 | Typed text appears in field | Characters appear as typed | P1 |
| IB-07 | Enter key submits message | Press Enter → message sent, field clears | P1 |
| IB-08 | Field clears after submission | Input is empty after message is sent | P2 |
| IB-09 | Field is disabled during request | Field non-interactive while thinking indicator is shown | P2 |
| IB-10 | Field re-enables after response | Focus returns to field after response arrives | P2 |
| IB-11 | Field focus style visible | Border colour change on focus | P3 |

### 5.3 Send Button

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| IB-12 | Send button is present | Labelled `Send`, right of text input | P1 |
| IB-13 | Send button click submits message | Same behaviour as Enter key | P1 |
| IB-14 | Send button has hover state | Background or border changes on hover | P3 |

### 5.4 Talk Button (Demo Mode)

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| IB-15 | Talk button is present | Labelled `Voice (demo off)` or similar | P2 |
| IB-16 | Talk button is visually disabled | Dimmed/greyed; cursor shows `not-allowed` | P2 |
| IB-17 | Talk button is `disabled` in HTML | `disabled` attribute set in markup | P2 |
| IB-18 | Click on disabled button does nothing | No action, no error | P2 |
| IB-19 | Button label describes demo state | Text communicates voice is off in demo mode | P3 |

### 5.5 Thinking Indicator

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| IB-20 | Thinking indicator appears after submit | Three dots + `Thinking…` text visible during request | P2 |
| IB-21 | Indicator disappears after response | Dots gone once response appears | P2 |
| IB-22 | Dots animate | Dots blink in sequence (not static) | P3 |

---

## 6. Overall Page Structure

| # | Check | Pass condition | Severity |
|---|-------|----------------|----------|
| PG-01 | No horizontal scrollbar | Page fits at 1280 px wide without horizontal overflow | P3 |
| PG-02 | No vertical scrollbar on body | Panes scroll internally; body itself does not scroll | P2 |
| PG-03 | All 4 zones visible without scrolling | Status bar, both panes, input bar all in viewport at 800 px height | P1 |
| PG-04 | Dark background throughout | No white/light flash on load | P3 |
| PG-05 | Page title correct | Browser tab shows `Executive Assistant — Operator UI` | P4 |
| PG-06 | Stylesheet loads without 404 | No `style.css` 404 in Network tab | P2 |
| PG-07 | JavaScript loads without error | No `app.js` 404 or console parse error | P2 |
| PG-08 | No `console.error` on normal operation | DevTools console is clean on greeting + calendar + fallback flows | P2 |

---

## 7. Defect Severity Reference

| Severity | Meaning | S6 disposition |
|----------|---------|----------------|
| **P1 — Blocker** | Functionality broken or panel entirely missing | Must fix before PASS; re-run full script after fix |
| **P2 — Major** | Feature present but behaving incorrectly or missing key attribute | Must fix before PASS; re-run affected steps after fix |
| **P3 — Minor** | Visual inconsistency; function correct | Document in `ui_patch_notes.md`; fix during tighten pass |
| **P4 — Cosmetic** | Trivial pixel/text variance | Log only; acceptable for S6 rough pass |

---

## 8. Tighten Pass — What to Fix First

When time is limited, fix in this order:

1. Any P1 (page load, missing panel, overlapping element)
2. Any P2 in the response pane (data rendering, action tag, error state)
3. Any P2 in the input bar (Enter key, field clear, disabled talk button)
4. Any P2 in the status bar (demo badge, core/voice values)
5. P3 items that are immediately visible in SS-01 cold boot

Do not spend tighten-pass time on P4 cosmetics. Document them and move on.

---

## 9. S6 Acceptance Gate Summary

For S6 PASS, all of the following must be true:

- [ ] Zero P1 failures across all sections
- [ ] Zero P2 failures across all sections
- [ ] All five screenshots (SS-01 through SS-05) captured and saved to `docs/screenshots/`
- [ ] All golden path Steps 8–14 marked PASS in the sign-off table
- [ ] All P3 and P4 defects logged in `docs/ui_patch_notes.md`
- [ ] `ui_patch_notes.md` exists (even if it notes zero defects)

If any condition is not met: PATCH — return to S6 tighten pass.
