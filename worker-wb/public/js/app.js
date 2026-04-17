/**
 * app.js — Operator UI client, aligned to worker-wb routes.
 * S5: calendar status polling, voice event badges, action state display.
 *
 * Routes consumed: /health, /session/latest, /calendar/status, /ui/send.
 * Ref: build-sheet-EXEC-AI-STAGE3-004 S5 (Worker B).
 */

"use strict";

const HEALTH_ENDPOINT = "/health";
const SESSION_ENDPOINT = "/session/latest";
const CALENDAR_ENDPOINT = "/calendar/status";
const SEND_ENDPOINT = "/ui/send";
const POLL_MS = 5000;

const DOM = {
  core: () => document.getElementById("status-core"),
  voice: () => document.getElementById("status-voice"),
  session: () => document.getElementById("status-session"),
  transcript: () => document.getElementById("transcript-log"),
  response: () => document.getElementById("response-log"),
  thinking: () => document.getElementById("thinking-bar"),
  textInput: () => document.getElementById("text-input"),
  talkBtn: () => document.getElementById("talk-btn"),
  talkIcon: () => document.getElementById("talk-icon"),
  talkLabel: () => document.getElementById("talk-label"),
  // S5: calendar surface
  calendarStatus: () => document.getElementById("status-calendar"),
  calendarBar: () => document.getElementById("calendar-action-bar"),
  calendarResult: () => document.getElementById("calendar-action-result"),
};

let lastRenderedId = null;

function setText(el, value) {
  if (el) el.textContent = value;
}

function showThinking(visible) {
  const bar = DOM.thinking();
  if (bar) bar.classList.toggle("hidden", !visible);
}

function clearPlaceholder(pane) {
  if (!pane) return;
  const ph = pane.querySelector(".pane-placeholder");
  if (ph) ph.remove();
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// S5: kind badge for voice / other events.
function kindBadge(kind) {
  if (kind === "voice") return "\uD83C\uDF99 voice";
  if (kind === "other") return "\u2022 other";
  return null;
}

function makeEntry(role, text, timestamp, isError, kind) {
  const wrap = document.createElement("div");
  wrap.className = "entry entry-" + role + (isError ? " entry-error" : "");

  // S5: badge row for non-text kinds
  const badge = kindBadge(kind);
  if (badge) {
    const b = document.createElement("div");
    b.className = "entry-kind-badge";
    b.textContent = badge;
    wrap.appendChild(b);
  }

  const body = document.createElement("div");
  body.textContent = text || (kind === "voice" ? "[voice note — transcription pending]" : "[" + (kind || "?") + "]");
  wrap.appendChild(body);

  const meta = document.createElement("div");
  meta.className = "entry-meta";
  meta.textContent = fmtTime(timestamp);
  wrap.appendChild(meta);

  return wrap;
}

function renderSnapshot(data) {
  if (data.session && data.session.session_id) {
    setText(DOM.session(), String(data.session.session_id).slice(0, 8) + "\u2026");
  }

  const raw = Array.isArray(data.items) ? data.items : [];
  // /session/latest returns newest-first; reverse for chronological rendering.
  const items = raw.slice().reverse();
  const newestId = items.length > 0 ? items[items.length - 1].id : null;
  if (newestId === lastRenderedId) return;

  const tpane = DOM.transcript();
  const rpane = DOM.response();
  if (tpane) tpane.innerHTML = "";
  if (rpane) rpane.innerHTML = "";

  for (const item of items) {
    const pane = item.direction === "outbound" ? rpane : tpane;
    if (!pane) continue;
    const role = item.direction === "outbound" ? "assistant" : "user";
    // S5: pass kind so voice events render clearly even when text is null.
    pane.appendChild(makeEntry(role, item.text, item.at, false, item.kind));
  }
  if (tpane) tpane.scrollTop = tpane.scrollHeight;
  if (rpane) rpane.scrollTop = rpane.scrollHeight;

  lastRenderedId = newestId;
}

// S5: render /calendar/status response into the calendar action bar.
function renderCalendar(data) {
  const statusEl = DOM.calendarStatus();
  const barEl = DOM.calendarBar();
  const resultEl = DOM.calendarResult();

  if (!data || !data.provider) {
    setText(statusEl, "—");
    if (barEl) barEl.classList.add("hidden");
    return;
  }

  // Status bar pill: "demo ready" / "unconfigured" / "err"
  const providerReady = data.provider && data.provider.ready;
  const providerName = (data.provider && data.provider.provider) || "—";
  setText(statusEl, providerReady ? providerName + " ready" : providerName + " not ready");
  if (statusEl) {
    statusEl.dataset.state = providerReady ? "live" : "error";
  }

  // Calendar action bar: show last invocation result if present.
  const inv = data.invocation;
  if (!inv) {
    if (barEl) barEl.classList.add("hidden");
    return;
  }

  if (barEl) barEl.classList.remove("hidden");
  if (!resultEl) return;

  if (inv.ok) {
    const count = inv.payload && inv.payload.event_count != null
      ? " · " + inv.payload.event_count + " event" + (inv.payload.event_count === 1 ? "" : "s")
      : "";
    resultEl.textContent =
      "\u2713 calendar.list_today ok" + count +
      " · " + fmtTime(inv.handled_at);
    resultEl.dataset.state = "ok";
  } else {
    const code = (inv.error && inv.error.code) || "error";
    resultEl.textContent =
      "\u2717 calendar.list_today failed (" + code + ")" +
      " · " + fmtTime(inv.handled_at);
    resultEl.dataset.state = "fail";
  }
}

async function refreshHealth() {
  try {
    const res = await fetch(HEALTH_ENDPOINT, { cache: "no-store" });
    if (!res.ok) {
      setText(DOM.core(), "err");
      return;
    }
    const data = await res.json();
    setText(DOM.core(), data && data.ok ? "ok" : "err");
  } catch (_) {
    setText(DOM.core(), "err");
  }
}

async function refreshSession() {
  try {
    const res = await fetch(SESSION_ENDPOINT, { cache: "no-store" });
    if (!res.ok) {
      setText(DOM.voice(), "err");
      return;
    }
    const data = await res.json();
    setText(DOM.voice(), data && data.session ? "idle" : "err");
    renderSnapshot(data || {});
  } catch (_) {
    setText(DOM.voice(), "err");
  }
}

// S5: poll /calendar/status (no ?run — status only, no side effects).
async function refreshCalendar() {
  try {
    const res = await fetch(CALENDAR_ENDPOINT, { cache: "no-store" });
    if (!res.ok) {
      setText(DOM.calendarStatus(), "err");
      return;
    }
    const data = await res.json();
    renderCalendar(data);
  } catch (_) {
    setText(DOM.calendarStatus(), "—");
  }
}

function poll() {
  refreshHealth();
  refreshSession();
  refreshCalendar();
}

poll();
setInterval(poll, POLL_MS);

async function sendMessage() {
  const input = DOM.textInput();
  if (!input) return;
  const text = (input.value || "").trim();
  if (!text) return;

  input.value = "";
  input.disabled = true;
  showThinking(true);

  const tpane = DOM.transcript();
  if (tpane) {
    clearPlaceholder(tpane);
    tpane.appendChild(makeEntry("user", text, new Date().toISOString(), false));
    tpane.scrollTop = tpane.scrollHeight;
  }

  try {
    const res = await fetch(SEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const rpane = DOM.response();
      if (rpane) {
        clearPlaceholder(rpane);
        rpane.appendChild(
          makeEntry("assistant", "send failed (HTTP " + res.status + ")",
            new Date().toISOString(), true),
        );
        rpane.scrollTop = rpane.scrollHeight;
      }
    }
  } catch (err) {
    const rpane = DOM.response();
    if (rpane) {
      clearPlaceholder(rpane);
      rpane.appendChild(
        makeEntry("assistant", "network error reaching worker",
          new Date().toISOString(), true),
      );
      rpane.scrollTop = rpane.scrollHeight;
    }
  } finally {
    showThinking(false);
    input.disabled = false;
    input.focus();
    refreshSession();
  }
}

function clearPane(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = "";
}

let _talking = false;

function toggleTalk() {
  const btn = DOM.talkBtn();
  const icon = DOM.talkIcon();
  const label = DOM.talkLabel();
  if (!btn || btn.disabled) return;

  _talking = !_talking;
  btn.classList.toggle("talking", _talking);

  if (_talking) {
    if (icon) icon.textContent = "\u23F9";
    if (label) label.textContent = "Stop";
  } else {
    if (icon) icon.textContent = "\uD83C\uDF99";
    if (label) label.textContent = "Talk";
  }
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "l") {
    e.preventDefault();
    clearPane("transcript-log");
    clearPane("response-log");
  }
  if (e.key === "Escape") {
    const input = DOM.textInput();
    if (input) input.blur();
  }
});
