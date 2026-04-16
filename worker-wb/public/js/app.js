/**
 * app.js — legacy Operator UI client, neutralized.
 *
 * The previous revision polled /api/status and POSTed to /api/message.
 * Those routes do not exist on the Cloudflare Worker (see worker-wb/src/index.ts;
 * only /telegram/webhook, /session/latest, /health are served). The canonical
 * modern renderer is apps/operator-shell/src/ui/session-view.js, which reuses
 * the same DOM hooks and is wired by the operator-shell entrypoint.
 *
 * This file is kept only so the <script src="/js/app.js"> tag in index.html
 * does not 404 and so the inline onclick handlers still resolve. It must not
 * call /api/* and must not reintroduce hardcoded response strings.
 */

"use strict";

function clearPane(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = "";
}

function sendMessage() {
  // Intentionally inert: the legacy /api/message path is gone. Modern sends
  // flow through apps/operator-shell/src/ui/session-view.js → /telegram/webhook.
}

function toggleTalk() {
  // Intentionally inert: STT wiring lives with the modern operator shell.
}
