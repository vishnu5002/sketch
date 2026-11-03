#!/usr/bin/env bash
# Stop and remove the sketchboard user service. Drawings in the browser are untouched.
set -euo pipefail
UNIT=sketchboard.service
UNIT_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$UNIT"
systemctl --user disable --now "$UNIT" 2>/dev/null || true
rm -f "$UNIT_FILE"
systemctl --user daemon-reload
echo "✓ removed $UNIT"
echo "  (start-at-boot for your user's services stays on; turn it off with: loginctl disable-linger $USER)"
