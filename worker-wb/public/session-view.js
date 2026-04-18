/**
 * session-view.js — Operator shell session renderer.
 * Ref: build-sheet-EXEC-AI-STAGE3-004 S5 (Worker B).
 *
 * S5 additions: calendar status polling, voice kind badges,
 * calendar action result bar (#calendar-action-bar).
 *
 * DOM hooks used:
 *   #transcript-log         — inbound event list
 *   #response-log           — outbound event list
 *   #status-core            — live/loading/error pill text
 *   #status-session         — session id (short)
 *   #last-event-marker      — "last event Xs ago" badge
 *   #status-state           — current UIRenderState.kind text
 *   #status-calendar        — calendar provider readiness (S5)
 *   #calendar-action-bar    — strip shown when last invocation present (S5)
 *   #calendar-action-result — last action result text (S5)
 */

'use strict';

// Worker-aligned routes. The UI must NOT call /api/* — those paths do not
// exist on the Cloudflare Worker. Inbound events are read from
// /session/latest and outbound messages post to /telegram/webhook. Both
// routes live on the same worker origin and return {"ok": true} on success
// for the POST path.
const ENDPOINT = '/session/latest';
const CALENDAR_ENDPOINT = '/calendar/status';
const SEND_ENDPOINT = '/telegram/webhook';
const POLL_MS = 5000;

const DOM = {
  transcript: () => document.getElementById('transcript-log'),
  response: () => document.getElementById('response-log'),
  core: () => document.getElementById('status-core'),
  session: () => document.getElementById('status-session'),
  marker: () => document.getElementById('last-event-marker'),
  state: () => document.getElementById('status-state'),
  // S5: calendar surface
  calendarStatus: () => document.getElementById('status-calendar'),
  calendarBar: () => document.getElementById('calendar-action-bar'),
  calendarResult: () => document.getElementById('calendar-action-result'),
};

let pollTimer = null;
let markerTimer = null;
let lastRenderedEventId = null;
let currentLastEventAt = null;

function setText(el, value) {
  if (el) el.textContent = value;
}

function setState(kind) {
  setText(DOM.state(), kind);
  const core = DOM.core();
  if (core) {
    core.textContent =
      kind === 'live' ? 'live' :
      kind === 'empty' ? 'idle' :
      kind === 'loading' ? 'loading…' :
      'error';
    core.dataset.state = kind;
  }
}

function clearPane(pane) {
  if (!pane) return;
  pane.innerHTML = '';
}

function makeEntry(evt) {
  const wrap = document.createElement('div');
  wrap.className = `entry entry-${evt.direction}`;
  wrap.dataset.eventId = evt.id;

  // S5: voice / non-text kind badge
  if (evt.kind && evt.kind !== 'text') {
    const badge = document.createElement('div');
    badge.className = 'entry-kind-badge';
    badge.textContent = evt.kind === 'voice' ? '\uD83C\uDF99 voice' : `\u2022 ${evt.kind}`;
    wrap.appendChild(badge);
  }

  const body = document.createElement('div');
  body.className = 'entry-body';
  body.textContent = evt.text
    ?? (evt.kind === 'voice' ? '[voice note \u2014 transcription pending]' : `[${evt.kind}]`);
  wrap.appendChild(body);

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  const who = evt.username ? `@${evt.username}` : evt.source;
  const when = formatTime(evt.received_at ?? evt.at);
  meta.textContent = `${who} · ${when}`;
  wrap.appendChild(meta);

  return wrap;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatAgo(iso) {
  if (!iso) return 'no events yet';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `last event ${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `last event ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `last event ${hrs}h ago`;
}

function renderMarker() {
  setText(DOM.marker(), formatAgo(currentLastEventAt));
}

// ── Render states ──────────────────────────────────────────────────

function renderLoading() {
  setState('loading');
  const t = DOM.transcript();
  const r = DOM.response();
  if (t && t.children.length === 0) {
    const p = document.createElement('p');
    p.className = 'pane-placeholder';
    p.textContent = 'loading…';
    t.appendChild(p);
  }
  if (r && r.children.length === 0) {
    const p = document.createElement('p');
    p.className = 'pane-placeholder';
    p.textContent = 'loading…';
    r.appendChild(p);
  }
  setText(DOM.marker(), 'loading');
}

function renderEmpty(sessionId) {
  setState('empty');
  clearPane(DOM.transcript());
  clearPane(DOM.response());
  const t = DOM.transcript();
  if (t) {
    const p = document.createElement('p');
    p.className = 'pane-placeholder';
    p.textContent = 'no inbound messages yet';
    t.appendChild(p);
  }
  const r = DOM.response();
  if (r) {
    const p = document.createElement('p');
    p.className = 'pane-placeholder';
    p.textContent = 'no assistant replies yet';
    r.appendChild(p);
  }
  setText(DOM.session(), sessionId ? String(sessionId).slice(0, 16) : '—');
  currentLastEventAt = null;
  renderMarker();
}

function renderLive(data) {
  setState('live');

  const inbound = [];
  const outbound = [];
  for (const e of data.events ?? []) {
    if (e.direction === 'outbound') outbound.push(e);
    else inbound.push(e);
  }

  // Rerender only if the newest event id changed. Keeps the DOM quiet
  // on steady-state polls and preserves scroll position otherwise.
  const newestId = (data.events && data.events.length > 0)
    ? data.events[data.events.length - 1].id
    : null;

  if (newestId !== lastRenderedEventId) {
    const tpane = DOM.transcript();
    const rpane = DOM.response();
    clearPane(tpane);
    clearPane(rpane);
    if (tpane) {
      if (inbound.length === 0) {
        const p = document.createElement('p');
        p.className = 'pane-placeholder';
        p.textContent = 'no inbound messages yet';
        tpane.appendChild(p);
      } else {
        for (const e of inbound) tpane.appendChild(makeEntry(e));
        tpane.scrollTop = tpane.scrollHeight;
      }
    }
    if (rpane) {
      if (outbound.length === 0) {
        const p = document.createElement('p');
        p.className = 'pane-placeholder';
        p.textContent = 'no assistant replies yet';
        rpane.appendChild(p);
      } else {
        for (const e of outbound) rpane.appendChild(makeEntry(e));
        rpane.scrollTop = rpane.scrollHeight;
      }
    }
    lastRenderedEventId = newestId;
  }

  setText(DOM.session(), data.session_id ? String(data.session_id).slice(0, 16) : '—');
  currentLastEventAt = data.last_event_at ?? null;
  renderMarker();
}

function renderError(message) {
  setState('error');
  setText(DOM.marker(), `error: ${message}`);
}

// ── Fetch / poll loop ──────────────────────────────────────────────

async function fetchOnce() {
  try {
    const res = await fetch(ENDPOINT, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      renderError(`http ${res.status}`);
      return;
    }
    const data = await res.json();
    // Support both legacy {events:[]} and current {items:[]} shape.
    const evts = Array.isArray(data.events)
      ? data.events
      : Array.isArray(data.items) ? data.items.slice().reverse() : null;
    if (!evts) {
      renderError('malformed response');
      return;
    }
    const sessionId = data.session_id ?? (data.session && data.session.session_id) ?? null;
    const lastAt = data.last_event_at ?? (data.session && data.session.last_event_at) ?? null;
    if (evts.length === 0) {
      renderEmpty(sessionId);
      return;
    }
    renderLive({ ...data, events: evts, session_id: sessionId, last_event_at: lastAt });
  } catch (err) {
    renderError(err && err.message ? err.message : 'network');
  }
}

// S5: poll /calendar/status and render calendar action bar.
function renderCalendar(data) {
  const statusEl = DOM.calendarStatus();
  const barEl = DOM.calendarBar();
  const resultEl = DOM.calendarResult();

  if (!data || !data.provider) {
    setText(statusEl, '—');
    if (barEl) barEl.classList.add('hidden');
    return;
  }

  const providerReady = data.provider && data.provider.ready;
  const providerName = (data.provider && data.provider.provider) || '—';
  setText(statusEl, providerReady ? `${providerName} ready` : `${providerName} not ready`);
  if (statusEl) statusEl.dataset.state = providerReady ? 'live' : 'error';

  const inv = data.invocation;
  if (!inv) {
    if (barEl) barEl.classList.add('hidden');
    return;
  }

  if (barEl) barEl.classList.remove('hidden');
  if (!resultEl) return;

  if (inv.ok) {
    const count = inv.payload && inv.payload.event_count != null
      ? ` · ${inv.payload.event_count} event${inv.payload.event_count === 1 ? '' : 's'}`
      : '';
    resultEl.textContent = `\u2713 calendar.list_today ok${count} · ${formatTime(inv.handled_at)}`;
    resultEl.dataset.state = 'ok';
  } else {
    const code = (inv.error && inv.error.code) || 'error';
    resultEl.textContent = `\u2717 calendar.list_today failed (${code}) · ${formatTime(inv.handled_at)}`;
    resultEl.dataset.state = 'fail';
  }
}

async function fetchCalendar() {
  try {
    const res = await fetch(CALENDAR_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) {
      setText(DOM.calendarStatus(), '—');
      return;
    }
    const data = await res.json();
    renderCalendar(data);
  } catch (_) {
    setText(DOM.calendarStatus(), '—');
  }
}

function startPolling() {
  renderLoading();
  void fetchOnce();
  void fetchCalendar();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => { void fetchOnce(); void fetchCalendar(); }, POLL_MS);
  if (markerTimer) clearInterval(markerTimer);
  markerTimer = setInterval(renderMarker, 1000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  if (markerTimer) clearInterval(markerTimer);
  pollTimer = null;
  markerTimer = null;
}

// ── Outbound send ──────────────────────────────────────────────────
// Posts to the Worker's /telegram/webhook route (the same route that
// Telegram itself calls). The worker always returns {"ok": true} on
// accepted posts — anything else is treated as a send failure.

async function sendMessage(payload) {
  const res = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const data = await res.json().catch(() => null);
  if (!data || data.ok !== true) {
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

// Auto-start when loaded in a browser context.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPolling);
  } else {
    startPolling();
  }
}

// Test hooks — exported for unit harnesses; no runtime consumers.
export {
  ENDPOINT,
  CALENDAR_ENDPOINT,
  SEND_ENDPOINT,
  POLL_MS,
  fetchOnce,
  fetchCalendar,
  sendMessage,
  startPolling,
  stopPolling,
  renderLoading,
  renderEmpty,
  renderLive,
  renderCalendar,
  renderError,
  formatAgo,
  formatTime,
};
