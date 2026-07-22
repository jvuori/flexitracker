#!/bin/sh
# FlexiTracker (Linux) — install the daemon into your user profile with uv
# (no admin, no compiler) and enable it as a systemd user service on login.
set -e

if ! command -v uv >/dev/null 2>&1; then
    echo "uv is required: https://docs.astral.sh/uv/  (curl -LsSf https://astral.sh/uv/install.sh | sh)" >&2
    exit 1
fi

echo "Installing flexitracker with uv…"
uv tool install --upgrade flexitracker

BIN="$HOME/.local/bin/flexitracker"
if [ ! -x "$BIN" ]; then
    # Fall back to whatever uv put on PATH.
    BIN="$(command -v flexitracker || echo "$BIN")"
fi

# Authorize this machine if not already configured.
if [ ! -f "$HOME/.config/flexitracker/config.toml" ]; then
    echo
    echo "Authorize this machine (paste the access key from the web app):"
    "$BIN" configure
fi

# Install + enable the user service.
mkdir -p "$HOME/.config/systemd/user"
cp "$(dirname "$0")/flexitracker.service" "$HOME/.config/systemd/user/flexitracker.service"
systemctl --user daemon-reload
systemctl --user enable --now flexitracker.service

echo
echo "Installed and started. Check with:  flexitracker test"
echo "Auto-starts on login. (You may need: loginctl enable-linger \"$USER\")"
