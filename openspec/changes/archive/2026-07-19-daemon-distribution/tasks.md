## 1. `configure` and `test` subcommands

- [x] 1.1 Build-time default backend URL via `option_env!("FLEXITRACKER_BACKEND_URL")` (releases bake it in; falls back to requiring `--backend-url`); `--backend-url` override kept.
- [x] 1.2 `flexitracker configure` (interactive prompt for the key; `--key <k>` non-interactive) writes the 0600 config, then runs the self-test.
- [x] 1.3 `flexitracker test` (alias `--check`) calls `/whoami` and prints reachability, key validity, bound account email, machine label, and status — emitting **no** activity event; fails if the account is not active.
- [x] 1.4 `whoami(base, key)` added to `sender.rs`; existing `--account-key` bootstrap path still works.
- [x] 1.5 `--help`/`print_help` updated for the subcommands.

## 2. Backend: `/whoami`

- [x] 2.1 `GET /whoami` in `backend/src/index.ts` (Bearer key → `whoamiForKey`) returns `{ email, machineId, machineLabel, status, active }`; no writes, no events; 401 on unknown key. (Resolves even a revoked key so a disabled account is told its status rather than a bare 401; `/ingest` still rejects revoked keys.)
- [x] 2.2 Access-bypass path list extended to include `whoami` in `setup-access-bypass.mjs`.
- [x] 2.3 E2E assertions in `e2e/smoke.mjs`: `/whoami` echoes account + machine and rejects a bad key; verified live that no activity data is written (status `unknown`, worked 0 after test).

## 3. Release build & publish pipeline

- [x] 3.1 `.github/workflows/release.yml` on `push: tags: 'v*'`, gated on the reusable unit-test job (`ci.yml`).
- [x] 3.2 Matrix: `windows-latest` and `ubuntu-latest` (installs `libxss-dev`/`libx11-dev`). macOS leg deferred.
- [x] 3.3 Packages: Linux tar.gz (binary + `install.sh` + `flexitracker.service` + README); Windows portable zip (exe + `install.ps1`) and `setup.exe` (Inno via chocolatey).
- [x] 3.4 Publishes to the tag's GitHub Release via `softprops/action-gh-release` with stable asset names → durable `releases/latest/download/<asset>` links.
- [x] 3.5 A `version` job fails the release unless the tag matches the workspace `Cargo.toml` version, keeping `--version`, the tag, and assets in sync.

## 4. Windows installer (portable + setup.exe)

- [x] 4.1 `daemon/install/install.ps1`: copies exe to `%LOCALAPPDATA%\flexitracker`, optional `-Key` runs `configure`, registers a `schtasks /SC ONLOGON /RL LIMITED` task that launches via a `launch.vbs` so the console daemon runs with **no visible window**.
- [x] 4.2 `daemon/install/flexitracker.iss` (Inno Setup): installs exe per-user, prompts for the key → `configure`, writes the hidden `launch.vbs`, registers the login task; uninstall removes the task. Compiled on the Windows runner.
- [x] 4.3 SmartScreen "More info → Run anyway" documented in `install.ps1` and the README.

## 5. Linux installer (systemd one-liner)

- [x] 5.1 `daemon/install/linux/install.sh`: installs the binary to `~/.local/bin`, installs+enables the `flexitracker` user unit (now argless — reads the config `configure` writes), runs `configure`; copy/paste one-liner in the README. `sh -n` syntax-checked.

## 6. Web onboarding

- [x] 6.1 `renderMachines`/`renderSetup` in `render.ts` OS-detect (Windows/Linux; macOS shown as not-yet-available) and present the matching **Download** button(s) at `releases/latest/download/…`.
- [x] 6.2 Shows the exact `flexitracker configure --key <key>` line (key pre-filled, copy button) and `flexitracker test`, plus a link to the install guide. Verified in-browser.
- [x] 6.3 Flow framed on the Machines tab: add → download → authorize → verify → auto-start.

## 7. Docs

- [x] 7.1 `daemon/install/README.md` rewritten into Windows / Linux copy/paste sections covering download, the unsigned-app trust step, configure, test, and auto-start.
- [x] 7.2 Documents the `FLEXITRACKER_BACKEND_URL` build default and the self-hoster `--backend-url` override.

## 8. Verify

- [x] 8.1 `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` all green; backend typecheck + 60 tests green; `e2e/smoke.mjs` ALL PASS. Drove `configure`/`test` against a live local backend: printed account + machine, exit 0; bad key → 401 exit 1; confirmed no activity data written.
- [x] 8.2 Verified: tag `v0.1.0` ran `release.yml` green (version gate matched `Cargo.toml`), producing all three assets under stable names — `flexitracker-linux-x86_64.tar.gz`, `flexitracker-windows-x86_64.zip`, `flexitracker-setup.exe` — with `PROD_BASE_URL` baked in. NOTE: `releases/latest/download/...` still 404s for users while the repo is **private**; the download links require making it public.
- [~] 8.3 Full Windows install/auto-start round-trip requires a Windows machine — not runnable here. The `configure`/`test`/`/whoami` path (the load-bearing logic) is verified on Linux; the Windows packaging is standard schtasks + Inno.
