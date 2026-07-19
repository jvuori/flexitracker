## Why

The daemon compiles and is unit-tested, but there is no way for a normal person to **get it, authorize it, confirm it works, and have it auto-start** — the only guidance is a hand-run `cargo` build plus prose in `daemon/install/README.md`. To make this a product, the build must be automated and published, each OS needs a real install path (Windows portable **and** a `setup.exe`, Linux a copy/paste installer), authorizing the daemon must be one productized command, and the user must be able to **prove connectivity without sending any time data**. The web app must hand users the right download and the exact commands, right after they are approved.

## What Changes

- **Build & publish pipeline**: a tagged release triggers a GitHub Actions matrix that builds the daemon for **Windows (x86_64)** and **Linux (x86_64)** and publishes signed-off artifacts to a **GitHub Release** (the public repo is the distribution channel). Unit tests still gate; releases are cut only from tags.
- **Windows**: a **portable zip** (exe + a one-click auto-start script registering a login task) **and** a real **`setup.exe`** (Inno Setup) that installs, registers auto-start on login, and can capture the access key to write the config. Binaries are **unsigned**; the SmartScreen "More info → Run anyway" step is documented (no paid cert — rule #1).
- **Linux**: a **copy/paste one-liner** that installs the binary and enables the existing **systemd user service**, then runs configure.
- **Productized authorization**: a `flexitracker configure` command (interactive, or `--key` for the web-copied one-liner) that writes the permission-restricted config; the backend URL is baked into the release build so users normally supply only the key.
- **Connectivity self-test with no data**: a `flexitracker test` command that calls a new **`GET /whoami`** (access-key auth, read-only) and prints the bound **account email and this machine's label**, proving the key works and is bound to the right account **without emitting any activity event**.
- **Web onboarding**: after approval, the Machines flow SHALL show an **OS-detected download** plus the exact `configure` and `test` commands (key pre-filled), and link to per-OS auto-start instructions.

## Non-Goals

- **macOS is deferred** (no test device available). The pipeline, installer layout, `configure`/`test` commands, and `/whoami` are designed so a macOS target (universal binary, launchd LaunchAgent, Gatekeeper trust step, a Quartz idle source) can be added later without redesign, but it is out of scope here.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `deployment-pipeline`: add a tag-triggered, version-controlled release job that builds Windows/Linux artifacts and publishes them to a GitHub Release, within the free tier.
- `activity-daemon`: add `configure` and `test`/`--check` subcommands; distribute per-OS installers (Windows portable + Inno `setup.exe`, Linux systemd one-liner) that auto-start on login; document the unsigned-binary trust steps.
- `identity-and-access`: add a read-only `GET /whoami` access-key endpoint that echoes the bound account email and machine label and sends/stores nothing.
- `web-ui`: an OS-detected download + configure + test onboarding surface presented to approved users.

## Impact

- **Pipeline** (`.github/workflows/`): new `release.yml` on `push: tags: v*` with a `windows-latest`/`ubuntu-latest` matrix; `cargo build --release` per target; Inno Setup compile on Windows; package zip/tar; `gh release` upload. CI unit-test job still runs.
- **Daemon** (`daemon/crates/flexitracker-daemon/src`): `configure`/`test` subcommands in `main.rs`; a `whoami` client call in `sender.rs`; backend URL default via build-time env.
- **Installers** (`daemon/install/`): Windows `install.ps1` + `flexitracker.iss` (Inno); Linux `install.sh` (reuses `flexitracker.service`); refreshed README per OS with the unsigned-binary steps.
- **Backend** (`backend/src/index.ts`): `GET /whoami` (Bearer key → `resolveKey` → account email + machine label; no writes). Reuses the existing `/ingest` Access bypass class of non-browser paths (must be Access-bypassed like `/ingest`,`/config`,`/health`).
- **UI** (`backend/src/ui/render.ts`): Machines/onboarding shows OS-detected download button(s), the `configure --key …` and `test` commands, and per-OS auto-start help.
- **Depends on** `account-registration-approval`: the onboarding surface and key issuance assume the approved-`active` lifecycle; `whoami` may also report a non-active status so a daemon can say "account not active yet."
