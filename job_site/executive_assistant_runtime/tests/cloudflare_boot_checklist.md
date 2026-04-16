# Cloudflare Worker Boot Checklist — EXEC-AI-RAPID-002
**Owner:** Worker B, S5A.1  
**Used by:** S5A tighten pass, S7 checksum, operator at every deploy  
**Mode:** Demo mode safe — steps marked `[LIVE ONLY]` require real credentials

Work through this list top to bottom before marking a Cloudflare Worker deployment PASS. Each item is binary: ☑ PASS or ☒ FAIL. Any FAIL blocks progression.

---

## Part 1 — Prerequisites

| # | Check | Command / Action | Pass condition |
|---|-------|-----------------|----------------|
| P-01 | Node.js installed | `node --version` | Prints `v18.x` or higher |
| P-02 | npm installed | `npm --version` | Prints `9.x` or higher |
| P-03 | Wrangler installed | `wrangler --version` | Prints `3.x` or higher |
| P-04 | Python 3.11+ installed | `python3 --version` | Prints `3.11.x` or higher |
| P-05 | Flask installed | `python3 -c "import flask"` | No error |
| P-06 | worker/ directory exists | `ls worker/` | Contains `wrangler.toml`, `src/`, `package.json` |
| P-07 | Worker deps installed | `ls worker/node_modules/.bin/wrangler` | File exists |
| P-08 | wrangler.toml present | `cat worker/wrangler.toml` | Contains `name`, `main`, `compatibility_date` |

**Stop here if any P-0x fails. Fix before continuing.**

---

## Part 2 — Python Backend Boot

| # | Check | Command | Pass condition |
|---|-------|---------|----------------|
| B-01 | Python backend starts | `python -m executive_assistant_runtime.ui.app &` | No traceback in first 3 s |
| B-02 | Health endpoint responds | `curl -s http://127.0.0.1:5050/health` | Returns `{"ok": true}` |
| B-03 | Status endpoint responds | `curl -s http://127.0.0.1:5050/api/status` | Returns JSON with `"core_status": "ok"` |
| B-04 | Demo mode active | Check B-03 response | `"demo_mode": true` |
| B-05 | Message endpoint works | `curl -s -X POST http://127.0.0.1:5050/api/message -H "Content-Type: application/json" -d '{"text":"hello","session_id":"boot-check"}'` | Returns JSON with `"action_taken": "greeting"` |
| B-06 | No error in response | Check B-05 response | `"error": null` |
| B-07 | Log endpoint works | `curl -s http://127.0.0.1:5050/api/log` | Returns `{"entries": [...], "count": ...}` |

---

## Part 3 — Cloudflare Worker Local Dev Boot

| # | Check | Command | Pass condition |
|---|-------|---------|----------------|
| W-01 | wrangler dev starts | `cd worker && wrangler dev` | Prints `⎔ Starting local server...` and binds to port 8787 |
| W-02 | Worker health responds | `curl -s http://localhost:8787/health` | Returns `{"ok":true}` |
| W-03 | Unknown route returns 404 | `curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/not-a-route` | Returns `404` |
| W-04 | No unhandled errors in console | Check wrangler dev terminal output | No `Uncaught Error` or `TypeError` lines |
| W-05 | KV binding available | Check wrangler dev output | Prints `Binding SESSION_STORE` (or no binding error) |
| W-06 | DEMO_MODE var present | Check wrangler.toml `[vars]` | `DEMO_MODE = "true"` line exists |
| W-07 | PYTHON_BACKEND var set | Check wrangler.toml `[vars]` | `PYTHON_BACKEND` line exists (may be localhost for dev) |

---

## Part 4 — Worker → Python Backend Integration (Local)

Run with both the Python backend (Part 2) and `wrangler dev` (Part 3) active.

| # | Check | Command | Pass condition |
|---|-------|---------|----------------|
| I-01 | Worker can reach backend `/health` | Worker log shows no connection refused on startup | No `fetch failed` error in wrangler dev console |
| I-02 | Simulated webhook POST reaches backend | `curl -s -X POST http://localhost:8787/webhook/test -H "X-Telegram-Bot-Api-Secret-Token: test" -H "Content-Type: application/json" -d '{"message":{"text":"hello","chat":{"id":1},"from":{"id":42}}}'` | Returns `{"ok":true}` (Worker acks the update) |
| I-03 | Backend log has new entry after I-02 | `curl -s http://127.0.0.1:5050/api/log` | Entry count increased; newest entry has `"channel": "telegram"` |
| I-04 | No 4xx or 5xx in Worker console during I-02 | Check wrangler dev terminal | Only 200 responses logged |

---

## Part 5 — Secrets and Environment `[LIVE ONLY]`

Skip this part in demo mode. Required before any production deploy.

| # | Check | Command | Pass condition |
|---|-------|---------|----------------|
| S-01 | Wrangler logged in | `wrangler whoami` | Prints your Cloudflare account email |
| S-02 | `TELEGRAM_BOT_TOKEN` set | `wrangler secret list` | `TELEGRAM_BOT_TOKEN` appears in list |
| S-03 | `TELEGRAM_WEBHOOK_SECRET` set | `wrangler secret list` | `TELEGRAM_WEBHOOK_SECRET` appears in list |
| S-04 | `PYTHON_BACKEND_TOKEN` set | `wrangler secret list` | `PYTHON_BACKEND_TOKEN` appears in list |
| S-05 | `PYTHON_BACKEND` points to HTTPS URL | Check wrangler.toml `[vars]` | Value starts with `https://` |
| S-06 | KV namespace IDs filled in | Check wrangler.toml `[[kv_namespaces]]` | `id` and `preview_id` fields are non-empty strings |

---

## Part 6 — Production Deploy `[LIVE ONLY]`

| # | Check | Command | Pass condition |
|---|-------|---------|----------------|
| D-01 | Deploy succeeds | `wrangler deploy` | Prints `Deployed to https://exec-ai-assistant.*.workers.dev` with no errors |
| D-02 | Deployed Worker health | `curl -s https://exec-ai-assistant.<subdomain>.workers.dev/health` | Returns `{"ok":true}` |
| D-03 | No 500 on unknown path | `curl -s -o /dev/null -w "%{http_code}" https://exec-ai-assistant.<subdomain>.workers.dev/not-found` | Returns `404` |
| D-04 | wrangler tail active | `wrangler tail` | Streams logs without error |

---

## Part 7 — Telegram Webhook `[LIVE ONLY]`

| # | Check | Command | Pass condition |
|---|-------|---------|----------------|
| T-01 | Webhook registered | `curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" -d "url=<WORKER_URL>/webhook/${TELEGRAM_WEBHOOK_SECRET}" -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"` | Returns `{"ok":true,"result":true}` |
| T-02 | Webhook URL correct | `curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"` | `url` field matches Worker URL |
| T-03 | No pending backlog | Check T-02 response | `pending_update_count` is `0` |
| T-04 | No last error | Check T-02 response | `last_error_message` is empty or absent |
| T-05 | Bot responds to `/start` | Send `/start` to the bot in Telegram | Bot replies with welcome message from `config/menu_copy.py` |
| T-06 | Bot responds to free text | Send `hello` to the bot | Bot replies with greeting response |
| T-07 | Interaction log updated | `curl http://127.0.0.1:5050/api/log` | New entries with `"channel": "telegram"` and `"direction": "in"` + `"out"` |
| T-08 | Demo mode watermark absent in live mode | Check T-06 response text | No `[Demo mode — responses use seed data]` text |

---

## Sign-Off

| Part | All checks passed? | Tester | Notes |
|------|--------------------|--------|-------|
| 1 — Prerequisites | ☐ YES / ☐ NO | | |
| 2 — Python Backend | ☐ YES / ☐ NO | | |
| 3 — Worker Local Dev | ☐ YES / ☐ NO | | |
| 4 — Integration | ☐ YES / ☐ NO | | |
| 5 — Secrets (live) | ☐ YES / ☐ SKIP | | |
| 6 — Deploy (live) | ☐ YES / ☐ SKIP | | |
| 7 — Telegram (live) | ☐ YES / ☐ SKIP | | |

**Demo mode result (Parts 1–4):** ☐ PASS / ☐ FAIL  
**Full live result (Parts 1–7):** ☐ PASS / ☐ FAIL / ☐ NOT RUN

---

## Failure Reference

| Check | Symptom | Fix |
|-------|---------|-----|
| P-07 | `node_modules` missing | `cd worker && npm install` |
| B-01 | `ModuleNotFoundError: flask` | `pip install flask` |
| W-01 | `wrangler: command not found` | `npm install -g wrangler` or `cd worker && npx wrangler dev` |
| W-05 | KV binding error | Create namespace: `wrangler kv:namespace create SESSION_STORE` and fill IDs in wrangler.toml |
| I-01 | `fetch failed` in Worker console | Ensure Python backend is running on the port matching `PYTHON_BACKEND` in wrangler.toml |
| T-04 | `last_error_message: HTTPS required` | `PYTHON_BACKEND` in production must be HTTPS |
| T-08 | Demo watermark appears in live mode | Set `DEMO_MODE = "false"` in wrangler.toml `[vars]` and redeploy |
