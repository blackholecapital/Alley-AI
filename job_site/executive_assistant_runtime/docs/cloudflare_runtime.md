# Cloudflare Worker Runtime — EXEC-AI-RAPID-002
**Owner:** Worker B, S5A.1  
**Scope:** Runtime architecture, wrangler config, Telegram webhook placement, environment variables, and future bindings  
**Status:** Patch documentation — no implementation required in this stage

---

## 1. Why Cloudflare Workers

| Property | Value for this project |
|----------|----------------------|
| Runtime | V8 isolate — no Node.js process, no Python interpreter |
| Cold start | < 5 ms globally — acceptable for Telegram webhook latency |
| Deployment | Single `wrangler deploy` command — matches one-command boot requirement |
| Cost | Free tier covers prototype volume (100,000 req/day) |
| Secrets | `wrangler secret put` — no `.env` file in production |
| KV storage | Global key-value store for session state and interaction log |
| D1 | SQLite-compatible database available as a future binding |

**Limitation:** The Cloudflare Worker runtime executes JavaScript/TypeScript, not Python. The Python assistant core (`core/assistant_core.py`) cannot run directly inside a Worker. Two patterns are supported:

| Pattern | Description | When to use |
|---------|-------------|-------------|
| **Proxy Worker** | CF Worker handles Telegram webhook, validates request, forwards to a Python backend (Flask UI or standalone API) over HTTP | S5 prototype — Python core stays on a VPS or local tunnel |
| **Full Worker** | All logic re-implemented in TypeScript inside the Worker; Python core replaced or called via an AI gateway | Post-prototype — not in scope for EXEC-AI-RAPID-002 |

**Default for this run: Proxy Worker pattern.** The Worker is the public edge endpoint; the Python core runs behind it.

---

## 2. Project Layout (Worker files)

These files sit alongside the existing Python runtime tree:

```
executive_assistant_runtime/
├── worker/                        ← Cloudflare Worker source
│   ├── src/
│   │   ├── index.ts               ← fetch handler entry point
│   │   ├── telegram.ts            ← webhook validation + dispatch
│   │   └── proxy.ts               ← forwards requests to Python backend
│   ├── wrangler.toml              ← Worker config (name, bindings, routes)
│   ├── package.json               ← wrangler + TypeScript deps
│   └── tsconfig.json              ← TypeScript config
├── core/                          ← Python assistant core (existing)
├── ui/                            ← Flask operator UI (existing)
└── ...
```

The `worker/` directory is created when S5A Worker A (or operator) scaffolds the Worker. This document defines what goes inside it.

---

## 3. wrangler.toml Reference

```toml
name        = "exec-ai-assistant"
main        = "src/index.ts"
compatibility_date = "2024-09-23"

# ── Routes ──────────────────────────────────────────────────────────────────
# Telegram sends updates to this path. Change SECRET_PATH to a random slug.
[[routes]]
pattern = "your-domain.workers.dev/webhook/<SECRET_PATH>"
zone_name = ""   # leave blank for workers.dev subdomain

# ── KV Namespaces ────────────────────────────────────────────────────────────
# Used for session state and interaction log entries.
[[kv_namespaces]]
binding  = "SESSION_STORE"
id       = ""          # fill after: wrangler kv:namespace create SESSION_STORE
preview_id = ""        # fill after: wrangler kv:namespace create SESSION_STORE --preview

# ── D1 Database (future binding — not active in S5A) ────────────────────────
# [[d1_databases]]
# binding  = "INTERACTION_LOG_DB"
# database_name = "interaction_log"
# database_id   = ""   # fill after: wrangler d1 create interaction_log

# ── Environment variables (non-secret) ──────────────────────────────────────
[vars]
DEMO_MODE        = "true"
PYTHON_BACKEND   = "https://your-ngrok-or-vps-url.example.com"
LOG_CHANNEL      = "worker"

# ── Secrets (set via wrangler secret put — never in this file) ───────────────
# TELEGRAM_BOT_TOKEN
# TELEGRAM_WEBHOOK_SECRET
# PYTHON_BACKEND_TOKEN      ← shared secret between Worker and Python backend
```

**Rules:**
- Never commit `TELEGRAM_BOT_TOKEN` or any secret to this file
- `PYTHON_BACKEND` must be HTTPS — Telegram requires HTTPS webhooks
- `preview_id` is needed for `wrangler dev --remote` testing

---

## 4. Environment Variables — Full Reference

### 4.1 Secrets (set with `wrangler secret put <NAME>`)

| Name | Purpose | Required |
|------|---------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token from @BotFather | YES |
| `TELEGRAM_WEBHOOK_SECRET` | Random token passed in `X-Telegram-Bot-Api-Secret-Token` header for request validation | YES |
| `PYTHON_BACKEND_TOKEN` | Shared bearer token the Worker uses to authenticate calls to the Python backend | YES (if backend is exposed) |

Set each one:
```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put PYTHON_BACKEND_TOKEN
```

### 4.2 Non-secret vars (in `wrangler.toml [vars]`)

| Name | Default | Purpose |
|------|---------|---------|
| `DEMO_MODE` | `"true"` | Mirrors Python backend flag; Worker returns demo responses if backend is unreachable |
| `PYTHON_BACKEND` | `""` | Base URL of the Python Flask backend or standalone API |
| `LOG_CHANNEL` | `"worker"` | Channel label written to interaction log entries |

### 4.3 Python backend mirrors (in `.env` / `config/settings.py`)

| Name | Purpose |
|------|---------|
| `DEMO_MODE` | Must match Worker's `DEMO_MODE` var |
| `INTERACTION_LOG_PATH` | Path to JSONL log file on the backend host |
| `UI_HOST` / `UI_PORT` | Flask bind address — must match `PYTHON_BACKEND` in wrangler.toml |

---

## 5. Telegram Webhook — Placement and Registration

### 5.1 Where the webhook lives

```
Telegram servers
      │  POST /webhook/<SECRET_PATH>
      ▼
Cloudflare Worker (edge)
      │  validates X-Telegram-Bot-Api-Secret-Token header
      │  extracts message.text, chat.id, from.id
      │  POST /api/message  (with Bearer token)
      ▼
Python Flask backend (UI or standalone)
      │  calls AssistantCore.process()
      │  writes interaction log
      ▼
Worker receives response JSON
      │  POST sendMessage to Telegram Bot API
      ▼
Telegram user receives reply
```

### 5.2 Worker fetch handler shape (`src/index.ts`)

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health probe
    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    // Telegram webhook
    if (url.pathname.startsWith("/webhook/")) {
      return handleTelegramWebhook(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};
```

### 5.3 Webhook validation (`src/telegram.ts`)

```typescript
async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  // 1. Validate secret token header
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  // 2. Parse update
  const update = await request.json<TelegramUpdate>();
  const message = update?.message;
  if (!message?.text) return Response.json({ ok: true }); // ack non-text updates

  // 3. Forward to Python backend
  const backendResponse = await fetch(`${env.PYTHON_BACKEND}/api/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.PYTHON_BACKEND_TOKEN}`,
    },
    body: JSON.stringify({
      text: message.text,
      session_id: String(message.chat.id),
      channel: "telegram",
      user_id: String(message.from?.id ?? ""),
    }),
  });

  const result = await backendResponse.json<AssistantResult>();

  // 4. Send reply via Telegram Bot API
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: message.chat.id,
      text: result.response,
      parse_mode: "Markdown",
    }),
  });

  return Response.json({ ok: true });
}
```

### 5.4 Registering the webhook

Run once after deploy (replace placeholders):
```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://exec-ai-assistant.your-subdomain.workers.dev/webhook/${SECRET_PATH}" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\"]"
```

Verify:
```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | jq .
```

Expected response includes `"url": "https://..."` and `"pending_update_count": 0`.

---

## 6. KV Bindings — Session Store

KV is used to persist session state between Worker invocations (V8 isolates are stateless).

### 6.1 Create the namespace

```bash
# Production namespace
wrangler kv:namespace create SESSION_STORE
# Copy the returned id into wrangler.toml [[kv_namespaces]] id field

# Preview namespace (for wrangler dev --remote)
wrangler kv:namespace create SESSION_STORE --preview
# Copy the returned id into wrangler.toml [[kv_namespaces]] preview_id field
```

### 6.2 KV key schema

| Key pattern | Value | TTL |
|-------------|-------|-----|
| `session:<chat_id>` | JSON object `{ session_id, last_seen, pending_action }` | 24 h |
| `log:<chat_id>:<timestamp>` | Interaction log entry JSON | 7 d (optional; primary log is on Python backend) |

### 6.3 Access in Worker

```typescript
// Read
const raw = await env.SESSION_STORE.get(`session:${chatId}`);
const session = raw ? JSON.parse(raw) : { session_id: crypto.randomUUID() };

// Write
await env.SESSION_STORE.put(
  `session:${chatId}`,
  JSON.stringify(session),
  { expirationTtl: 86400 }  // 24 hours
);
```

---

## 7. Future Bindings (not active in S5A)

| Binding type | Name | Purpose | Stage |
|---|---|---|---|
| D1 database | `INTERACTION_LOG_DB` | Persistent structured log queryable via SQL | Post-S10 |
| R2 bucket | `MEDIA_STORE` | Voice audio files, attachments | Extension track |
| AI gateway | `AI` | Route LLM calls through Cloudflare AI Gateway for caching + rate limiting | Post-S10 |
| Queue | `OUTBOUND_QUEUE` | Async calendar writes, notifications | Extension track |
| Durable Object | `SESSION_DO` | Strongly consistent session state per chat | Extension track |

To add a future binding, add the stanza to `wrangler.toml` and declare it in the `Env` TypeScript interface — no other code changes required until the binding is actually used.

---

## 8. Local Development with `wrangler dev`

```bash
cd job_site/executive_assistant_runtime/worker

# Install deps (once)
npm install

# Run local dev server (uses local KV simulation)
wrangler dev

# Run against production KV/D1 (needs Cloudflare login)
wrangler dev --remote
```

`wrangler dev` binds to `http://localhost:8787` by default. Use a tool like `ngrok` or `cloudflared tunnel` to expose it to Telegram:
```bash
# In a second terminal
cloudflared tunnel --url http://localhost:8787
# Telegram webhook URL becomes: https://<random>.trycloudflare.com/webhook/<SECRET_PATH>
```

---

## 9. Deploy

```bash
# Login once
wrangler login

# Deploy to production
wrangler deploy

# View real-time logs from production
wrangler tail
```

After deploy, re-register the Telegram webhook if the Worker URL changed (see §5.4).
