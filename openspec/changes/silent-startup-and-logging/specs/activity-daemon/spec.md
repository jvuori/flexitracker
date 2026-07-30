## MODIFIED Requirements

### Requirement: Minimal footprint and auto-start distribution
The daemon SHALL run invisibly with minimal resource use and SHALL be
distributed as a plain executable accompanied by copy-pasteable, script-free
instructions (no PowerShell, VBScript, or shell installer script) to auto-start
it on user login.

#### Scenario: Auto-start on login
- **WHEN** the user logs into the operating system after installing per the instructions
- **THEN** the daemon starts automatically without a visible window

### Requirement: Productized per-OS installation with auto-start
The daemon SHALL be distributed with a productized, auto-starting install path
for each supported OS, with no bundled installer script (no PowerShell,
VBScript, or shell script) required for auto-start:

- **Windows**: each release ships two executables — a console-subsystem
  executable for `login`/`test` and a windowed-subsystem executable (no
  console ever) for auto-started background runs — and the `uv
  tool install` path likewise provides both a console launcher and a
  windowed-subsystem launcher on `PATH`. Auto-start is configured by a single
  documented `reg add` command (adding the chosen windowed entry point's path
  to the current user's `Run` registry key), which the user runs themselves;
  no script file is created or executed.
- **Linux**: auto-start is configured by documented `systemctl --user`
  commands enabling the provided `flexitracker.service` unit; no installer
  script is required.

Each auto-start entry point SHALL run the daemon without a visible window.
Because the binaries are unsigned, each install path SHALL document the OS
trust step required to run them (Windows SmartScreen).

#### Scenario: Windows registry command starts the daemon windowless
- **WHEN** a user runs the documented `reg add ...\Run` command pointed at the windowed executable (or the `uv`-installed windowed launcher) and then logs in
- **THEN** the daemon starts automatically with no visible console window

#### Scenario: Console and windowed executables are documented separately
- **WHEN** a Windows user reads the standalone-executable install instructions
- **THEN** they are told to use the console executable for `login`/`test` and the windowed executable for auto-start, with the same `reg add` command shape for either distribution

#### Scenario: Linux systemd commands enable the service
- **WHEN** a user runs the documented `systemctl --user` commands
- **THEN** the binary's service unit is enabled and started without any installer script

#### Scenario: Unsigned-binary trust step documented
- **WHEN** a user is blocked by SmartScreen on first run
- **THEN** the install docs give the exact step to allow the unsigned binary to run

## ADDED Requirements

### Requirement: Rotating diagnostic logging
The daemon SHALL write a size-bounded, rotating local log file capturing its
own lifecycle at INFO level by default: process startup (version and backend
URL), the detected machine descriptor once at startup, and each work/idle span
start and end transition emitted by the state machine. Per-tick sampling and
heartbeat activity SHALL be logged at DEBUG level only, so a default
(INFO-level) log stays small regardless of how long the daemon runs. The log
level SHALL be overridable via an environment variable for troubleshooting.
Warnings and errors already surfaced to an interactive terminal (thresholds
fallback, deferred outbox flush, idle-source errors) SHALL also be written to
the log file, and SHALL continue to be mirrored to `stderr` when one is
attached (interactive `login`/`test`/foreground runs), so a windowed,
no-console auto-started daemon still records them somewhere inspectable.

#### Scenario: Startup and machine descriptor logged
- **WHEN** the daemon starts
- **THEN** the log file records the daemon version, backend URL, and the detected machine descriptor (hostname and OS) at INFO level

#### Scenario: Span start/end logged, heartbeats are not
- **WHEN** the state machine emits a work or idle span start/end transition
- **THEN** it is recorded in the log at INFO level, while routine per-tick heartbeat samples are recorded at DEBUG level only and do not appear in a default INFO-level log

#### Scenario: Log rotates instead of growing unbounded
- **WHEN** the log file reaches its configured size limit
- **THEN** it is rotated to a bounded number of backup files rather than growing indefinitely

#### Scenario: A windowed auto-started daemon still records its own errors
- **WHEN** the daemon runs via the windowed/no-console entry point and hits a warning or error condition (e.g. a deferred outbox flush)
- **THEN** the condition is written to the rotating log file even though no console is attached to see it
