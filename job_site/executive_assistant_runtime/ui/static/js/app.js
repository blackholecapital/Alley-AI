/**
 * app.js — Operator UI client
 * EXEC-AI-RAPID-002 | S5.1 | Worker B
 *
 * Responsibilities:
 *  - Send text messages via POST /api/message
 *  - Display entries in transcript pane and response pane
 *  - Poll /api/status every 10 s and update status bar
 *  - Talk button: demo mode disables it; live mode will wire STT here (S5-WA)
 *  - No hardcoded response strings — all text comes from the server
 */

"use strict";

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

const SESSION_ID = crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36);

document.getElementById("status-session").textContent =
  SESSION_ID.slice(0, 8) + "…";

// ---------------------------------------------------------------------------
// Status polling
// ---------------------------------------------------------------------------

async function refreshStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return;
    const data = await res.json();

    setStatusValue("status-core",  data.core_status  || "?");
    setStatusValue("status-voice", data.voice_status || "?");
  } catch (_) {
    setStatusValue("status-core",  "err");
  }
}

function setStatusValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

refreshStatus();
setInterval(refreshStatus, 10_000);

// ---------------------------------------------------------------------------
// Send message
// ---------------------------------------------------------------------------

async function sendMessage() {
  const input = document.getElementById("text-input");
  const text = (input.value || "").trim();
  if (!text) return;

  input.value = "";
  input.disabled = true;

  appendTranscript(text);
  showThinking(true);

  try {
    const res = await fetch("/api/message", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text, session_id: SESSION_ID }),
    });

    const data = await res.json();
    appendResponse(data.response, data.action_taken, !!data.error);
  } catch (err) {
    appendResponse("⚠ Network error — could not reach the assistant.", "error", true);
  } finally {
    showThinking(false);
    input.disabled = false;
    input.focus();
  }
}

// ---------------------------------------------------------------------------
// Pane rendering
// ---------------------------------------------------------------------------

function appendTranscript(text) {
  const log = document.getElementById("transcript-log");
  clearPlaceholder(log);

  const entry = makeEntry("user", text, null);
  log.appendChild(entry);
  scrollToBottom(log);
}

function appendResponse(text, actionTaken, isError) {
  const log = document.getElementById("response-log");
  clearPlaceholder(log);

  const entry = makeEntry("assistant", text, actionTaken, isError);
  log.appendChild(entry);
  scrollToBottom(log);
}

function makeEntry(role, text, actionTaken, isError) {
  const wrap = document.createElement("div");
  wrap.className = "entry entry-" + role + (isError ? " entry-error" : "");

  const body = document.createElement("div");
  body.textContent = text;
  wrap.appendChild(body);

  const meta = document.createElement("div");
  meta.className = "entry-meta";
  meta.textContent = fmtTime(new Date());

  if (actionTaken && role === "assistant") {
    const tag = document.createElement("span");
    tag.className = "entry-action-tag";
    tag.textContent = actionTaken;
    meta.appendChild(tag);
  }

  wrap.appendChild(meta);
  return wrap;
}

function clearPlaceholder(pane) {
  const ph = pane.querySelector(".pane-placeholder");
  if (ph) ph.remove();
}

function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight;
}

function clearPane(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = "";
}

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ---------------------------------------------------------------------------
// Thinking indicator
// ---------------------------------------------------------------------------

function showThinking(visible) {
  const bar = document.getElementById("thinking-bar");
  if (!bar) return;
  bar.classList.toggle("hidden", !visible);
}

// ---------------------------------------------------------------------------
// Talk button
// (Demo mode: disabled by server-side template attribute.
//  Live mode hook: replace this stub with STT integration from voice_pipeline.py)
// ---------------------------------------------------------------------------

let _talking = false;

function toggleTalk() {
  const btn   = document.getElementById("talk-btn");
  const icon  = document.getElementById("talk-icon");
  const label = document.getElementById("talk-label");

  if (!btn || btn.disabled) return;

  _talking = !_talking;
  btn.classList.toggle("talking", _talking);

  if (_talking) {
    icon.textContent  = "⏹";
    label.textContent = "Stop";
    // Live mode: start STT here and stream transcript to sendMessage()
    // Demo mode: no-op; user types instead
    console.info("[Talk] Recording started (stub — wire STT in S5-WA)");
  } else {
    icon.textContent  = "🎙";
    label.textContent = "Talk";
    console.info("[Talk] Recording stopped (stub)");
  }
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  // Ctrl+L / Cmd+L — clear both panes
  if ((e.ctrlKey || e.metaKey) && e.key === "l") {
    e.preventDefault();
    clearPane("transcript-log");
    clearPane("response-log");
  }
  // Escape — cancel pending input
  if (e.key === "Escape") {
    const input = document.getElementById("text-input");
    if (input) input.blur();
  }
});
