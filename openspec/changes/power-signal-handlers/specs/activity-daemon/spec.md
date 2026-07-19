## ADDED Requirements

### Requirement: Power and shutdown signals emit a clean close
The daemon SHALL, where the operating system provides it, handle notification of impending sleep and of shutdown or service stop by emitting an idle event at the current time and flushing the outbox before returning.

These handlers SHALL be an optimisation only. Correctness SHALL NOT depend on any of them firing, since a power cut delivers no notification and an operating system may terminate the process before a handler completes; when a signal is missed, the outcome SHALL degrade to the reconciliation and liveness bounding above rather than to an unbounded span.

#### Scenario: Clean shutdown closes the span precisely
- **WHEN** the user shuts the machine down and the daemon receives the shutdown notification
- **THEN** it emits an idle event at that moment and flushes before exiting

#### Scenario: Impending sleep closes the span precisely
- **WHEN** the operating system notifies the daemon that the machine is about to sleep
- **THEN** it emits an idle event and flushes before the machine suspends

#### Scenario: Missed signal degrades safely
- **WHEN** the machine loses power abruptly so no handler runs
- **THEN** the span is still bounded by the reconciliation on next start and by the backend's liveness bound
