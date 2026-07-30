# FlexiTracker

Personal flextime/saldo tracker. A minimal Python daemon captures computer
activity; a serverless Cloudflare backend turns it into trustworthy per-week
working-time numbers to transcribe into an official time system.

See [`CLAUDE.md`](./CLAUDE.md) for the operating rules (chief among them: **zero
cost, forever**) and [`openspec/changes/flexitracker/`](./openspec/changes/flexitracker/)
for the full architecture, specs, and task plan.

## Layout

| Path        | What |
|-------------|------|
| `backend/`  | Cloudflare Worker (TypeScript + Hono) and the per-account Durable Object (SQLite). |
| `daemon-py/`| Pure-Python daemon (the agent): state machine, outbox, sender, ctypes idle. Installs with `uv`. |
| `ui/`       | Node-free HTMX static assets for Cloudflare Pages. |
| `docs/`     | Cross-cutting docs, incl. the [wire schema](./docs/wire-schema.md). |

## Install the daemon (end users)

The daemon is what actually runs on a work machine and reports activity. There
are two distributions — full details, incl. Windows, live in
[`daemon-py/install/README.md`](./daemon-py/install/README.md).

### Recommended: `uv tool install` (all platforms, no admin rights, no compiler)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # skip if uv is already installed
uv tool install flexitracker
flexitracker login    # opens a browser to authorize this machine
flexitracker test     # connectivity check, sends no data
```

On a headless/scripted box, authorize with a key from the web app's "Add
machine" button instead of a browser: `flexitracker login --key <ACCESS_KEY>`.

**Auto-start on login, so you never have to launch it by hand:** every step
below is a single command you run and can read before pasting — no installer
script (PowerShell, VBScript, or shell) is ever downloaded and run on your
behalf. The same commands, matched to your detected OS, also render inline on
the web app's Machines tab.

- **Linux — systemd user service:**

  ```bash
  mkdir -p ~/.config/systemd/user
  cp daemon-py/install/flexitracker.service ~/.config/systemd/user/
  systemctl --user daemon-reload
  systemctl --user enable --now flexitracker.service
  ```

  This runs `~/.local/bin/flexitracker`, the entrypoint `uv tool install` put
  on `PATH`, as a **user** unit. Check status/logs with
  `systemctl --user status flexitracker` /
  `journalctl --user -u flexitracker -f`. If the machine doesn't keep a
  session open past logout, run `loginctl enable-linger "$USER"` once so the
  user service can still start.

- **Windows — a registry Run-key command:**

  ```
  reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v FlexiTracker /t REG_SZ /d "\"%USERPROFILE%\.local\bin\flexitracker-daemon.exe\"" /f
  ```

  `uv tool install` places two commands on `PATH`: the console `flexitracker`
  used above for `login`/`test`, and a second, windowless `flexitracker-daemon`
  command this points at — it runs the same daemon with no console window, ever.
  No admin rights needed (it only touches your own user's registry). To undo:
  `reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v FlexiTracker /f`.

### Alternative: standalone executables (machines that permit running exes)

Download from the project's GitHub **Releases** page — it bundles its own
Python runtime, no `uv` needed. Windows ships **two** executables:
`flexitracker-windows-x86_64.exe` (console, for `login`/`test`) and
`flexitracker-daemon-windows-x86_64.exe` (windowless, for auto-start — same
`reg add` command as above, pointed at wherever you saved it). Linux has one,
`flexitracker-linux-x86_64`, used for everything. Windows SmartScreen may warn
since they're unsigned (**More info → Run anyway**); if your org blocks
unsigned executables outright, use the `uv` path above instead. Full details:
[`daemon-py/install/README.md`](./daemon-py/install/README.md).

## Develop

Backend (Node 20+ recommended for the latest wrangler):

```bash
cd backend
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run dev         # wrangler dev (local simulation)
```

Daemon (Python, via uv):

```bash
cd daemon-py
uv sync
uv run pytest      # unit tests + the 24 behavioural vectors
```

## Deploy

QA deploys automatically on push to `main`. PROD deploys **only** on an explicit
manual trigger, gated on the QA end-to-end suite passing.
