## Why

The Windows daemon always runs as a console-subsystem process, so the Scheduled
Task registered by `install.ps1` (and any manual auto-start of the standalone
`.exe`) flashes/keeps a black terminal window at every login — the daemon is
supposed to run invisibly. Separately, `install.ps1` and the "hidden Scheduled
Task" approach are script-based, and PowerShell scripts (execution policy) and
VBScript are routinely blocked on corporate/managed machines, which is exactly
the audience most likely to need the `uv`-based, no-admin install path. Auto-start
setup should work as plain, copy-pasteable OS commands with no script file to
distrust, discoverable on the same web page where a user already manages their
machines. Finally, the daemon has no logging at all beyond ad-hoc `print()` to
stdout/stderr — invisible once it's not run in a visible console — making it hard
to diagnose "is it actually running / did it see my machine / when did it think I
went idle" after the fact.

## What Changes

- Remove `daemon-py/install/install.ps1` (PowerShell) and do not introduce any
  VBScript equivalent. Windows auto-start is documented as a single copy-pasteable
  `reg add ... \Run` command (no script file, no execution-policy prompt),
  parameterized only by the path to the daemon executable.
- Remove `daemon-py/install/install.sh`; Linux auto-start is likewise documented
  as copy-pasteable `systemctl --user` commands (the unit file
  `flexitracker.service` itself is kept — it's a declarative unit, not a script —
  as the one file a user copies into place).
- Add a `[project.gui-scripts]` entry to `daemon-py/pyproject.toml` so
  `uv tool install flexitracker` places a second, windowed-subsystem launcher
  (no console ever) on `PATH` alongside the existing console one. The registry
  auto-start command points at the windowed launcher; `login`/`test` keep using
  the console one.
- Build a second, `--windowed` standalone PyInstaller executable for Windows in
  `release.yml` (alongside the existing `--console` one) and attach it to the
  GitHub Release under its own stable asset name. Document that the console exe
  is for `login`/`test` (interactive) and the windowed exe is for auto-start
  (registered via the same `reg add` command, pointed at its path instead).
- Move the per-OS auto-start instructions (Windows `reg add` command, Linux
  `systemctl --user` commands) inline into the Machines tab (`renderInstallSteps`
  in `backend/src/ui/render.ts`), copy-button included like the existing
  install/login commands, instead of only linking out to
  `daemon-py/install/README.md`.
- Add rotating file logging to the daemon (Python stdlib `logging` +
  `RotatingFileHandler`), replacing the informational `print()` calls in
  `cli.py`/`login.py`/`outbox.py`. INFO level captures lifecycle events only
  (startup, the detected machine descriptor, and state-machine span start/end
  transitions); per-tick heartbeats/polling are DEBUG-only so a default-level log
  stays readable. Errors/warnings keep going to stderr as today in addition to the
  log file, so an interactively-run `test`/`login`/foreground daemon still shows
  problems immediately.

## Capabilities

### Modified Capabilities
- `activity-daemon`: replaces the script-based ("setup.exe"/login-task-script)
  auto-start requirement with a script-free, documented-command auto-start
  (Windows `reg add`, Linux `systemctl --user`) across both distributions (`uv`
  gui-scripts launcher, standalone windowed `.exe`); adds a rotating
  file-logging requirement (INFO for lifecycle events, DEBUG for heartbeats).
- `web-ui`: the Machines tab's onboarding surface presents the per-OS auto-start
  command inline (copy-pasteable) instead of only linking to external docs.

## Impact

- `daemon-py/pyproject.toml` (new `gui-scripts` entry), `daemon-py/src/flexitracker/`
  (new logging module; `cli.py`, `login.py`, `outbox.py` swap `print()` for
  `logging` calls), `daemon-py/pyinstaller_entry.py` (a second entry point or a
  build-time flag for the windowed build).
- `.github/workflows/release.yml` (second PyInstaller build matrix leg + a new
  stable asset name for the windowed Windows exe).
- `daemon-py/install/` (`install.ps1` and `install.sh` removed; `README.md`
  rewritten to instructions-only; `flexitracker.service` kept).
- `backend/src/ui/render.ts` (`renderInstallSteps`: inline per-OS auto-start
  command + copy button).
- Top-level `README.md` (auto-start section updated to match).
- `openspec/specs/activity-daemon/spec.md`, `openspec/specs/web-ui/spec.md` (delta
  specs in this change).
