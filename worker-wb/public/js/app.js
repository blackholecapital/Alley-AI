/**
 * app.js — Operator UI client, aligned to worker-wb routes.
 *
 * The worker exposes /health, /session/latest, and /telegram/webhook
 * (see worker-wb/src/index.ts). The legacy /api/status and /api/message
 * paths no longer exist and must not be called from this UI.
 *
 * Responsibilities:
 *  - Poll /health for Core status and /session/latest for session id,
 *    last-event timestamp, and transcript/response events.
 *  - Render inbound events into #transcript-log and outbound events
 *    into #response-log using existing pane DOM hooks.
 *  - Send button POSTs a best-effort message envelope to
 *    /telegram/webhook and echoes the operator's text in the transcript
 *    so the input is never silently dropped on the client side.
 *  - No hardcoded assistant response strings — all rendered text comes
 *    from /session/latest.
 */

"use strict";

const HEALTH_ENDPOINT = "/health";
const SESSION_ENDPOINT = "/session/latest";
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

function makeEntry(role, text, timestamp, isError) {
  const wrap = document.createElement("div");
  wrap.className = "entry entry-" + role + (isError ? " entry-error" : "");

  const body = document.createElement("div");
  body.textContent = text;
  wrap.appendChild(body);

  const meta = document.createElement("div");
  meta.className = "entry-meta";
  meta.textContent = fmtTime(timestamp);
  wrap.appendChild(meta);

  return wrap;
}

function renderSnapshot(data) {
  if (data.session && data.session.session_id) {
    setText(DOM.session(), String(data.session.session_id).slice(0, 8) + "…");
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
    const text = item.text || "[" + item.kind + "]";
    pane.appendChild(makeEntry(role, text, item.at, false));
  }
  if (tpane) tpane.scrollTop = tpane.scrollHeight;
  if (rpane) rpane.scrollTop = rpane.scrollHeight;

  lastRenderedId = newestId;
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

function poll() {
  refreshHealth();
  refreshSession();
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
