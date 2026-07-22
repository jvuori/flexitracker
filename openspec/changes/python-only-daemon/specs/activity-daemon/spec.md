## MODIFIED Requirements

### Requirement: Minimal footprint and auto-start distribution
The daemon SHALL be implemented as a single pure-Python program that runs invisibly with modest resource use, and SHALL be distributed primarily as a `uv`-installable package requiring no compiled binary, no C toolchain, and no administrator rights, accompanied by scripts/instructions to auto-start it on user login. OS idle and session-lock detection SHALL use a foreign-function interface (ctypes) to the platform's own libraries, so no build step is required at install time.

#### Scenario: Install without admin rights or a compiler
- **WHEN** a user installs the daemon with `uv` into their user profile
- **THEN** it installs with no compiled artifact, no compiler, and no administrator privilege

#### Scenario: Auto-start on login
- **WHEN** the user logs into the operating system after installing per the instructions
- **THEN** the daemon starts automatically without a visible window

### Requirement: Productized per-OS installation with auto-start
The daemon SHALL provide a productized, auto-starting install path for each supported OS built on the `uv`-installed entrypoint: on Linux a copy/paste installer that enables a systemd user service running that entrypoint; on Windows a login task that launches the daemon windowless. Each install path SHALL configure auto-start on login and SHALL run the daemon without a visible window. A frozen single-file executable (and, on Windows, a `setup.exe` wrapping it) MAY be offered as an optional convenience for machines that permit executables; because any such executable is unsigned, that path SHALL document the OS trust step required to run it (Windows SmartScreen). The `uv` path SHALL be the primary path, since it is the one that runs where executables are blocked.

#### Scenario: uv install auto-starts on Linux
- **WHEN** a user runs the Linux install one-liner
- **THEN** the `uv`-installed entrypoint is registered as a systemd user service that is enabled and started

#### Scenario: uv install auto-starts on Windows
- **WHEN** a user installs with `uv` and runs the Windows auto-start step
- **THEN** a login task is registered so the daemon starts automatically at login without a window

#### Scenario: Optional frozen executable documents the trust step
- **WHEN** a user on an unrestricted machine runs the optional frozen executable or `setup.exe` and is blocked by SmartScreen
- **THEN** the installer text and docs give the exact step to allow the unsigned executable to run

#### Scenario: Blocked machine still has a path
- **WHEN** a machine forbids running unsigned executables but permits a user-scope Python toolchain
- **THEN** the user installs and runs the daemon via the primary `uv` path without needing the executable
