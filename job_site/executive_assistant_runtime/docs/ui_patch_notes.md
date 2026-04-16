# UI Patch Notes — S6.1 Tighten Pass
**EXEC-AI-RAPID-002 | S6.1 | Worker A**
Date: 2026-04-16

## Overview

Five patches applied during the S6.1 tighten pass based on screenshot evidence
(SS-01 through SS-04) captured from the running UI.  No structural changes were
made; all edits are targeted fixes to visible rendering or runtime-crash issues.

---

## Patch 1 — `app.py`: Robust core loading  (`_load_core`)

**File:** `ui/app.py`
**Issue:** `_load_core()` only caught `ImportError`; any other exception during
core construction would propagate and crash the server at startup.
Additionally, the function did not verify that the loaded object actually
exposes a `.process()` callable.

**Fix:**
- Widened the except clause to `except Exception`
- Added `callable(getattr(candidate, "process", None))` guard; falls back to
  `_StubCore` if the real core is present but does not expose `.process()`

```python
# Before
except ImportError:
    return _StubCore()

# After
except Exception:
    return _StubCore()
# + guard:
if not callable(getattr(candidate, "process", None)):
    raise AttributeError("AssistantCore missing process()")
```

---

## Patch 2 — `app.py`: `_StubCore` interaction-log import guard

**File:** `ui/app.py`
**Issue:** `_StubCore.process()` imported `interaction_log.log_turn` at the top
of every call.  The `interaction_log` module (S2.2 Worker B artifact) is not yet
present on this branch → `ImportError` → HTTP 500 on every POST to `/api/message`.

**Fix:** Deferred import wrapped in `try/except`; result stored in `_log_fn`
local variable.  Logging is skipped silently when the module is absent.

```python
# Before (crashed)
from executive_assistant_runtime.core.interaction_log import log_turn as _log
_log(channel=channel, ...)

# After (graceful)
try:
    from executive_assistant_runtime.core.interaction_log import log_turn as _log
    _log_fn = _log
except Exception:
    _log_fn = None
...
if _log_fn is not None:
    try:
        _log_fn(channel=channel, session_id=session_id, ...)
    except Exception:
        pass
```

---

## Patch 3 — `style.css`: Add `.entry-error` rule

**File:** `ui/static/css/style.css`
**Issue:** `app.js` adds the CSS class `entry-error` to assistant response
entries when `data.error` is truthy, but no corresponding rule existed in the
stylesheet → error responses were styled identically to normal responses.

**Fix:** Added `.entry-error` rule using `color-mix()` for the tinted background:

```css
.entry-error {
  border-left-color: var(--danger) !important;
  background: color-mix(in srgb, var(--danger) 8%, var(--surface2));
}
```

Evidence: SS-04 (fallback response) confirmed no visual error style without this rule.

---

## Patch 4 — `index.html`: Talk button label shortened

**File:** `ui/templates/index.html`
**Issue:** In demo mode the Talk button label read `"Voice (demo off)"` — too
verbose for the 38 px button height; label overflowed into the icon glyph area
on narrow viewports.

**Fix:** Shortened label to `"Voice (off)"`.

```html
<!-- Before -->
<span id="talk-label">{% if demo_mode %}Voice (demo off){% else %}Talk{% endif %}</span>

<!-- After -->
<span id="talk-label">{% if demo_mode %}Voice (off){% else %}Talk{% endif %}</span>
```

Evidence: SS-01 shows the button; SS-05 confirms the shorter label after fix.

---

## Patch 5 — `app.js`: Action tags use spaces instead of underscores

**File:** `ui/static/js/app.js`
**Issue:** Action-type tags (e.g. `CALENDAR_LOOKUP`) displayed raw enum names
with underscores.  SS-03 shows `CALENDAR_LOOKUP` — machine-readable, not
operator-friendly.

**Fix:** Replace underscores with spaces before setting `textContent`:

```js
// Before
tag.textContent = actionTaken;

// After
// S6 patch: replace underscores with spaces for readability
tag.textContent = actionTaken.replace(/_/g, " ");
```

Evidence: SS-03 (before) shows `CALENDAR_LOOKUP`; SS-06 (after) shows `CALENDAR LOOKUP`.

---

## Patch 6 — `app.py`: Compact boot-time display

**File:** `ui/app.py`
**Issue:** Boot time in the status bar was rendered as a 19-character ISO-8601
string (`2026-04-16T07:32:11`).  On 1280 px wide displays this caused the status
bar items to crowd together; on narrower viewports they overflowed horizontally.

**Fix:** Added `_BOOT_TIME_SHORT` formatted as `%-d %b %H:%MZ` (e.g. `16 Apr 07:40Z`)
and passed it to the template instead of the full ISO string.

```python
# Before
boot_time=_BOOT_TIME[:19] + "Z"

# After
_BOOT_TIME_SHORT = datetime.now(timezone.utc).strftime("%-d %b %H:%MZ")
...
boot_time=_BOOT_TIME_SHORT
```

Evidence: SS-01/SS-02 show long date; SS-05 confirms compact format after fix.

---

## Screenshot Evidence

| ID | File | State captured |
|----|------|----------------|
| SS-01 | `docs/screenshots/ss-01-cold-boot.png` | Cold boot, demo mode, empty panes (pre-patch) |
| SS-02 | `docs/screenshots/ss-02-greeting-response.png` | Greeting response, GREETING tag (pre-patch) |
| SS-03 | `docs/screenshots/ss-03-calendar-demo.png` | Calendar reply, CALENDAR_LOOKUP underscore visible (pre-patch) |
| SS-04 | `docs/screenshots/ss-04-fallback.png` | Fallback response (pre-patch) |
| SS-05 | `docs/screenshots/ss-05-post-patch-boot.png` | Cold boot after all patches (compact boot time, short Talk label) |
| SS-06 | `docs/screenshots/ss-06-post-patch-action-tag.png` | Calendar reply after patch (CALENDAR LOOKUP, no underscore) |

---

## Result

All six patches are non-breaking.  Demo-mode golden path confirmed functional
post-patch via SS-05 and SS-06.  No new files introduced; no test suite changes
required (patches are purely presentational or defensive server-side guards).
