# Installing the flexi-worker daemon

First **sign in to the web app, get approved, and add a machine** (Machines →
Add machine) to obtain this machine's access key. Then install below. Verify with
`flexi-worker test` — it contacts the service and echoes your account **without
sending any activity data**, so you can confirm everything works before the
daemon starts reporting time.

Downloads are published on each release:
`https://github.com/jvuori/flexi-worker-cloud/releases/latest/download/<asset>`.

> The binaries are **unsigned** (a signing certificate costs money; this project
> is free forever). Your OS will warn on first run — the steps below say exactly
> how to allow it.

## Windows

**Option A — setup.exe (recommended).** Download `flexi-worker-setup.exe` and run
it. If SmartScreen appears, click **More info → Run anyway**. The installer can
take your access key during setup, installs to `%LOCALAPPDATA%\flexi-worker`, and
registers a hidden auto-start-at-login task.

**Option B — portable zip.** Download `flexi-worker-windows-x86_64.zip`, extract
it, and from that folder run in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -Key <ACCESS_KEY>
```

This installs the binary, configures it, and sets it to auto-start hidden at
login. Verify:

```powershell
& "$Env:LOCALAPPDATA\flexi-worker\flexi-worker.exe" test
```

## Linux (systemd user service, X11 session)

```sh
curl -fsSL https://github.com/jvuori/flexi-worker-cloud/releases/latest/download/flexi-worker-linux-x86_64.tar.gz | tar xz
./flexi-worker/install.sh <ACCESS_KEY>
```

This installs the binary to `~/.local/bin`, authorizes it, self-tests, and
enables the `flexi-worker` user service. Follow the logs with:

```sh
journalctl --user -u flexi-worker -f
```

Idle detection uses `libXss` at runtime (X11). On Wayland, idle detection is a
known limitation (see the design doc).

## The commands

- `flexi-worker configure --key <KEY>` — save the access key (and, for
  self-hosters, `--backend-url <URL>`) to the config, then self-test. Release
  builds have the backend URL **baked in** (`FLEXI_BACKEND_URL` at build time),
  so you normally only pass the key.
- `flexi-worker test` — connectivity + authorization check; prints your account
  email and this machine's label and sends **no** activity data. Use it any time
  to confirm the daemon can reach the service.

## Config & state

Stored in `~/.config/flexi-worker/config.toml` (mode 600 on Unix): the access
key, cached thresholds, and — beside it — `outbox.json` (unsent events, survives
offline) and `state.json` (state-machine persistence for crash recovery). On
Windows these live under `%APPDATA%\flexi-worker`.
