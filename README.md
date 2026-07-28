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

**Auto-start on login, so you never have to launch it by hand:**

- **Linux — systemd user service:**

  ```bash
  cd daemon-py/install
  ./install.sh
  ```

  This installs [`flexitracker.service`](./daemon-py/install/flexitracker.service)
  (which runs `~/.local/bin/flexitracker`, the entrypoint `uv tool install`
  put on `PATH`) as a **user** unit and enables it:

  ```bash
  mkdir -p ~/.config/systemd/user
  cp daemon-py/install/flexitracker.service ~/.config/systemd/user/
  systemctl --user daemon-reload
  systemctl --user enable --now flexitracker.service
  ```

  Check status/logs with `systemctl --user status flexitracker` /
  `journalctl --user -u flexitracker -f`. If the machine doesn't keep a
  session open past logout, run `loginctl enable-linger "$USER"` once so the
  user service can still start.

- **Windows — Scheduled Task at logon:**

  ```powershell
  powershell -ExecutionPolicy Bypass -File daemon-py/install/install.ps1
  ```

  Registers a hidden Scheduled Task (`FlexiTracker`) that starts the daemon at
  sign-in — Windows has no systemd equivalent, so a login task is the
  closest match.

### Alternative: standalone executable (machines that permit running exes)

Download `flexitracker` / `flexitracker.exe` from the project's GitHub
**Releases** page — it bundles its own Python runtime, no `uv` needed. Windows
SmartScreen may warn since it's unsigned (**More info → Run anyway**); if your
org blocks unsigned executables outright, use the `uv` path above instead.

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
