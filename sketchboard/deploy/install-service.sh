#!/usr/bin/env bash
# Build sketchboard and run it as a systemd user service that starts at boot.
#   PORT=5183 ./deploy/install-service.sh      (re-run any time to update)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-5183}"
UNIT=sketchboard.service
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

# Find Node 22.5+ (it has SQLite built in): $NODE, then sketchboard's own copy, then PATH, then nvm.
node_ok() { [ -x "$1" ] && "$1" -e 'require("node:sqlite")' >/dev/null 2>&1; }
NODE_BIN="${NODE:-}"
if ! node_ok "${NODE_BIN:-/nonexistent}"; then
  NODE_BIN=""
  for cand in "$HOME/.local/share/sketchboard/node/bin/node" "$(command -v node || true)" $(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -rV); do
    if [ -n "$cand" ] && node_ok "$cand"; then NODE_BIN="$cand"; break; fi
  done
fi
[ -n "$NODE_BIN" ] || { echo "error: Node 22.5+ (with node:sqlite) not found. Set NODE=/path/to/node and re-run." >&2; exit 1; }
# Keep the stable symlink path (…/sketchboard/node) so upgrading Node is just repointing it.
case "$NODE_BIN" in "$HOME/.local/share/sketchboard/node/"*) ;; *) NODE_BIN="$(readlink -f "$NODE_BIN")" ;; esac
export PATH="$(dirname "$NODE_BIN"):$PATH"
echo "• node: $NODE_BIN ($("$NODE_BIN" --version))"

echo "• building…"
cd "$APP_DIR"
[ -d node_modules ] || npm ci
npm run build >/dev/null
echo "  built $APP_DIR/dist"

echo "• writing $UNIT_DIR/$UNIT"
mkdir -p "$UNIT_DIR"
cat >"$UNIT_DIR/$UNIT" <<EOF
[Unit]
Description=sketchboard — local infinite-canvas whiteboard (http://localhost:$PORT)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/deploy/serve.mjs
Environment=PORT=$PORT
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=2
TimeoutStopSec=10
NoNewPrivileges=true
UMask=0077

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable "$UNIT" >/dev/null
systemctl --user restart "$UNIT"

# Lingering starts the user's services at boot, not at first login.
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
  if loginctl enable-linger "$USER" 2>/dev/null; then
    echo "• enabled start at boot (linger)"
  else
    echo "! could not enable start-at-boot automatically. Run once:"
    echo "    sudo loginctl enable-linger $USER"
    echo "  (until then it starts when you log in)"
  fi
else
  echo "• start at boot already enabled (linger)"
fi

for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:$PORT/healthz" >/dev/null 2>&1; then
    echo "✓ sketchboard is running at http://localhost:$PORT"
    echo "  drawings are stored in ${SKETCHBOARD_DATA:-$HOME/.local/share/sketchboard}/sketchboard.db"
    exit 0
  fi
  sleep 0.2
done
echo "✗ service did not come up — see: journalctl --user -u $UNIT -n 50" >&2
exit 1
