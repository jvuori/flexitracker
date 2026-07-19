> Split out of `downtime-robustness`. Everything here is an optimisation over
> the reconciliation and liveness bound that change already shipped — a missed
> signal must degrade to those, never to an unbounded span. Group 4 is what
> proves it.

## 1. Plumbing: ask the loop to close, don't close from the handler

- [ ] 1.1 Add a shutdown/sleep request flag (`AtomicBool` or channel) that a handler sets and the poll loop observes on its next pass, keeping `state_machine.rs` pure and leaving one writer to the outbox and state file.
- [ ] 1.2 On observing the flag, close through the state machine's own transition rather than fabricating an `idle` — one definition of back-dating, state update and the emit watermark.
- [ ] 1.3 Give the shutdown path a bounded synchronous close-and-flush, since the OS will not wait for the next 15 s tick. Cap the time budget so a hung network cannot delay the machine's shutdown; the events are durable in the outbox either way.

## 2. Linux

- [ ] 2.1 Handle `SIGTERM` (systemd stop, shutdown): set the flag from the handler only — a flag store is async-signal-safe, file I/O from signal context is not — then let 1.3 do the work.
- [ ] 2.2 Subscribe to logind `PrepareForSleep(true)` over D-Bus and request the same close before suspend.
- [ ] 2.3 Keep both behind `cfg(target_os = "linux")` and confirm a Windows build is unaffected.

## 3. Windows

- [ ] 3.1 Console control handler for `CTRL_SHUTDOWN_EVENT` and `CTRL_CLOSE_EVENT`.
- [ ] 3.2 `WM_POWERBROADCAST` / `PBT_APMSUSPEND` for impending sleep, on its own thread with its own message loop, communicating via the same flag — isolated from the poll loop.
- [ ] 3.3 Keep both behind `cfg(target_os = "windows")` and confirm a Linux build is unaffected.

## 4. Prove the handlers are optional

- [ ] 4.1 With every handler disabled, a suspend and a shutdown still produce the same numbers via reconciliation — the property that makes this change safe to ship, or not ship, in halves.
- [ ] 4.2 A handler-emitted close followed by reconciliation does not double-close. Already covered by `reconciliation_after_an_explicit_close_does_not_double_close`; assert it still holds once a real handler drives the close.
- [ ] 4.3 A handler firing mid-tick does not corrupt state — the loop observes the flag at a defined point rather than racing a partially-updated state machine.

## 5. Verify

- [ ] 5.1 `cargo test` green on Linux; cross-check the Windows build compiles.
- [ ] 5.2 Real suspend on this machine (`systemctl suspend`) with the daemon running against the local stack: the span closes at the suspend moment rather than at the last poll.
- [ ] 5.3 Real `systemctl stop` of the user service: the span closes and the outbox flushes before exit.
- [ ] 5.4 Windows paths verified on Windows hardware, or the change ships Linux-only with the Windows tasks deferred — decide explicitly rather than leaving them silently unverified.
