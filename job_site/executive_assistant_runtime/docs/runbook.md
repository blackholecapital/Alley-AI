# Runbook — EXEC-AI-RAPID-002
**Owner:** Worker B, S5A.1  
**Covers:** Python backend (Flask UI), Cloudflare Worker, Telegram webhook  
**Mode:** Demo mode by default — no live credentials required for local dev

---

## Quick Reference

| Goal | Command |
|------|---------|
| Install all deps | `make install` |
| Start Python UI (demo) | `make run` |
| Start CF Worker dev server | `make worker-dev` |
| Deploy CF Worker | `make worker-deploy` |
| Run all tests | `make test` |
| Register Telegram webhook | `make webhook-set` |
| Check webhook status | `make webhook-info` |
| Tail Worker logs | `make worker-tail` |

---

## 1. Prerequisites

### Python backend
- Python 3.11+
- pip or a virtualenv manager

### Cloudflare Worker
- Node.js 18+ (`node --version`)
- npm 9+ (`npm --version`)
- Wrangler CLI 3+ — installed via `npm install -g wrangler` or as a local dev dep

### Accounts (production only — not needed for demo mode)
- Cloudflare account (free tier sufficient)
- Telegram bot token from [@BotFather](https://t.me/BotFather)

---

## 2. Install

### 2.1 Python dependencies

```bash
# From project root
cd job_site/executive_assistant_runtime

# Create and activate a virtualenv (recommended)
python3 -m venv .venv
source .venv/bin/activate      # macOS / Linux
# .venv\Scripts\activate       # Windows

# Install runtime deps
pip install flask

# Install test deps
pip install pytest
```

### 2.2 Cloudflare Worker dependencies

```bash
cd job_site/executive_assistant_runtime/worker
npm install
```

If the `worker/` directory does not exist yet (Worker A S5A not yet complete), this step is skipped. The rest of the runbook still applies to the Python backend.

### 2.3 Environment file

```bash
cp config/.env.example config/.env
# Edit config/.env and fill in any values needed for your environment
```

Minimum required for demo mode — no edits needed:
```
DEMO_MODE=true
```

Minimum required for live Telegram mode:
```
DEMO_MODE=false
TELEGRAM_BOT_TOKEN=your_token_here
```

---

## 3. Running the Python Backend

### 3.1 Start the Flask operator UI

```bash
# Demo mode (default) — no credentials required
python -m executive_assistant_runtime.ui.app
```

Starts on `http://127.0.0.1:5050`.  
To change host or port:
```bash
UI_HOST=0.0.0.0 UI_PORT=8080 python -m executive_assistant_runtime.ui.app
```

### 3.2 Verify the Python backend is alive

```bash
curl http://127.0.0.1:5050/health
# Expected: {"ok": true}

curl http://127.0.0.1:5050/api/status
# Expected: {"demo_mode": true, "core_status": "ok", "voice_status": "demo_passthrough", ...}
```

### 3.3 Send a test message

```bash
curl -s -X POST http://127.0.0.1:5050/api/message \
  -H "Content-Type: application/json" \
  -d '{"text": "hello", "session_id": "runbook-test"}' | python3 -m json.tool
# Expected: {"action_taken": "greeting", "error": null, "response": "Hello! ...", ...}
```

---

## 4. Running the Cloudflare Worker (Local Dev)

```bash
cd job_site/executive_assistant_runtime/worker

# Start local dev server (KV is simulated locally)
wrangler dev
# Binds to http://localhost:8787

# Verify
curl http://localhost:8787/health
# Expected: {"ok":true}
```

### 4.1 Expose for Telegram (local dev with tunnel)

```bash
# In a second terminal — requires cloudflared installed
cloudflared tunnel --url http://localhost:8787
# Prints: https://<random>.trycloudflare.com

# Register the webhook (replace placeholders)
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://<random>.trycloudflare.com/webhook/${TELEGRAM_WEBHOOK_SECRET}" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

### 4.2 Point the Worker at the local Python backend

In `wrangler.toml` `[vars]` section, set:
```toml
PYTHON_BACKEND = "http://127.0.0.1:5050"
```

> Note: Cloudflare Workers running locally (`wrangler dev`) can reach `localhost` on the same machine. In production, `PYTHON_BACKEND` must be a public HTTPS URL.

---

## 5. Deploying the Cloudflare Worker

### 5.1 Login (once per machine)

```bash
wrangler login
# Opens browser — authenticate with your Cloudflare account
```

### 5.2 Create KV namespace (once per environment)

```bash
wrangler kv:namespace create SESSION_STORE
# Copy the returned id into wrangler.toml [[kv_namespaces]] id

wrangler kv:namespace create SESSION_STORE --preview
# Copy the returned preview_id into wrangler.toml [[kv_namespaces]] preview_id
```

### 5.3 Set secrets (once — never stored in files)

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
# Paste token when prompted

wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Use a random string, e.g.: openssl rand -hex 32

wrangler secret put PYTHON_BACKEND_TOKEN
# Shared bearer token between Worker and Python backend
```

### 5.4 Deploy

```bash
cd job_site/executive_assistant_runtime/worker
wrangler deploy
# Prints: https://exec-ai-assistant.<your-subdomain>.workers.dev
```

### 5.5 Register Telegram webhook (after every deploy that changes the Worker URL)

```bash
make webhook-set
# or manually:
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://exec-ai-assistant.<subdomain>.workers.dev/webhook/${TELEGRAM_WEBHOOK_SECRET}" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\"]"
```

### 5.6 Verify the deployed Worker

```bash
curl https://exec-ai-assistant.<subdomain>.workers.dev/health
# Expected: {"ok":true}

make webhook-info
# or:
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool
```

---

## 6. Environment Variables — Full List

### Python backend (`.env` or shell)

| Variable | Default | Description |
|----------|---------|-------------|
| `DEMO_MODE` | `true` | `true` = seed data, no live APIs |
| `UI_HOST` | `127.0.0.1` | Flask bind host |
| `UI_PORT` | `5050` | Flask bind port |
| `UI_DEBUG` | `false` | Flask debug mode |
| `UI_SECRET_KEY` | `dev-only-secret` | Flask session key — change in production |
| `INTERACTION_LOG_PATH` | `data/interaction_log.jsonl` | Path to JSONL log file |

### Cloudflare Worker (wrangler.toml `[vars]` + secrets)

| Variable | How set | Description |
|----------|---------|-------------|
| `DEMO_MODE` | `wrangler.toml [vars]` | Mirror of Python backend flag |
| `PYTHON_BACKEND` | `wrangler.toml [vars]` | Base URL of Python backend |
| `LOG_CHANNEL` | `wrangler.toml [vars]` | Channel label for log entries |
| `TELEGRAM_BOT_TOKEN` | `wrangler secret put` | Bot API token |
| `TELEGRAM_WEBHOOK_SECRET` | `wrangler secret put` | Webhook validation token |
| `PYTHON_BACKEND_TOKEN` | `wrangler secret put` | Backend auth bearer token |

---

## 7. Telegram Webhook Management

### Register webhook
```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=<WORKER_URL>/webhook/${TELEGRAM_WEBHOOK_SECRET}" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\"]"
```

### Check webhook status
```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Key fields to check:
- `url` — must match your Worker URL
- `has_custom_certificate` — `false` for workers.dev (uses Cloudflare cert)
- `pending_update_count` — should be `0` in normal operation
- `last_error_message` — empty string when healthy

### Delete webhook (drop back to polling mode)
```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook"
```

---

## 8. Running Tests

```bash
cd job_site/executive_assistant_runtime

# All tests
pytest tests/ -v

# Specific suites
pytest tests/test_assistant_core.py -v       # core golden path
pytest tests/test_telegram_demo_mode.py -v   # Telegram demo mode
pytest tests/test_ui_boot.py -v              # Flask UI boot

# With coverage (optional)
pip install pytest-cov
pytest tests/ --cov=. --cov-report=term-missing
```

All tests run with `DEMO_MODE=true`. No live credentials required.

---

## 9. Logs

### Python backend interaction log
```bash
# Tail the JSONL log
tail -f data/interaction_log.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    e = json.loads(line)
    print(e['timestamp'][:19], e['channel'], e['direction'], e.get('action_taken','—'), e['message'][:60])
"
```

### Cloudflare Worker production logs
```bash
wrangler tail
# Streams real-time logs from the deployed Worker
# Ctrl+C to stop
```

### Flask development logs
Flask prints request logs to stdout by default. In production, redirect to a file:
```bash
python -m executive_assistant_runtime.ui.app >> logs/ui.log 2>&1 &
```

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `wrangler dev` can't reach Python backend | Backend not running or wrong port | Start `python -m executive_assistant_runtime.ui.app` first |
| Telegram webhook returns 403 | `TELEGRAM_WEBHOOK_SECRET` mismatch | Re-set secret: `wrangler secret put TELEGRAM_WEBHOOK_SECRET` and re-register webhook |
| Worker deploys but `/health` returns 404 | Route pattern mismatch in `wrangler.toml` | Check `[[routes]]` or test the `workers.dev` subdomain URL directly |
| `ModuleNotFoundError: No module named 'flask'` | Flask not installed | `pip install flask` |
| `pending_update_count` growing in webhook info | Worker erroring and not acking updates | Check `wrangler tail` for errors; fix and redeploy |
| Interaction log not growing | Wrong `INTERACTION_LOG_PATH` | Check env var; ensure `data/` directory exists |
| Demo mode responses in production | `DEMO_MODE` still `"true"` in wrangler.toml | Set `DEMO_MODE = "false"` in `[vars]` and redeploy |
