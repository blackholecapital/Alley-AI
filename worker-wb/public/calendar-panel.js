/**
 * calendar-panel.js — Calendar settings surface for the operator shell.
 *
 * Ref: build-sheet-EXEC-AI-STAGE4-001 S4 (Worker A).
 *      /job_site/calendar_ui_contract.txt
 *
 * Scope lock: exactly ONE action trigger path (calendar.list_today) and
 * two readable states (configured / unconfigured). No CRUD, no provider
 * switching, no secret editing — operator-facing read-only surface that
 * can dispatch the single registered action through /calendar/status?run=1.
 *
 * Worker surface consumed:
 *   GET /calendar/status        — provider readiness, no side effects
 *   GET /calendar/status?run=1  — dispatch calendar.list_today, return result
 *
 * DOM hooks used (declared in ./index.html):
 *   #calendar-panel-toggle       — status-bar button that opens/closes drawer
 *   #calendar-panel              — aside drawer container (aria-hidden toggles)
 *   #calendar-panel-close        — X button inside drawer
 *   #calendar-panel-state        — configured / unconfigured pill
 *   #calendar-panel-provider     — provider name
 *   #calendar-panel-reason       — not-ready reason (hidden when ready)
 *   #calendar-panel-detail       — not-ready detail text (hidden when ready)
 *   #calendar-panel-guidance     — demo-mode guidance block (hidden when ready)
 *   #calendar-panel-action-type  — action type label (calendar.list_today)
 *   #calendar-panel-run          — trigger button
 *   #calendar-panel-result       — result surface container
 *   #calendar-panel-result-state — ok / fail pill
 *   #calendar-panel-result-reply — reply_text body
 *   #calendar-panel-result-meta  — event count / handled_at meta line
 *   #calendar-panel-error        — network/route error line (hidden when clean)
 */

'use strict';

const CALENDAR_STATUS_ENDPOINT = '/calendar/status';
const CALENDAR_RUN_ENDPOINT = '/calendar/status?run=1';

// Closed state enum — pinned by /job_site/calendar_ui_contract.txt.
// Exactly these six values are legal; the UI must branch on the value,
// not on free-text provider reasons.
export const CALENDAR_UI_STATES = Object.freeze({
  UNKNOWN: 'unknown',            // not fetched yet
  CONFIGURED_READY: 'ready',     // provider.ready === true
  CONFIGURED_NOT_READY: 'not_ready', // provider.ready === false and reason is not "provider_not_configured"
  UNCONFIGURED: 'unconfigured',  // CALENDAR_PROVIDER unset / "none" / ""
  UNSUPPORTED: 'unsupported',    // CALENDAR_PROVIDER set to an unknown value
  ERROR: 'error',                // route unreachable / non-200 / malformed
});

// Human-readable guidance strings. Kept next to the state enum so the
// copy stays in one place; the contract doc fixes the wording.
const GUIDANCE = Object.freeze({
  [CALENDAR_UI_STATES.UNCONFIGURED]:
    'No calendar provider is wired. For the demo set the CALENDAR_PROVIDER ' +
    'secret to "demo" with: wrangler secret put CALENDAR_PROVIDER.',
  [CALENDAR_UI_STATES.UNSUPPORTED]:
    'CALENDAR_PROVIDER is set to a name the worker does not recognise. ' +
    'Set it to "demo" for the Stage 4 demo or leave it empty to disable.',
  [CALENDAR_UI_STATES.CONFIGURED_NOT_READY]:
    'Calendar provider is named but not ready. Check provider credentials ' +
    'and try again — the single action is safe to re-run.',
  [CALENDAR_UI_STATES.ERROR]:
    'Could not reach /calendar/status. Verify the worker is deployed and ' +
    'that Cloudflare Access does not gate this public route.',
  [CALENDAR_UI_STATES.CONFIGURED_READY]: '',
  [CALENDAR_UI_STATES.UNKNOWN]: '',
});

const STATE_LABELS = Object.freeze({
  [CALENDAR_UI_STATES.UNKNOWN]: '—',
  [CALENDAR_UI_STATES.CONFIGURED_READY]: 'configured · ready',
  [CALENDAR_UI_STATES.CONFIGURED_NOT_READY]: 'configured · not ready',
  [CALENDAR_UI_STATES.UNCONFIGURED]: 'unconfigured',
  [CALENDAR_UI_STATES.UNSUPPORTED]: 'unsupported provider',
  [CALENDAR_UI_STATES.ERROR]: 'unreachable',
});

// Classify a /calendar/status payload into one of the closed UI states.
// The provider-facing reason enum is translated here so the DOM only
// reads CALENDAR_UI_STATES values.
export function classifyStatus(data) {
  if (!data || !data.provider) return CALENDAR_UI_STATES.ERROR;
  const p = data.provider;
  if (p.ready === true) return CALENDAR_UI_STATES.CONFIGURED_READY;
  const reason = p.reason;
  if (reason === 'provider_not_configured') return CALENDAR_UI_STATES.UNCONFIGURED;
  if (reason === 'provider_unsupported') return CALENDAR_UI_STATES.UNSUPPORTED;
  return CALENDAR_UI_STATES.CONFIGURED_NOT_READY;
}

function $(id) {
  return typeof document === 'undefined' ? null : document.getElementById(id);
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle('hidden', Boolean(hidden));
}

// ── Drawer open / close ───────────────────────────────────────────────

function openPanel() {
  const panel = $('calendar-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  const toggle = $('calendar-panel-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
  // Opportunistic refresh on open so the operator never sees stale data.
  void refreshStatus();
}

function closePanel() {
  const panel = $('calendar-panel');
  if (!panel) return;
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
  const toggle = $('calendar-panel-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function togglePanel() {
  const panel = $('calendar-panel');
  if (!panel) return;
  if (panel.classList.contains('hidden')) openPanel();
  else closePanel();
}

// ── Render ────────────────────────────────────────────────────────────

export function renderPanelState(data, uiState) {
  const state = uiState ?? classifyStatus(data);

  const stateEl = $('calendar-panel-state');
  const providerEl = $('calendar-panel-provider');
  const reasonEl = $('calendar-panel-reason');
  const detailEl = $('calendar-panel-detail');
  const guidanceEl = $('calendar-panel-guidance');
  const actionTypeEl = $('calendar-panel-action-type');
  const runBtn = $('calendar-panel-run');
  const errorEl = $('calendar-panel-error');

  if (stateEl) {
    stateEl.textContent = STATE_LABELS[state];
    stateEl.dataset.state = state;
  }

  const providerName =
    (data && data.provider && data.provider.provider) ||
    (state === CALENDAR_UI_STATES.ERROR ? '—' : '—');
  setText(providerEl, providerName);

  const reason = data && data.provider && data.provider.reason;
  const detail = data && data.provider && data.provider.detail;
  setText(reasonEl, reason || '');
  setText(detailEl, detail || '');
  setHidden(reasonEl, !reason);
  setHidden(detailEl, !detail);

  const guidance = GUIDANCE[state] || '';
  setText(guidanceEl, guidance);
  setHidden(guidanceEl, !guidance);

  const actionType =
    (data && data.action && data.action.action_type) || 'calendar.list_today';
  setText(actionTypeEl, actionType);

  // The single action is always runnable — failure is rendered in-line so
  // operators can prove both the configured and unconfigured paths without
  // leaving the UI.
  if (runBtn) {
    runBtn.disabled = state === CALENDAR_UI_STATES.UNKNOWN;
  }

  if (state === CALENDAR_UI_STATES.ERROR) {
    setText(errorEl, GUIDANCE[CALENDAR_UI_STATES.ERROR]);
    setHidden(errorEl, false);
  } else {
    setText(errorEl, '');
    setHidden(errorEl, true);
  }
}

export function renderPanelInvocation(invocation) {
  const resultEl = $('calendar-panel-result');
  const stateEl = $('calendar-panel-result-state');
  const replyEl = $('calendar-panel-result-reply');
  const metaEl = $('calendar-panel-result-meta');

  if (!invocation) {
    setHidden(resultEl, true);
    return;
  }

  setHidden(resultEl, false);

  const ok = invocation.ok === true;
  if (stateEl) {
    stateEl.textContent = ok ? 'ok' : 'fail';
    stateEl.dataset.state = ok ? 'ok' : 'fail';
  }

  setText(replyEl, invocation.reply_text || '[no reply_text]');

  const parts = [];
  if (invocation.handled_at) parts.push(`handled_at ${invocation.handled_at}`);
  const count = invocation.payload && invocation.payload.event_count;
  if (typeof count === 'number') {
    parts.push(`${count} event${count === 1 ? '' : 's'}`);
  }
  if (!ok && invocation.error && invocation.error.code) {
    parts.push(`error.code ${invocation.error.code}`);
  }
  setText(metaEl, parts.join(' · '));
}

// ── Fetch + trigger ───────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = new Error(`http ${res.status}`);
    err.code = `http_${res.status}`;
    throw err;
  }
  return res.json();
}

export async function refreshStatus() {
  try {
    const data = await fetchJson(CALENDAR_STATUS_ENDPOINT);
    renderPanelState(data);
    if (data && data.last_result) renderPanelInvocation(data.last_result);
    return { ok: true, data };
  } catch (err) {
    renderPanelState(null, CALENDAR_UI_STATES.ERROR);
    return { ok: false, error: err };
  }
}

export async function triggerAction() {
  const runBtn = $('calendar-panel-run');
  const errorEl = $('calendar-panel-error');
  if (runBtn) runBtn.disabled = true;
  try {
    const data = await fetchJson(CALENDAR_RUN_ENDPOINT);
    renderPanelState(data);
    renderPanelInvocation(data && data.invocation);
    return { ok: true, data };
  } catch (err) {
    setText(errorEl, `Run failed: ${(err && err.message) || 'network'}`);
    setHidden(errorEl, false);
    renderPanelState(null, CALENDAR_UI_STATES.ERROR);
    return { ok: false, error: err };
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

// ── Wire-up ───────────────────────────────────────────────────────────

function wire() {
  const toggle = $('calendar-panel-toggle');
  const closeBtn = $('calendar-panel-close');
  const runBtn = $('calendar-panel-run');

  if (toggle) toggle.addEventListener('click', togglePanel);
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  if (runBtn) runBtn.addEventListener('click', () => { void triggerAction(); });

  // Seed initial state without opening the drawer — the status-bar value
  // stays in sync with session-view.js which also polls /calendar/status.
  void refreshStatus();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
}

// Test hooks — exported for unit harnesses; no runtime consumers.
export {
  CALENDAR_STATUS_ENDPOINT,
  CALENDAR_RUN_ENDPOINT,
  openPanel,
  closePanel,
  togglePanel,
};
