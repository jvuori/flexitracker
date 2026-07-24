# activity-daemon Specification

## Purpose
TBD - created by archiving change flexitracker. Update Purpose after archive.
## Requirements
### Requirement: OS idle and session monitoring
The daemon SHALL determine user activity by polling OS-provided idle time (Windows `GetLastInputInfo`; Linux XScreenSaver) and SHALL treat a locked or logged-out session as inactive. It SHALL NOT capture input content (no keylogging).

#### Scenario: Input observed
- **WHEN** the OS reports idle time below the active poll interval
- **THEN** the daemon records the current time as the last known active time

#### Scenario: Session locked
- **WHEN** the session is locked or logged out
- **THEN** the daemon treats the state as inactive regardless of reported idle time

### Requirement: Debounced hysteresis state machine with back-dating
The daemon SHALL emit only state-transition events (active/idle), confirming a transition to idle only after inactivity persists for at least `min_inactivity`, and optionally confirming a transition to active only after activity persists for at least `min_activity`. Emitted events SHALL be back-dated to the true transition time, not the time the threshold tripped.

#### Scenario: Short break absorbed
- **WHEN** the user is inactive for less than `min_inactivity` and then resumes
- **THEN** no idle event is emitted and the active span remains continuous

#### Scenario: Confirmed idle is back-dated
- **WHEN** inactivity reaches `min_inactivity` at time T after the last input at time T0
- **THEN** an idle event is emitted with timestamp T0, not T

### Requirement: Heartbeats bound crash damage
While confirmed active, the daemon SHALL persist a heartbeat at a configurable interval so that unclosed spans can be bounded to the last heartbeat.

#### Scenario: Heartbeat recorded during active work
- **WHEN** the daemon has been continuously active for one heartbeat interval
- **THEN** it persists the current time as the latest heartbeat

### Requirement: Reboot and crash recovery via persisted state
On startup the daemon SHALL read persisted last-active-time and last-reported-state and reconcile any downtime gap: gaps shorter than `min_inactivity` are absorbed into the ongoing span; longer gaps emit a back-dated idle at the last heartbeat followed by an active at resume.

#### Scenario: Brief reboot absorbed
- **WHEN** the machine was off for less than `min_inactivity`
- **THEN** the daemon continues the previous span without emitting a transition

#### Scenario: Long downtime reconciled
- **WHEN** the machine was off for longer than `min_inactivity`
- **THEN** the daemon emits idle at the last heartbeat time and active at the resume time

### Requirement: Local configuration and central threshold fetch
The daemon SHALL persist configuration `{account_id, machine_id, access_key, cached settings}` in a permission-restricted local file and SHALL fetch threshold settings from the backend on startup, falling back to built-in defaults when offline.

#### Scenario: Settings fetched on startup
- **WHEN** the daemon starts and the backend is reachable
- **THEN** it retrieves current threshold settings and caches them locally

#### Scenario: Offline first run
- **WHEN** the daemon starts and the backend is unreachable
- **THEN** it uses cached or built-in default thresholds and continues operating

### Requirement: Offline outbox with idempotent flush
The daemon SHALL buffer events to a durable local outbox and, on reconnect, flush the entire queue to the backend. Each batch SHALL carry a monotonic `batch_seq` so the backend can deduplicate re-sent batches.

#### Scenario: Events buffered while offline
- **WHEN** the backend is unreachable and the user keeps working
- **THEN** events accumulate in the local outbox and are not lost

#### Scenario: Queue flushed on reconnect
- **WHEN** connectivity is restored
- **THEN** the daemon sends all buffered batches and clears them only after acknowledgement

### Requirement: Minimal footprint and auto-start distribution
The daemon SHALL run invisibly with minimal resource use and SHALL be distributed as a plain executable accompanied by scripts/instructions to auto-start it on user login.

#### Scenario: Auto-start on login
- **WHEN** the user logs into the operating system after installing per the instructions
- **THEN** the daemon starts automatically without a visible window

### Requirement: One-command authorization
The daemon SHALL authorize itself through a single `login` command; there SHALL be
no separate `configure` command. By default `login` runs the browser-based
authorization flow (opening the system browser to the backend authorization
endpoint and writing the permission-restricted local config from the key the
backend returns, with the user supplying and seeing no key — the flow's mechanics
are defined by the daemon-onboarding capability). For headless or scripted setups it
SHALL also accept a non-interactive `login --key <KEY>` form that writes the
restricted config from a supplied key (the key the web "Add machine" surface
issues). It SHALL accept an optional `--name <label>` that defaults to the hostname,
SHALL use the backend URL baked into the release build by default (overridable with
`--backend-url` for self-hosters), and SHALL run the connectivity self-test after
writing the config.

#### Scenario: Browser login authorizes without a pasted key
- **WHEN** the user runs `flexitracker login` and approves in the browser
- **THEN** the daemon writes the restricted config from the returned key and reports the connectivity result, without the user supplying or seeing a key

#### Scenario: Manual key form for headless or scripted setups
- **WHEN** the user runs `flexitracker login --key <key>`
- **THEN** the daemon writes the restricted config from that key and the built-in backend URL and reports the connectivity result, without opening a browser

#### Scenario: Self-hoster overrides the backend
- **WHEN** the user supplies `--backend-url`
- **THEN** that URL is used for the flow instead of the baked-in default

#### Scenario: No configure command
- **WHEN** the user runs `flexitracker configure`
- **THEN** the command is not recognized (authorization is done through `login`)

### Requirement: Connectivity self-test without sending data
The daemon SHALL provide a `test` command that verifies end-to-end connectivity and authorization by querying a read-only endpoint and reporting reachability, key validity, the bound account email, this machine's label, and the account status. This command SHALL NOT emit, buffer, or send any activity event.

#### Scenario: Successful test shows account data
- **WHEN** the user runs `test` with a valid key
- **THEN** the daemon reports the backend is reachable, the key is valid, and prints the bound account email and machine label, having sent no activity data

#### Scenario: Test surfaces a bad key
- **WHEN** the user runs `test` with an invalid or revoked key
- **THEN** the daemon reports the authorization failure and sends no activity data

#### Scenario: Test surfaces a not-yet-active account
- **WHEN** the key belongs to an account that is not active
- **THEN** the daemon reports the account status rather than implying success

### Requirement: Productized per-OS installation with auto-start
The daemon SHALL be distributed with a productized, auto-starting install path for each supported OS: on Windows a portable package with a login-task script AND a real `setup.exe` installer; on Linux a copy/paste installer that enables the systemd user service. Each installer SHALL configure auto-start on login and SHALL run the daemon without a visible window. Because the binaries are unsigned, each install path SHALL document the OS trust step required to run them (Windows SmartScreen).

#### Scenario: Windows setup.exe installs and auto-starts
- **WHEN** a user runs the Windows `setup.exe`
- **THEN** the daemon is installed, set to auto-start on login without a window, and can capture the access key to write its config

#### Scenario: Windows portable auto-starts
- **WHEN** a user runs the portable package's auto-start script
- **THEN** a login task is registered so the daemon starts automatically at login without a window

#### Scenario: Linux one-liner enables the service
- **WHEN** a user runs the Linux install one-liner
- **THEN** the binary is installed and the systemd user service is enabled and started

#### Scenario: Unsigned-binary trust step documented
- **WHEN** a user is blocked by SmartScreen on first run
- **THEN** the installer text and docs give the exact step to allow the unsigned binary to run

