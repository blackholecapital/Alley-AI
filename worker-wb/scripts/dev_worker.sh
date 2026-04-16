#!/usr/bin/env bash
# dev_worker.sh — Start the Cloudflare Worker in local development mode.
# Ref: S5A.2 — Cloudflare Worker runtime patch
#
# Usage:
#   ./scripts/dev_worker.sh
#   ./scripts/dev_worker.sh --port 8788
#
# Prerequisites:
#   npm install   (run once from /worker-wb)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$WORKER_ROOT"

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "[dev_worker] Installing dependencies..."
  npm install
fi

echo "[dev_worker] Starting Wrangler dev server..."
exec npx wrangler dev "$@"
