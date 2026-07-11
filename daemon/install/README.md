# Installing the flexi-worker daemon (auto-start on login)

Get your machine key from the web UI (**Machines → Add machine**); it shows the
exact command. The daemon saves it to its config on first run, so later starts
need no arguments.

## Windows (auto-start at login, no window)

1. Copy `flexi-worker.exe` somewhere stable, e.g. `%LOCALAPPDATA%\flexi-worker\`.
2. First run to save config:
   ```
   flexi-worker.exe --account-key <KEY> --backend-url https://<host>
   ```
3. Auto-start at login via Task Scheduler (runs hidden, no console window):
   ```
   schtasks /Create /TN flexi-worker /SC ONLOGON /RL LIMITED ^
     /TR "%LOCALAPPDATA%\flexi-worker\flexi-worker.exe"
   ```
   (Or drop a shortcut in `shell:startup`.)

## Linux (systemd user service, X11 session)

1. Install the binary: `install -Dm755 flexi-worker ~/.local/bin/flexi-worker`
2. First run to save config (as above).
3. Install and enable the user service:
   ```
   mkdir -p ~/.config/systemd/user
   cp flexi-worker.service ~/.config/systemd/user/
   # edit the ExecStart line (key/host) or rely on the saved config
   systemctl --user enable --now flexi-worker.service
   journalctl --user -u flexi-worker -f
   ```

Idle detection uses `libXss` at runtime (X11). On Wayland, idle detection is a
known limitation (see the design doc); Windows is the primary target.

## Config & state

Stored next to `~/.config/flexi-worker/config.toml` (mode 600): the access key,
cached thresholds, and — beside it — `outbox.json` (unsent events, survives
offline) and `state.json` (state-machine persistence for crash recovery).
