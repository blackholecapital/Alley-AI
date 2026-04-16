# Bindings Plan — worker-wb

**Job:** EXEC-AI-RAPID-002  
**Stage:** S5B.1  
**Scope:** Minimal viable binding structure for the Cloudflare Worker at `/worker-wb`  
**Status:** Placeholders declared — no services provisioned or wired

---

## 1. vars (plain-text runtime config)

Declared in `wrangler.jsonc` under `"vars"`. Available in the Worker as `env.<KEY>`.

| Key | Default | Purpose |
|-----|---------|---------|
| `ENVIRONMENT` | `development` | Runtime environment tag (development / staging / production) |
| `WORKER_VERSION` | `0.1.0` | Deployed version — useful in health check responses |
| `LOG_LEVEL` | `info` | Controls verbosity of structured log output |
| `PROXY_BACKEND_URL` | `http://localhost:5000` | Upstream Python backend for the proxy-worker pattern |

**Secrets** (API keys, tokens) are NOT stored in vars. They go into:
- `.dev.vars` for local development
- `wrangler secret put <KEY>` for production

---

## 2. KV Namespace — `CHASSIS_KV`

| Field | Value |
|-------|-------|
| Binding name | `CHASSIS_KV` |
| Provision command | `wrangler kv namespace create CHASSIS_KV` |
| Status | Commented placeholder in wrangler.jsonc |

**Intended uses:**
- Session state cache (keyed by user/channel ID)
- Interaction log buffer (write-behind to D1 or external store)
- Feature flag / demo-mode toggle storage

---

## 3. D1 Database — `CHASSIS_DB`

| Field | Value |
|-------|-------|
| Binding name | `CHASSIS_DB` |
| Database name | `ali-ai-chassis` |
| Provision command | `wrangler d1 create ali-ai-chassis` |
| Status | Commented placeholder in wrangler.jsonc |

**Intended uses:**
- Calendar events (seed + real provider data)
- Contact records
- Interaction audit trail (persistent)
- Action confirmation log

---

## 4. R2 Bucket — `ASSETS_BUCKET`

| Field | Value |
|-------|-------|
| Binding name | `ASSETS_BUCKET` |
| Bucket name | `ali-ai-assets` |
| Provision command | `wrangler r2 bucket create ali-ai-assets` |
| Status | Commented placeholder in wrangler.jsonc |

**Intended uses:**
- Voice recording storage (STT input, TTS output)
- File attachments from Telegram or web chat
- Export artifacts (reports, CSV dumps)

---

## 5. Durable Object — `SESSION_DO`

| Field | Value |
|-------|-------|
| Binding name | `SESSION_DO` |
| Class name | `SessionObject` |
| Migration tag | `v1` |
| Status | Commented placeholder in wrangler.jsonc |

**Intended uses:**
- Per-user conversation state machine (single-writer, globally consistent)
- Confirmation-gate coordinator for calendar create/update actions
- WebSocket upgrade target for real-time voice/UI push

**Prerequisite:** The Worker entrypoint must `export class SessionObject extends DurableObject { ... }` before this binding can be activated.

---

## 6. Wiring order (when services are provisioned)

1. **vars** — already active, no provisioning needed
2. **KV** — provision first; lowest friction, needed for session cache
3. **D1** — provision second; needed for structured data once demo mode is replaced
4. **R2** — provision when voice pipeline or file attachments go live
5. **Durable Objects** — provision last; requires class export + migration; needed only for stateful per-user coordination

---

## 7. Env interface alignment

When a binding is uncommented in `wrangler.jsonc`, the corresponding type must be added to the `Env` interface in `src/index.ts`:

```typescript
export interface Env {
  // vars
  ENVIRONMENT: string;
  WORKER_VERSION: string;
  LOG_LEVEL: string;
  PROXY_BACKEND_URL: string;

  // KV — uncomment when provisioned
  // CHASSIS_KV: KVNamespace;

  // D1 — uncomment when provisioned
  // CHASSIS_DB: D1Database;

  // R2 — uncomment when provisioned
  // ASSETS_BUCKET: R2Bucket;

  // Durable Objects — uncomment when provisioned
  // SESSION_DO: DurableObjectNamespace;
}
```

This interface is not updated in this pass. It will be updated when bindings are actually provisioned and wired.
