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

