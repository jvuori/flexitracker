## Context

After `downtime-robustness`, downtime is already handled without any cooperation from the OS:

| Layer | Covers | Precision |
| --- | --- | --- |
| In-loop gap detection (monotonic vs wall) | suspend/resume without a restart | last poll that saw input |
| `recover()` at startup | reboot, crash, power loss | last poll that saw input |
| Backend liveness bound | a machine that never returns | last heartbeat + 3 intervals |

This change adds a fourth layer *above* those, not in place of them: when the OS says "about to sleep" or "shutting down", the daemon can close at the actual moment and flush before the machine goes.

## Goals / Non-Goals

**Goals:**
- Turn a reconciled close into an observed one where the OS gives notice.
- Flush before going down, so the last events of a session do not wait for the next boot.
- Remain exactly as correct as today with every handler removed.

**Non-Goals:**
- Not replacing reconciliation or the liveness bound; a handler is never the only thing standing between a suspend and a phantom span.
- Not chasing Windows Modern Standby (S0ix), where the process may run intermittently and no clean edge exists.
- Not handling logout/lock via these paths — the idle source already covers lock.

## Decisions

### 1. Handlers do not own the state machine; they ask the loop to close

A handler runs on the OS's thread while the poll loop may be mid-tick. The tempting shape — have the handler mutate `StateMachine` and write the outbox directly — puts two threads on state that is currently single-owner, and would need a mutex around both the state machine and the file writes.

Instead a handler sets a flag (an `AtomicBool`, or sends on a channel) and the poll loop performs the close on its next pass. `state_machine.rs` keeps its "pure, no I/O" property, and there is exactly one writer to the outbox and state file.

The cost is latency: the loop wakes every 15 s, and the OS may not wait that long. So the shutdown path additionally needs a *bounded* synchronous drain — see decision 2 — while the sleep path can accept a tick of delay because `PrepareForSleep` fires with delay-inhibitor semantics on Linux.

*Alternative considered:* wrap the state machine and outbox in a `Mutex` and let handlers act directly. Lower latency, but it makes every future change to the loop reason about reentrancy from a signal context, where the safe-operation surface is narrow — `eprintln!` and file I/O from a signal handler are already questionable.

### 2. Shutdown gets a bounded synchronous drain; sleep does not need one

On `SIGTERM`/`CTRL_SHUTDOWN_EVENT` the process is about to die and the OS grants a short grace (systemd's `TimeoutStopSec`, Windows' shutdown timeout). Deferring to the next 15 s tick would miss it, so shutdown closes and flushes inline, with a hard time budget so a hung network cannot hold the machine's shutdown. Exceeding the budget is acceptable: the events are already durable in the outbox and the next start will send them.

Sleep is different — logind's `PrepareForSleep` can hold an inhibitor lock, so there is time to let the loop handle it.

### 3. The close reuses the state machine's own transition

A handler must not fabricate an `idle` event directly. Going through the state machine keeps one definition of what closing means — the back-dating rule, the state update, the emit watermark — and means a handler close followed by reconciliation cannot double-close, because the machine is no longer `Active`. That property is already pinned by `reconciliation_after_an_explicit_close_does_not_double_close`.

### 4. Correctness with handlers disabled is a test, not a promise

The whole point is that these are optional. A build/run configuration with every handler off must produce the same numbers via reconciliation, and that gets asserted rather than asserted-about. It also keeps the door open to shipping the Linux half before the Windows half.

## Risks / Trade-offs

- **A handler fires while the loop is mid-tick** → the flag/channel design means the loop observes it at a defined point rather than racing a partially-updated state machine.
- **Windows needs a message loop the daemon lacks** → kept in its own thread, communicating by the same flag; if it proves fragile, the console handler alone still covers shutdown and the sleep case falls back to reconciliation.
- **A hung flush delays machine shutdown** → bounded time budget (decision 2); the events survive in the outbox regardless.
- **New platform dependencies** (D-Bus, Windows API) → both behind `cfg(target_os)`, and neither is on the path that makes the daemon correct.
- **Signal-handler safety** → decision 1 keeps the handler to a flag store, which is async-signal-safe, rather than doing file I/O from signal context.

## Migration Plan

Additive and independently deployable. Nothing changes for an existing installation until the new binary runs, and a daemon without handlers behaves exactly as it does after `downtime-robustness`. Rollback is shipping the previous binary.

## Open Questions

- Should the Linux half ship on its own? It is the smaller piece and this is a Linux development machine, so it is testable end to end here; the Windows sleep path can only be verified on Windows hardware. Splitting again would let the verified half land while the other waits for a machine to test on.
- Is `PrepareForSleep` worth an inhibitor lock, delaying suspend until the flush completes? It makes the close reliably exact, at the cost of the daemon briefly holding up the user's sleep — probably not worth it, given reconciliation already covers the miss.
