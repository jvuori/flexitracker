## Why

`downtime-robustness` made the daemon reconcile downtime it slept through: on resume it detects the gap from monotonic-versus-wall divergence and closes the span back-dated to the last local evidence, and the backend bounds anything still open. That is correct, and it is deliberately independent of the operating system telling the daemon anything.

What it is not is *exact*. Reconciliation back-dates to the last poll that saw input, so a machine suspended at 16:04:52 closes at up to a poll interval earlier, and an abrupt shutdown loses the same. The operating system usually knows first — Linux announces impending sleep over logind and sends `SIGTERM` on service stop; Windows raises `WM_POWERBROADCAST` and a console control event on shutdown. Acting on those turns a reconciled close into an observed one and lets the outbox flush before the machine goes down, so the last few minutes of a day are not left waiting for the next boot.

Split out of `downtime-robustness` deliberately: it is the only part of that change that adds platform-specific dependencies, and the only part whose absence costs precision rather than correctness.

## What Changes

- **Linux**: handle `SIGTERM` (systemd stop, shutdown) and subscribe to logind's `PrepareForSleep(true)` over D-Bus. Each emits an `idle` at the current time and flushes the outbox synchronously before returning.
- **Windows**: a console control handler for `CTRL_SHUTDOWN_EVENT`/`CTRL_CLOSE_EVENT`, and `WM_POWERBROADCAST`/`PBT_APMSUSPEND` for impending sleep. The latter needs a message loop the daemon does not currently have, kept isolated from the poll loop.
- **Handlers are an optimisation, never the mechanism.** A power cut delivers no notification and an OS may kill the process before a handler finishes, so a missed signal SHALL degrade to the reconciliation and liveness bound that already exist — never to an unbounded span. The system must remain correct with every handler disabled, and that is a test, not an aspiration.
- No change to the state machine, the backend, or the wire schema. A handler-emitted close is an ordinary `idle`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `activity-daemon`: where the operating system offers notice of impending sleep or shutdown, the daemon closes its span precisely and flushes before going down, while remaining correct when no such notice arrives.

## Impact

- **Daemon** (`daemon/crates/flexitracker-daemon/`): signal and power handling in `main.rs`, kept out of `state_machine.rs` so the pure step/reconcile logic stays I/O-free and unit-testable. The close itself reuses the existing state-machine transition rather than fabricating an event.
- **Dependencies**: a D-Bus client on Linux and the Windows API surface for console/power events — the first non-trivial platform dependencies the daemon has taken. Both must stay optional at build time for the other platform.
- **Concurrency**: a handler fires on another thread while the poll loop may be mid-tick. The state machine and outbox are not currently shared across threads, so this needs a deliberate ownership decision rather than incidental locking.
- **Tests**: a handler-emitted close followed by reconciliation must not double-close (already covered by `reconciliation_after_an_explicit_close_does_not_double_close`); plus verification that behaviour is unchanged with all handlers disabled.
