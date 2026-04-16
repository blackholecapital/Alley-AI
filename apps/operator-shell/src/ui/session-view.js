/**
 * session-view.js — Operator shell session renderer.
 * Ref: build-sheet-EXEC-AI-STAGE2-003 S3 (Worker B).
 *
 * Responsibilities (per build-sheet task):
 *   - fetch /session/latest and render inbound (transcript) + outbound
 *     (assistant) events into the existing shell
 *   - reflect live / loading / empty / error states explicitly
 *   - render a visible last-event marker
 *   - never redesign the shell (DOM hooks are reused unchanged)
 *
 * Plain browser ESM — no build step, no dependency.
 * Contract consumed: see ./session.contract.ts.
 *
 * DOM hooks used (present in index.html and in worker-wb/public/index.html):
 *   #transcript-log       — inbound event list
 *   #response-log         — outbound event list
 *   #status-core          — live/loading/error pill text
 *   #status-session       — session id (short)
 *   #last-event-marker    — "last event Xs ago" badge
 *   #status-state         — current UIRenderState.kind text
 */

'use strict';

// Worker-aligned routes. The UI must NOT call /api/* — those paths do not
// exist on the Cloudflare Worker. Inbound events are read from
// /session/latest and outbound messages post to /telegram/webhook. Both
// routes live on the same worker origin and return {"ok": true} on success
// for the POST path.
const ENDPOINT = '/session/latest';
const SEND_ENDPOINT = '/telegram/webhook';
const POLL_MS = 5000;

const DOM = {
  transcript: () => document.getElementById('transcript-log'),
  response: () => document.getElementById('response-log'),
  core: () => document.getElementById('status-core'),
  session: () => document.getElementById('status-session'),
  marker: () => document.getElementById('last-event-marker'),
  state: () => document.getElementById('status-state'),
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

  const body = document.createElement('div');
  body.className = 'entry-body';
  body.textContent = evt.text ?? `[${evt.kind}]`;
  wrap.appendChild(body);

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  const who = evt.username ? `@${evt.username}` : evt.source;
  const when = formatTime(evt.received_at);
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
    if (!data || !Array.isArray(data.events)) {
      renderError('malformed response');
      return;
    }
    if (data.events.length === 0) {
      renderEmpty(data.session_id ?? null);
      return;
    }
    renderLive(data);
  } catch (err) {
    renderError(err && err.message ? err.message : 'network');
  }
}

function startPolling() {
  renderLoading();
  void fetchOnce();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchOnce, POLL_MS);
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
  SEND_ENDPOINT,
  POLL_MS,
  fetchOnce,
  sendMessage,
  startPolling,
  stopPolling,
  renderLoading,
  renderEmpty,
  renderLive,
  renderError,
  formatAgo,
  formatTime,
};
