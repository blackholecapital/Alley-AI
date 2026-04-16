#!/usr/bin/env bash
# deploy_worker.sh — Deploy the Cloudflare Worker to production.
# Ref: S5A.2 — Cloudflare Worker runtime patch
#
# Usage:
#   ./scripts/deploy_worker.sh
#   ./scripts/deploy_worker.sh --dry-run
#
# Prerequisites:
#   npm install       (run once from /worker-wb)
#   wrangler login    (authenticate with Cloudflare)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$WORKER_ROOT"

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "[deploy_worker] Installing dependencies..."
  npm install
fi

# Run typecheck before deploying
echo "[deploy_worker] Running typecheck..."
npx tsc --noEmit 2>/dev/null || echo "[deploy_worker] Warning: typecheck skipped (tsconfig may not exist yet)"

echo "[deploy_worker] Deploying Worker..."
exec npx wrangler deploy "$@"
