## 1. Daemon logging

- [x] 1.1 Add a `flexitracker.logging_setup` module: a `configure_logging(config_path, level=None)` that creates `logging.getLogger("flexitracker")` with a `RotatingFileHandler` at `config_path.with_name("flexitracker.log")` (`maxBytes=2_000_000, backupCount=3`), level from `FLEXITRACKER_LOG_LEVEL` env var (default `INFO`), and a `StreamHandler(sys.stderr)` at `WARNING` attached only when `sys.stderr is not None`.
- [x] 1.2 In `cli.py`'s daemon path (`run()`, the branch after the `login`/`test` checks), call `configure_logging(config_path)` once before entering the sample loop; log INFO records for: process start (version, backend URL, config path) and the detected machine descriptor (`machine_desc()`), once each at startup.
- [x] 1.3 Log each state-machine span start/end transition (the events returned by `sm.step(...)`/`sm.recover(...)`) at INFO; log each raw tick/sample (`source.sample()` result) at DEBUG only.
- [x] 1.4 Replace the daemon loop's `print(..., file=sys.stderr)` warning/error calls (thresholds-fetch fallback, deferred outbox flush, idle-source error, dropped-outbox-events) with `logger.warning`/`logger.error` calls; leave `login`, `test`, `--version`, `--help`, and `--simulate` output as plain `print()`, unchanged.
- [x] 1.5 Wrap the daemon loop body in a top-level `try/except Exception` that does `logger.exception(...)` before returning a non-zero exit code, so an unexpected crash under the windowed (no-console) build still lands in the log file.
- [x] 1.6 Add/extend unit tests covering: INFO log contains startup + a span transition and does not contain a heartbeat-only line at default level; DEBUG level does include heartbeat lines; rotation triggers past the size threshold.

## 2. Two Windows executables (standalone PyInstaller distribution)

- [x] 2.1 In `.github/workflows/release.yml`'s `exe` job, add a second Windows-only build step (matrix leg or extra step gated on `runner.os == 'Windows'`) running `pyinstaller --onefile --windowed --name flexitracker-daemon ...` with the same excludes/`--copy-metadata` as the existing `--console` build.
- [x] 2.2 Rename/attach the new binary under a stable asset name, e.g. `flexitracker-daemon-windows-x86_64.exe`, alongside the existing `flexitracker-windows-x86_64.exe`.
- [ ] 2.3 Manually verify (Windows box/VM) the windowed exe starts the daemon loop with no visible window and no crash, and that a warning condition (e.g. force a deferred flush) lands in `flexitracker.log`.

## 3. `uv tool install` gets a windowed launcher

- [x] 3.1 Add `[project.gui-scripts]` with `flexitracker-daemon = "flexitracker.cli:main"` to `daemon-py/pyproject.toml`, next to the existing `[project.scripts] flexitracker = "flexitracker.cli:main"`.
- [x] 3.2 Verify locally that `uv tool install --reinstall .` (or an editable/local build) places both `flexitracker` and `flexitracker-daemon` launchers on `PATH` on Windows, and that running `flexitracker-daemon` (no args) starts the daemon loop with no console window.

## 4. Windows auto-start via registry command (remove PowerShell script)

- [x] 4.1 Delete `daemon-py/install/install.ps1`.
- [x] 4.2 Document the exact `reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v FlexiTracker /t REG_SZ /d "<path>" /f` command in `daemon-py/install/README.md`, shown once for the `uv`-installed windowed launcher path and once for the standalone windowed `.exe` path.
- [x] 4.3 Document the corresponding removal command (`reg delete "HKCU\...\Run" /v FlexiTracker /f`) for uninstall/troubleshooting.

## 5. Linux auto-start via documented commands (remove install.sh)

- [x] 5.1 Delete `daemon-py/install/install.sh`.
- [x] 5.2 Update `daemon-py/install/README.md` to show the manual `mkdir -p ~/.config/systemd/user`, `cp flexitracker.service ~/.config/systemd/user/`, `systemctl --user daemon-reload`, `systemctl --user enable --now flexitracker.service`, and `loginctl enable-linger "$USER"` commands as the only Linux auto-start path (keep `flexitracker.service` itself — it's a declarative unit, not a script).

## 6. Inline auto-start instructions on the Machines tab

- [x] 6.1 In `backend/src/ui/render.ts`'s `renderInstallSteps`, add a step 4 ("Auto-start on login") that renders the OS-appropriate command block (from `detectOS()`): the Windows `reg add` command for Windows, the Linux `systemctl --user` command sequence for Linux, each with a copy button matching the existing `copy(...)` pattern used for install/login commands.
- [x] 6.2 Remove/replace the current "It then auto-starts on login... install guide" external-link sentence with the inline command block; keep the SmartScreen unsigned-binary trust-step note inline as well (currently only in the external doc).
- [x] 6.3 Add/update a Vitest for `render.ts` (or existing UI test coverage) asserting the auto-start command block renders and matches the detected OS.

## 7. Top-level docs

- [x] 7.1 Update the top-level `README.md` "Auto-start on login" section to drop references to `install.ps1`/`install.sh` and describe the documented-command approach (linking to the rewritten `daemon-py/install/README.md`).
- [x] 7.2 Grep the repo for any remaining `install.ps1`/`install.sh` references (docs, CI, scripts) and update or remove them.

## 8. Verification

- [x] 8.1 `uv run pytest` in `daemon-py/` (logging unit tests + existing suite).
- [x] 8.2 `npm run typecheck` and `npm test` in `backend/` (Machines-tab UI change).
- [x] 8.3 `openspec validate silent-startup-and-logging --strict` passes.
