## Context

The Windows daemon is currently distributed and auto-started as a single
console-subsystem program: the wheel's `[project.scripts]` entry point (used by
`uv tool install`) and the standalone PyInstaller executable (`--console` in
`release.yml`) are both console-subsystem binaries, and `daemon-py/install/install.ps1`
registers a Scheduled Task that launches that same binary. A console-subsystem
process always gets a console window when Windows starts it outside of an
inherited terminal (which is exactly how a Scheduled Task/logon-triggered start
works), so the daemon flashes/keeps a visible black window at every login — it's
supposed to run invisibly. The Task Scheduler `-Hidden` setting only hides the
task's entry in the Task Scheduler UI; it does not suppress the process's own
console window.

Separately, both `install.ps1` (PowerShell) and, more generally, this kind of
run-once install script are a poor fit for the managed/corporate machines that
are the main audience for the no-admin `uv tool install` path — PowerShell
execution policy and script-blocking group policies routinely prevent a
downloaded `.ps1` from running at all, and the same distrust applies to
VBScript. `install.sh` isn't blocked the same way on Linux, but for consistency
this change moves both platforms to the same model: no script file at all, just
copy-pasteable one-line commands, documented where the user is already managing
their machines (the Machines tab), not only in a separate markdown file.

Finally, the daemon has no logging — only ad-hoc `print()`/`print(...,
file=sys.stderr)` calls in `cli.py`, `login.py`, and `outbox.py`. That's fine
when a user runs `flexitracker login`/`test` in a terminal, but once the daemon
runs invisibly (which is the whole point of auto-start, and doubly so once the
windowed executable ships), that output goes nowhere — there is no way to answer
"is it running," "did it see this machine," or "when did my last active/idle
span end" after the fact.

## Goals / Non-Goals

**Goals:**
- Background daemon runs on Windows with no visible console window, on both
  distributions (`uv tool install` and the standalone `.exe`).
- Auto-start setup requires no script file the user has to trust/unblock — a
  single documented command per OS, discoverable inline on the Machines tab.
- The daemon writes a bounded, rotating INFO-level log of its own lifecycle
  (startup, detected machine descriptor, work/idle span start+end) that exists
  whether or not anyone is watching a console, with DEBUG available for
  per-tick/heartbeat detail when actively troubleshooting.

**Non-Goals:**
- No macOS auto-start story (macOS daemon builds don't exist yet — see the
  existing `web-ui` spec's "macOS builds aren't available yet" copy).
- No change to *what* the daemon measures or sends — this is packaging,
  distribution, and observability only.
- No log shipping/central log aggregation — logs stay local to the machine, in
  the same spirit as the config/state/outbox files already do.
- Not replacing the Scheduled-Task-based approach with a Windows *service*
  (`SCM`) — a Run-key/logon-start program is enough here and keeps parity with
  the existing "starts at logon" model instead of introducing service-install
  complexity (which needs admin rights, defeating the no-admin `uv` path).

## Decisions

### 1. Windows auto-start: a single `reg add ...\Run` command, not a Scheduled Task or script
Registering `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` with the daemon's
path is one `reg.exe` invocation the user copies from the Machines tab and pastes
into `cmd.exe` — no admin rights (HKCU is always user-writable), no execution
policy, no script file to unblock. This replaces both `install.ps1`'s
`Register-ScheduledTask` call and the Scheduled Task approach entirely.
**Alternative considered:** `schtasks.exe /create ... /sc onlogon` is also a
single plain command (not PowerShell) and was a candidate, but the user asked
specifically for the registry Run-key approach, which is simpler (one key,
nothing to later query/manage via `Get-ScheduledTask`) and matches how most
lightweight auto-starting user tools register themselves.

### 2. Two Windows executables, one shared entry point, split by PyInstaller build flag
`--console` vs `--windowed` is a PyInstaller/PE-subsystem flag applied at freeze
time to the *same* `pyinstaller_entry.py` — no code fork needed. `release.yml`
gains a second build leg for Windows only (Linux has no console-flash problem:
a systemd user service already runs detached, with no controlling terminal to
begin with) producing a second stable asset
(e.g. `flexitracker-daemon-windows-x86_64.exe`). Docs describe them by role: the
`--console` exe for `login`/`test` (interactive, needs to print to the user's
terminal); the `--windowed` exe for auto-start (registered via the same `reg add`
command, pointed at its path).
**Alternative considered:** a single exe that self-detects and hides its own
console window at runtime (`GetConsoleWindow`+`ShowWindow(SW_HIDE)` via
`ctypes`, guarded by `GetConsoleProcessList()==1` so it never hides a console it
doesn't own). Rejected: it still flashes the window briefly before hiding, the
ownership-detection guard is easy to get subtly wrong, and it would leave a
`--windowed`-subsystem process's `sys.stdout`/`sys.stderr` as `None` unaddressed
anyway — the explicit two-binary split is the standard Windows pattern (same
idea as `pythonw.exe` next to `python.exe`) and is simpler to reason about.

### 3. `uv tool install` gets a second, `gui-scripts` launcher for free
Adding `[project.gui-scripts] flexitracker-daemon = "flexitracker.cli:main"`
next to the existing `[project.scripts] flexitracker = "..."` in
`daemon-py/pyproject.toml` makes `uv`'s/pip's stub generator emit a second,
Windows-subsystem launcher on `PATH` — no new build step, no new code path.
The Run-key command for the `uv` distribution points at this stub instead of
the console one; `login`/`test` docs keep using the console `flexitracker`
command.

### 4. Logging replaces the daemon loop's `print()`, not the interactive commands'
Python stdlib `logging` with a single `RotatingFileHandler` (module-level
logger, e.g. `logging.getLogger("flexitracker")`), configured once in `cli.py`'s
daemon path only. INFO records exactly: process startup (version, backend URL,
config path), the detected machine descriptor (hostname/OS) once at startup,
and each state-machine span start/end transition emitted by `sm.step(...)`.
Per-tick sampling (`source.sample()`/heartbeats) is DEBUG-only, gated by the
existing default level so a default-configuration log stays small and
readable. The daemon-loop warning `print(..., file=sys.stderr)` calls
(threshold-fetch fallback, deferred flush, idle-source error) become
`logger.warning`/`logger.error` calls instead — this is also what makes the
`--windowed` build safe: those were the only places the daemon loop touched
`sys.stderr`, which is `None`-like under a windowed-subsystem frozen exe. A
`StreamHandler` is *additionally* attached to `sys.stderr` only when
`sys.stderr` is not `None` (true for `login`/`test`/a console-subsystem
foreground run, false under `--windowed`), so an interactively-run daemon still
mirrors warnings to the screen exactly as it does today. `login`, `test`,
`--version`, `--help`, and `--simulate` are unchanged — they stay `print()`,
since they are explicit, human-invoked, foreground commands, not the silent
background loop.
**Alternative considered:** logging to `stderr` only and letting the OS capture
it (Task Scheduler/systemd journal). Rejected: the whole motivation is that the
windowed build and the Run-key launch path have no captured stderr at all, and
a rotating file next to the daemon's other local state is inspectable the same
way regardless of which of the four install paths (uv console, uv windowed,
exe console, exe windowed) is in use.

### 5. Log file location: colocated with `config.toml`, not a separate OS-standard log directory
`Config.default_path()` already resolves one base directory per OS (`$HOME` or
`%APPDATA%`) and colocates `state.json`/`outbox.json` next to `config.toml`
inside it. The log file (`flexitracker.log`, rotated to `.1`/`.2`/`.3`) is added
to that same directory rather than introducing a second, "more correct"
OS-specific path (e.g. XDG `$XDG_STATE_HOME` on Linux, `%LOCALAPPDATA%\...\logs`
on Windows). This keeps a single directory to find, inspect, or delete for
every runtime artifact this tool writes, on every OS, with no new
path-resolution logic.
**Alternative considered:** true per-OS state/log directories. Rejected for
this small, single-user, already-established-precedent tool — it would add a
second directory-resolution function used by nothing else, for a benefit
(closer adherence to each OS's convention) that doesn't outweigh "one folder
holds everything flexitracker writes," which is also easier to document as a
first troubleshooting step.

### 6. Log level controlled by an environment variable, not a new CLI flag
`FLEXITRACKER_LOG_LEVEL` (default `INFO`) is read once at daemon startup.
Rotation is fixed (not configurable): `maxBytes=2_000_000, backupCount=3` (≤8MB
total), generous enough for INFO-level lifecycle logging across many days and
bounded enough to never become a disk-space concern, consistent with the "zero
cost, forever"/no-surprise-growth ethos elsewhere in this project.
**Alternative considered:** a `--debug`/`--log-level` CLI flag. Rejected: this
is a rarely-used diagnostic knob for a background process the user doesn't
normally pass flags to (it's launched by a Run key/systemd, not by hand); an
env var set once in the unit file/registry command (or briefly, ad hoc, in a
terminal) is simpler and doesn't grow the documented CLI surface in `HELP`.

## Risks / Trade-offs

- **[Risk]** A registry Run-key entry is a classic persistence mechanism, and
  some hardened/managed-machine security baselines flag or periodically sweep
  `HKCU...\Run`. → **Mitigation:** it's documented as a plain command the user
  runs themselves (not silently written by an installer), which is the same
  transparency goal as removing the scripts in the first place; a machine whose
  policy blocks user Run-key writes needs the same IT conversation any other
  auto-starting user tool would.
- **[Risk]** Doubling the Windows PyInstaller build adds CI time and a second
  release asset to keep in sync (per `CLAUDE.md`'s asset-name/download-button
  coupling). → **Mitigation:** it's one additional matrix leg (Windows only,
  Linux unaffected), and both asset names/paths are updated in the same change
  that adds them (`release.yml`, `render.ts`, both READMEs).
- **[Risk]** An uncaught exception in the `--windowed` build has no console to
  show a traceback on. → **Mitigation:** wrap the daemon loop's `run()` body in
  a top-level `try/except Exception` that does `logger.exception(...)` before
  exiting non-zero, so the rotating log file captures the traceback even though
  nobody sees a console.
- **[Risk]** Removing `install.ps1`/`install.sh` could strand a reference to
  them somewhere undiscovered. → **Mitigation:** grep the repo for
  `install.ps1`/`install.sh` as part of implementation and update every hit
  (top-level `README.md`, `daemon-py/install/README.md`) in this same change.
- **[Risk]** Colocating the log with `config.toml` diverges from strict
  per-OS log-directory convention some users may expect. → **Mitigation:**
  documented explicitly (Decision 5) as a deliberate simplicity trade-off
  consistent with existing `state.json`/`outbox.json` placement, not an
  oversight; revisit only if a real multi-user/system-service deployment mode
  is ever added (it isn't planned).

## Migration Plan

1. Add the logging module and wire it into the daemon loop in `cli.py` (INFO
   lifecycle events, DEBUG heartbeats, `stderr` mirroring only when
   `sys.stderr` is present); leave `login`/`test`/`--version`/`--help`/
   `--simulate` on `print()`.
2. Add the `[project.gui-scripts]` entry to `daemon-py/pyproject.toml`; verify
   locally that `uv tool install` produces both launcher stubs on Windows.
3. Extend `release.yml`'s Windows PyInstaller leg with a second `--windowed`
   build and stable asset name; verify the frozen windowed exe starts the
   daemon loop with no window and no crash (manual smoke on a Windows box/VM).
4. Update `renderInstallSteps` in `backend/src/ui/render.ts` to present the
   per-OS auto-start command inline with a copy button, keyed off the same
   OS-detection already used for the download link.
5. Remove `daemon-py/install/install.ps1` and `daemon-py/install/install.sh`;
   rewrite `daemon-py/install/README.md` and the top-level `README.md`
   auto-start sections to the documented-command form; keep
   `flexitracker.service` as the one file a Linux user copies into place.
6. No data migration, no backend/schema changes — rollback is a plain revert
   of the above commits.

## Open Questions

- Exact rotation size/backup count (proposed: 2MB × 3 backups) — adjust at
  implementation time if INFO-level volume in practice differs from estimate.
- Whether the Windows Run-key command should be scoped to `HKCU` only (proposed,
  no admin needed) vs. also documenting an `HKLM` (all-users) variant for
  shared machines — out of scope unless a shared-machine use case surfaces.
