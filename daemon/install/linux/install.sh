#!/usr/bin/env sh
# Install the flexitracker daemon as a systemd user service (Linux, X11 session).
#
#   ./install.sh <ACCESS_KEY>
#
# Self-hosted backend: export FLEXITRACKER_BACKEND_URL=https://your-host before running
# (release builds have the hosted URL baked in, so normally you only need a key).
set -eu

KEY="${1:-${FLEXITRACKER_KEY:-}}"
BIN_DIR="$HOME/.local/bin"
SRC_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"

install -Dm755 "$SRC_DIR/flexitracker" "$BIN_DIR/flexitracker"
install -Dm644 "$SRC_DIR/flexitracker.service" "$UNIT_DIR/flexitracker.service"
systemctl --user daemon-reload

if [ -n "$KEY" ]; then
  # Authorize (writes ~/.config/flexitracker/config.toml) and self-test.
  "$BIN_DIR/flexitracker" configure --key "$KEY" \
    ${FLEXITRACKER_BACKEND_URL:+--backend-url "$FLEXITRACKER_BACKEND_URL"}
  systemctl --user enable --now flexitracker.service
  echo "Installed and started. Logs: journalctl --user -u flexitracker -f"
else
  echo "Installed. Now authorize this machine, then start it:"
  echo "  flexitracker configure --key <ACCESS_KEY>"
  echo "  systemctl --user enable --now flexitracker.service"
fi
