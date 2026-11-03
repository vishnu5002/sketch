#!/usr/bin/env bash
# Development: Vite on :5184 with /api proxied to a dev API on :5185.
# The dev API uses its own database (~/.local/share/sketchboard/dev), never your real drawings.
set -euo pipefail
NODE_DIR="${SKETCHBOARD_NODE_DIR:-$HOME/.local/share/sketchboard/node/bin}"
export PATH="$NODE_DIR:$PATH"
cd "$(dirname "$0")"
PORT=5185 API_ONLY=1 BACKUPS=0 EXTRA_PORTS=5184 SKETCHBOARD_DATA="${SKETCHBOARD_DEV_DATA:-$HOME/.local/share/sketchboard/dev}" \
  node --watch-path=server --watch-path=deploy deploy/serve.mjs &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT
npm run dev -- --port 5184 --strictPort
