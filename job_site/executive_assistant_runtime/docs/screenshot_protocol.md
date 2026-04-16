# Screenshot Protocol — EXEC-AI-RAPID-002
**Owner:** Worker B, S5.1  
**Used by:** S6 (UI Tighten Pass), S7 (Voice/UI Checksum), Final Validation

Screenshots are the only accepted evidence for UI checksum stages. Written descriptions do not substitute. Take screenshots before reporting any UI stage PASS.

---

## 1. When to Take Screenshots

| Trigger | Required? | Stage |
|---------|-----------|-------|
| First boot of the UI (`make run` or `python app.py`) | YES | S5 |
| After sending the first message (greeting flow) | YES | S5 |
| After receiving first assistant response | YES | S5 |
| After triggering calendar action (demo mode response) | YES | S5 |
| After any UI patch applied in tighten pass | YES | S6 |
| Before marking S6 PASS | YES | S6 |
| At S7 checksum handoff | YES | S7 |

---

## 2. What to Capture in Each Screenshot

### SS-01 — Cold Boot
**URL:** `http://127.0.0.1:5050/`  
**Capture:** Full browser window (not just the content area)  
**Must show:**
- Status bar at the top with `DEMO MODE` badge visible
- Empty transcript pane (left) with placeholder text
- Empty response pane (right) with placeholder text
- Input bar at the bottom with Talk button, text input, and Send button
- Boot time in status bar is populated

**Name:** `ss-01-cold-boot.png`

---

### SS-02 — After Sending Greeting
**Action:** Type `hello` in the text input and press Enter  
**Capture:** Full browser window immediately after response appears  
**Must show:**
- Transcript pane shows the user's input `hello` with timestamp
- Response pane shows assistant greeting with timestamp and action tag `greeting`
- Thinking indicator is NOT visible (request is complete)
- Status bar still shows `DEMO MODE`

**Name:** `ss-02-greeting-response.png`

---

### SS-03 — Calendar Query (Demo Mode)
**Action:** Type `What is on my calendar today?` and press Enter  
**Capture:** Full browser window after response appears  
**Must show:**
- Transcript pane adds the calendar query entry
- Response pane adds calendar demo response (seeded event list)
- Action tag shows `calendar_lookup`
- No live API error visible

**Name:** `ss-03-calendar-demo.png`

---

### SS-04 — Fallback Response
**Action:** Type `xyzzy nonsense input` and press Enter  
**Capture:** Full browser window after response appears  
**Must show:**
- Response pane shows the fallback copy text
- Action tag shows `fallback`
- No raw exception or stack trace visible anywhere

**Name:** `ss-04-fallback.png`

---

### SS-05 — System Status Bar (Hover/Inspect)
**Action:** No new input — capture the current state of the status bar  
**Must show:**
- Core status value (ok / err)
- Voice status value (demo_passthrough in demo mode)
- Session ID prefix (first 8 chars)

**Name:** `ss-05-status-bar.png`

---

## 3. How to Capture

### Option A — Browser built-in (fastest)

| Browser | Shortcut |
|---------|----------|
| Chrome / Edge | `Ctrl+Shift+P` → type "screenshot" → "Capture full size screenshot" |
| Firefox | `Ctrl+Shift+S` → "Save full page" |
| Safari | `Cmd+Shift+4` then draw selection over the browser window |

### Option B — OS screenshot

| OS | Shortcut |
|----|----------|
| macOS | `Cmd+Shift+4` then Space to capture whole window, or `Cmd+Shift+3` for full screen |
| Windows 11 | `Win+Shift+S` to open Snipping Tool; draw region over the browser window |
| Linux (GNOME) | `PrtSc` for full screen; `Alt+PrtSc` for active window |

### Option C — Playwright / headless capture (automated)

```bash
# Install once
pip install playwright
playwright install chromium

# Capture script (from project root)
python - <<'EOF'
import asyncio
from playwright.async_api import async_playwright

async def capture():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto("http://127.0.0.1:5050/")
        await page.screenshot(path="ss-01-cold-boot.png", full_page=False)
        print("Saved ss-01-cold-boot.png")
        await browser.close()

asyncio.run(capture())
EOF
```

---

## 4. Where to Save Screenshots

```
/job_site/executive_assistant_runtime/docs/screenshots/
  ss-01-cold-boot.png
  ss-02-greeting-response.png
  ss-03-calendar-demo.png
  ss-04-fallback.png
  ss-05-status-bar.png
  ss-06-tighten-<date>.png     ← S6 patch pass adds these
```

Create the directory if it doesn't exist:
```bash
mkdir -p /job_site/executive_assistant_runtime/docs/screenshots
```

Screenshots are gitignored by default (binary, large). Attach them to the checksum handoff message or upload to the shared operator folder.

---

## 5. What Makes a Screenshot Acceptable for Checksum

Foreman B will inspect screenshots against this checklist:

| Check | Pass condition |
|-------|----------------|
| Full window visible | Browser chrome (address bar, tabs) present in frame |
| All 4 UI panels visible | Status bar, transcript pane, response pane, input bar all in frame |
| `DEMO MODE` badge visible | Orange/amber badge present in status bar |
| No blank pane | At least one entry in transcript AND response pane |
| No raw error text | No Python traceback, no `500 Internal Server Error` visible |
| Timestamp visible | At least one entry shows a timestamp |
| Action tag visible | At least one response entry shows an action tag label |

If any check fails: screenshot is rejected → PATCH → return to S5/S6 tighten pass.

---

## 6. S6 Tighten Pass — Additional Steps

After the S6 UI patch is applied, take one additional screenshot for each visible defect that was fixed. Name them `ss-06-tighten-<issue>.png` (e.g. `ss-06-tighten-button-alignment.png`).

Attach a one-line note per screenshot describing what changed. These notes go into `docs/ui_patch_notes.md`.

---

## 7. Screenshot Diff Guidance (S6)

When comparing before/after:

1. Open both screenshots side-by-side
2. Check: button placement, font size, panel proportions, badge colour, spacing around input bar
3. Mark each visible change as FIXED or STILL OPEN
4. Only FIXED items count toward S6 PASS

Do not use pixel-diff tools at this stage — eyeball review is sufficient for the rough-plus-tighten pass.
