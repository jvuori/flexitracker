## Context

The daemon (`daemon/`) is a Rust workspace with a platform idle source (`idle.rs`: Windows `GetLastInputInfo`, Linux XScreenSaver/`libXss`), a state machine, a durable outbox, and a thin `sender.rs` HTTP client to `/ingest` and `/config`. Config is a permission-restricted TOML written on first run from `--account-key`/`--backend-url`. CI (`ci.yml`) only runs `cargo test`; nothing builds or publishes binaries. The web UI's Machines tab shows a raw key and a bare command. The repo is becoming public, so **GitHub Releases** is the distribution channel. Zero cost forever (rule #1) forbids paid code-signing certs and paid CI.

## Goals / Non-Goals

**Goals:**
- One tagged release → Windows + Linux artifacts on a GitHub Release, reproducibly, free.
- Each OS has a real install path that auto-starts on login: Windows portable **and** `setup.exe`; Linux systemd one-liner.
- Authorize in one command (`configure`); prove it works with **zero time data** (`test` → `/whoami`).
- Web hands approved users the right download + exact commands.

**Non-Goals:**
- **macOS is deferred** (no test device). Keep the pipeline, installer layout, `configure`/`test`, and `/whoami` shaped so a macOS target (universal binary, launchd, Gatekeeper trust step, Quartz idle source) drops in later without redesign.
- No paid code signing; unsigned + documented OS trust prompt (SmartScreen) instead.
- No auto-update / background updater (manual re-download for now).
- No Windows MSI/Group-Policy packaging, no Linux distro packages (deb/rpm) — a single portable binary + installer script per OS.
- No Wayland idle support (unchanged known limitation).
- No change to the ingest/rules pipeline or the event schema.

## Decisions

- **Release trigger = git tag `v*`, in a version-controlled workflow.** Consistent with "Cloudflare/infra changes go through Actions" ethos and keeps releases deliberate (not every push). Version derives from the tag / `Cargo.toml`. Unit tests must pass first.
- **Build matrix, native runners.** `windows-latest` (`x86_64-pc-windows-msvc` → `flexitracker.exe`) and `ubuntu-latest` (`x86_64-unknown-linux-gnu`, `libxss-dev` at build; `libXss` at runtime as today). GitHub Actions is free for public repos. No cross-toolchain complexity — each OS builds on its own runner. (A `macos-latest` leg with a `lipo` universal binary is the intended future addition.)
- **Windows: portable AND setup.exe.** Portable = zip of `flexitracker.exe` + `install.ps1` that registers a `schtasks /SC ONLOGON` task (the incantation already in the README), runnable with no admin. `setup.exe` = **Inno Setup** compiled on the Windows runner: copies the exe to `%LOCALAPPDATA%`, registers login auto-start, and optionally accepts the access key to write the config so first launch is already authorized. Inno chosen over WiX/NSIS: trivial to script in CI, no MSI/GPO machinery a personal tool doesn't need.
- **Unsigned is explicit, not hidden.** The Windows SmartScreen ("More info → Run anyway") step is documented in-installer and on the web page. Signing costs money → out (rule #1). The `test` command's positive confirmation is the antidote to the scary prompt: the user proves it works themselves.
- **`configure` vs flags.** `flexitracker configure` prompts for the key (URL pre-baked via a build-time default, e.g. `env!("FLEXITRACKER_BACKEND_URL")` with a `--backend-url` override for self-hosters) and writes the 0600 config, then runs `test`. `--key <k>` makes it non-interactive so the web page can offer a single paste-able line. The existing bare `--account-key` path stays for compatibility.
- **`test` = `/whoami`, read-only, zero data.** New `GET /whoami` (Bearer access-key → `resolveKey` → `{ email, machineId, machineLabel, status }`) writes nothing and emits no event. `flexitracker test` pretty-prints "✓ reachable / key valid / account <email> / machine <label> / no data sent". `/whoami` is a non-browser path, so it needs an **Access bypass** app just like `/ingest`,`/config`,`/health` (documented pitfall) — extend `provision-access.yml`'s path list.
- **`/whoami` widens machine-key read scope, deliberately.** Keys are otherwise write-only; `/whoami` lets a key read the bound account's email + machine label. This is the minimum needed for the reassurance UX and is a conscious, spec'd exception. It also reports `status`, so a daemon on a not-yet-approved account can say so rather than silently failing.
- **Download hosting = GitHub Releases on the public repo.** Plain public URLs (`…/releases/latest/download/<asset>`) → clean web download links, no auth, no Cloudflare asset-shadow pitfall. Depends on the repo actually being public (AGPL text added, history scrubbed) — a prerequisite tracked outside this change.

## Risks / Trade-offs

- **Unsigned binaries scare users.** Mitigated by clear "run anyway" docs and the immediate `test` confirmation; still a real friction point on the free tier. Revisit if funding appears (then sign).
- **Baked backend URL vs self-hosters.** A compiled-in default serves the hosted instance; self-hosters must pass `--backend-url` or rebuild. Documented; `configure --backend-url` covers it.
- **Release/version drift.** Tag, `Cargo.toml` version, and the web "latest" link must agree; derive all from the tag and have the page point at `releases/latest/download` so it never hard-codes a version.
- **Access bypass for `/whoami`.** Forgetting it makes `test` receive the HTML login page parsed as `{}` (documented pitfall); the provisioning script and an E2E check guard it.
