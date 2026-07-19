#!/usr/bin/env sh
# Install the flexi-worker daemon as a systemd user service (Linux, X11 session).
#
#   ./install.sh <ACCESS_KEY>
#
# Self-hosted backend: export FLEXI_BACKEND_URL=https://your-host before running
# (release builds have the hosted URL baked in, so normally you only need a key).
set -eu

KEY="${1:-${FLEXI_KEY:-}}"
BIN_DIR="$HOME/.local/bin"
SRC_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"

install -Dm755 "$SRC_DIR/flexi-worker" "$BIN_DIR/flexi-worker"
install -Dm644 "$SRC_DIR/flexi-worker.service" "$UNIT_DIR/flexi-worker.service"
systemctl --user daemon-reload

if [ -n "$KEY" ]; then
  # Authorize (writes ~/.config/flexi-worker/config.toml) and self-test.
  "$BIN_DIR/flexi-worker" configure --key "$KEY" \
    ${FLEXI_BACKEND_URL:+--backend-url "$FLEXI_BACKEND_URL"}
  systemctl --user enable --now flexi-worker.service
  echo "Installed and started. Logs: journalctl --user -u flexi-worker -f"
else
  echo "Installed. Now authorize this machine, then start it:"
  echo "  flexi-worker configure --key <ACCESS_KEY>"
  echo "  systemctl --user enable --now flexi-worker.service"
fi
