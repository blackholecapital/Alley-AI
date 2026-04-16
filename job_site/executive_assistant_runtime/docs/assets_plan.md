# Static Asset Serving Plan — Cloudflare Workers
**EXEC-AI-RAPID-002 | S5B.1 | Worker B**
**Scope:** UI static asset serving via Cloudflare Workers — path structure, boot flow, wrangler configuration
**Status:** Planning document — no implementation required in this stage

---

## 1. Context

The operator UI (`ui/`) is currently served by a Flask development server on port 5050.
Static assets (CSS, JS) are served by Flask's built-in static file handler at:

```
/static/css/style.css
/static/js/app.js
```

When the prototype graduates to a Cloudflare edge deployment, those assets must be
served from the Worker. This document defines the approach using the **modern
Cloudflare Workers Assets API** — not the deprecated Workers Sites (`[site]`) binding.

**Workers Sites is deprecated and must not be used.**
Reference: Cloudflare docs → "Migrate from Workers Sites to Assets"

---

## 2. Serving Model

### 2.1 Two-tier asset + API separation

```
Browser
  │
  ├─ GET /          → Worker returns index.html  (from Assets binding)
  ├─ GET /static/*  → Worker streams asset        (from Assets binding)
  ├─ POST /api/*    → Worker proxies to Python backend  (fetch() to origin)
  └─ GET /health    → Worker responds directly    (no origin needed)
```

All reads of HTML/CSS/JS are served from the Worker's asset bundle — zero
round-trips to the Python origin. API calls (`/api/message`, `/api/status`,
`/api/log`) are forwarded to the Python backend via `env.ASSETS.fetch()` or
a direct `fetch()` to the configured `BACKEND_URL`.

### 2.2 Why not full Worker SSR?

The index.html template uses Jinja2 (`{{ demo_mode }}`, `{{ boot_time }}`).
For the prototype, those values are injected at boot time by Flask. At the
Worker layer, they are replaced with static defaults or fetched from the
Python backend on first load — no Jinja2 re-implementation needed.

---

## 3. Asset Directory Structure

The Worker asset root maps to the existing Flask static tree with the addition
of `index.html`:

```
executive_assistant_runtime/worker/
├── wrangler.toml           ← Worker + Assets config
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts            ← fetch handler
    ├── proxy.ts            ← Python backend proxy
    └── assets/             ← asset root (bound to ASSETS)
        ├── index.html      ← static shell (boot_time/demo_mode rendered client-side)
        └── static/
            ├── css/
            │   └── style.css
            └── js/
                └── app.js
```

**Asset root:** `src/assets/`
**Bound name:** `ASSETS` (Cloudflare Workers Assets binding)

The `static/css/` and `static/js/` paths deliberately mirror the Flask layout so
`url_for('static', filename='css/style.css')` URLs in the existing HTML work
unchanged when the HTML is served from the Worker.

---

## 4. wrangler.toml Configuration

```toml
name               = "exec-ai-operator-ui"
main               = "src/index.ts"
compatibility_date = "2025-04-01"
compatibility_flags = ["nodejs_compat"]

# ── Static asset binding (replaces deprecated [site]) ─────────────────────
[assets]
directory = "src/assets"       # path relative to wrangler.toml
binding   = "ASSETS"           # name used in TypeScript: env.ASSETS

# ── Secrets (set via: wrangler secret put <NAME>) ─────────────────────────
# BACKEND_URL   — URL of the Python backend (e.g. https://api.example.com)
# DEMO_MODE     — "true" | "false"

# ── KV namespaces (optional — for session state if Python backend is removed)
# [[kv_namespaces]]
# binding = "SESSION_KV"
# id      = "<KV_NAMESPACE_ID>"

# ── Routes ────────────────────────────────────────────────────────────────
# routes = [{ pattern = "assistant.example.com/*", zone_name = "example.com" }]
```

### 4.1 Key wrangler.toml rules

| Rule | Reason |
|------|--------|
| Use `[assets]` block, not `[site]` | `[site]` is deprecated; Assets API is the supported path |
| `directory` is relative to `wrangler.toml` | Avoids absolute-path errors across dev environments |
| `binding = "ASSETS"` | Required to call `env.ASSETS.fetch(request)` in the handler |
| `compatibility_date` ≥ 2024-09-23 | Asset binding GA requires this minimum date |

---

## 5. TypeScript Fetch Handler (`src/index.ts`)

```typescript
interface Env {
  ASSETS: Fetcher;          // Workers Assets binding
  BACKEND_URL: string;      // Python backend origin (secret)
  DEMO_MODE: string;        // "true" | "false"
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── API routes → proxy to Python backend ──────────────────────────────
    if (url.pathname.startsWith("/api/")) {
      return proxyToBackend(request, env);
    }

    // ── Health check → handled at edge, no origin needed ─────────────────
    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    // ── Everything else → serve from asset bundle ────────────────────────
    // Workers Assets binding handles cache headers, ETags, and 404s.
    return env.ASSETS.fetch(request);
  },
};
```

### 5.1 Proxy helper (`src/proxy.ts`)

```typescript
export async function proxyToBackend(
  request: Request,
  env: { BACKEND_URL: string },
): Promise<Response> {
  const url       = new URL(request.url);
  const backendUrl = new URL(url.pathname + url.search, env.BACKEND_URL);

  const proxied = new Request(backendUrl.toString(), {
    method:  request.method,
    headers: request.headers,
    body:    request.method === "GET" || request.method === "HEAD"
               ? undefined
               : request.body,
  });

  try {
    return await fetch(proxied);
  } catch (err) {
    return Response.json(
      { error: "backend_unreachable", detail: String(err) },
      { status: 502 },
    );
  }
}
```

---

## 6. index.html Adaptation

The existing `index.html` uses two Jinja2 template variables:

| Variable | Current (Flask) | Worker replacement |
|----------|-----------------|-------------------|
| `{{ demo_mode }}` | `True` / `False` | Hardcode `true` in static shell; app.js reads `/api/status` and updates the badge dynamically |
| `{{ boot_time }}` | Server boot ISO string | Populated by `refreshStatus()` polling `/api/status` — already implemented in `app.js` |

The static `index.html` served by the Worker replaces both Jinja2 expressions
with their safe defaults:

```html
<!-- Jinja2 removed — values hydrated by app.js via /api/status -->
<span id="status-demo-badge" class="badge badge-demo">DEMO</span>
```

`app.js` already calls `refreshStatus()` on page load and updates the badge
and status values via the DOM — no template engine required at the Worker layer.

---

## 7. Boot Flow

```
1. wrangler deploy
   └─ Bundles src/index.ts + uploads src/assets/ to Cloudflare edge

2. Browser → GET /
   └─ Worker: env.ASSETS.fetch(request)
      └─ Returns index.html with Cache-Control headers set by Workers Assets

3. Browser → GET /static/css/style.css
   └─ Worker: env.ASSETS.fetch(request) → cached at edge

4. Browser → GET /static/js/app.js
   └─ Worker: env.ASSETS.fetch(request) → cached at edge

5. app.js runs → GET /api/status
   └─ Worker: proxyToBackend() → Python backend → JSON response
      └─ app.js updates badge, core/voice status, session ID

6. User types message → POST /api/message
   └─ Worker: proxyToBackend() → Python backend → JSON response
      └─ app.js renders transcript + response panes
```

---

## 8. Local Development Workflow

```bash
# Install wrangler
npm install -g wrangler

# Copy static assets from Flask build to Worker asset root
cp -r ui/static/   worker/src/assets/static/
cp    ui/templates/index.html  worker/src/assets/index.html
# (Remove Jinja2 expressions from the copied index.html)

# Start Python backend
DEMO_MODE=true python -m executive_assistant_runtime.ui.app &

# Start Worker dev server (proxies /api/* to localhost:5050)
cd worker
BACKEND_URL=http://127.0.0.1:5050 wrangler dev --port 8787
```

The `wrangler dev` server serves assets from `src/assets/` with hot-reload and
proxies API calls to the running Python backend — no Flask static serving needed.

---

## 9. Asset Sync Script (stub)

A future `scripts/sync_assets.sh` will automate the copy step:

```bash
#!/usr/bin/env bash
# sync_assets.sh — copy Flask static assets into Worker asset root
set -euo pipefail
RUNTIME="$(cd "$(dirname "$0")/.." && pwd)"
ASSET_ROOT="$RUNTIME/worker/src/assets"

mkdir -p "$ASSET_ROOT/static/css" "$ASSET_ROOT/static/js"
cp "$RUNTIME/ui/static/css/style.css" "$ASSET_ROOT/static/css/"
cp "$RUNTIME/ui/static/js/app.js"     "$ASSET_ROOT/static/js/"
cp "$RUNTIME/ui/templates/index.html" "$ASSET_ROOT/index.html"

# Strip Jinja2 expressions
sed -i 's/{%.*%}//g; s/{{.*}}//g' "$ASSET_ROOT/index.html"

echo "Assets synced to $ASSET_ROOT"
```

This script is a stub — it is created and wired in the S10 one-command boot stage.

---

## 10. Constraints and Non-Goals

| Item | Decision |
|------|----------|
| Workers Sites (`[site]` binding) | **Prohibited** — deprecated, do not use |
| Python runtime in Worker | Not available — Worker runtime is V8/JS only |
| Jinja2 SSR in Worker | Not required — app.js hydrates dynamic values via `/api/status` |
| KV session state in Worker | Out of scope for prototype — Python backend owns session state |
| Full Worker migration (no Python backend) | Post-prototype — not in EXEC-AI-RAPID-002 scope |
| Asset CDN / custom domain | Configured at deploy time — not locked in this document |

---

## 11. References

- Cloudflare Workers Assets (current): https://developers.cloudflare.com/workers/static-assets/
- Workers Assets binding API: https://developers.cloudflare.com/workers/static-assets/binding/
- Migrate from Workers Sites: https://developers.cloudflare.com/workers/static-assets/migrate-from-sites/
- wrangler.toml reference: https://developers.cloudflare.com/workers/wrangler/configuration/
- Existing Cloudflare runtime doc: `docs/cloudflare_runtime.md`
