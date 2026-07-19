## MODIFIED Requirements

### Requirement: Debounced hysteresis state machine with back-dating
The daemon SHALL emit only state-transition events (active/idle), confirming a transition to idle only after inactivity persists for at least `min_inactivity`, and optionally confirming a transition to active only after activity persists for at least `min_activity`. Emitted events SHALL be back-dated to the true transition time, not the time the threshold tripped.

A confirmed idle SHALL be back-dated to the moment inactivity **began**, derived from the idle duration the operating system reports rather than from the last poll at which input appeared fresh, so the timestamp is exact rather than quantised to the poll interval. It SHALL NOT be back-dated earlier than the last observed activity, so an implausible reading from the operating system cannot move the transition backwards.

Where the transition is caused by the session locking rather than by inactivity elapsing, the daemon SHALL back-date to the last observed input instead, because reported idle time at that moment reflects the lock rather than the user's last activity.

#### Scenario: Short break absorbed
- **WHEN** the user is inactive for less than `min_inactivity` and then resumes
- **THEN** no idle event is emitted and the active span remains continuous

#### Scenario: Confirmed idle is back-dated
- **WHEN** inactivity reaches `min_inactivity` at time T after the last input at time T0
- **THEN** an idle event is emitted with timestamp T0, not T

#### Scenario: Back-dating is exact, not poll-quantised
- **WHEN** inactivity began part-way between two polls and the transition later confirms
- **THEN** the idle event is timestamped at the moment inactivity began, not at the poll that last saw fresh input

#### Scenario: Lock back-dates to the last real input
- **WHEN** the session is locked while reported idle time is near zero
- **THEN** the idle event is back-dated to the last observed input, not to the moment of locking

### Requirement: Reboot and crash recovery via persisted state
On startup the daemon SHALL read persisted last-active-time and last-reported-state and reconcile any downtime gap: gaps shorter than `min_inactivity` are absorbed into the ongoing span; longer gaps emit a back-dated idle at the last heartbeat followed by an active at resume.

Reconciliation SHALL back-date the close to the most recent local evidence of activity available, not to the coarsest. Because last-active-time is recorded on every poll while heartbeats are minutes apart, anchoring to the later of the two bounds the residual over-count by the poll interval rather than by the heartbeat interval. This evidence is written locally on every poll and is therefore unaffected by network conditions, which is what makes daemon-side reconciliation more reliable than any inference the backend can make about a quiet machine.

The daemon SHALL apply the same reconciliation **while running**, not only at startup, because suspend and hibernate freeze the process rather than restarting it. It SHALL detect an interval during which it was not executing by comparing elapsed monotonic time against elapsed wall-clock time between observations, and SHALL treat a divergence of at least `min_inactivity` as downtime, reconciling it identically to a restart. Startup and in-process reconciliation SHALL share one implementation so their behaviour cannot diverge.

#### Scenario: Brief reboot absorbed
- **WHEN** the machine was off for less than `min_inactivity`
- **THEN** the daemon continues the previous span without emitting a transition

#### Scenario: Close is back-dated to the latest local evidence
- **WHEN** downtime is reconciled and the last recorded input is more recent than the last heartbeat
- **THEN** the idle event is back-dated to the last recorded input, not to the older heartbeat

#### Scenario: Reconciliation is unaffected by connectivity
- **WHEN** the machine has been unable to reach the backend for an extended period and then goes down
- **THEN** reconciliation still back-dates correctly from locally persisted state, and the buffered events convey it once connectivity returns

#### Scenario: Long downtime reconciled
- **WHEN** the machine was off for longer than `min_inactivity`
- **THEN** the daemon emits idle at the last heartbeat time and active at the resume time

#### Scenario: Sleep and resume without a restart
- **WHEN** the machine sleeps for longer than `min_inactivity` and resumes without the daemon process restarting
- **THEN** the daemon closes the span back-dated to the last heartbeat, and does not count the suspended interval as working time

#### Scenario: Resume with immediate user input
- **WHEN** the user provides input immediately on wake, so the reported idle time is small
- **THEN** the suspended interval is still recognised as downtime and excluded, rather than being absorbed into the ongoing active span

#### Scenario: Brief suspend absorbed
- **WHEN** the machine is suspended for less than `min_inactivity`
- **THEN** the interval is absorbed into the ongoing span, consistently with a brief reboot

### Requirement: Offline outbox with idempotent flush
The daemon SHALL buffer events to a durable local outbox and, on reconnect, flush the entire queue to the backend. Each batch SHALL carry a monotonic `batch_seq` so the backend can deduplicate re-sent batches.

Outbox and state writes SHALL be atomic, so that a crash or power loss during a write cannot leave a partially written file that prevents the daemon from starting or discards buffered events. The queue SHALL be bounded so that an extended offline period cannot grow it without limit, discarding only events already too old for the backend to accept. The queue SHALL be flushed in bounded chunks, each with its own `batch_seq`, and a chunk SHALL be cleared only when that chunk is acknowledged, so a queue larger than one request can still drain.

#### Scenario: Events buffered while offline
- **WHEN** the backend is unreachable and the user keeps working
- **THEN** events accumulate in the local outbox and are not lost

#### Scenario: Queue flushed on reconnect
- **WHEN** connectivity is restored
- **THEN** the daemon sends all buffered batches and clears them only after acknowledgement

#### Scenario: Crash during a write leaves a usable outbox
- **WHEN** the process is killed or the machine loses power while the outbox is being written
- **THEN** the daemon starts normally afterwards and the previously acknowledged contents are intact

#### Scenario: Long offline period drains in chunks
- **WHEN** the queue has grown larger than a single request may carry
- **THEN** it is sent as multiple acknowledged chunks rather than failing as one oversized request

## ADDED Requirements

### Requirement: Clock changes are distinguished from downtime
The daemon SHALL NOT treat a wall-clock adjustment as downtime. It SHALL compare wall-clock movement against monotonic movement so that clock steps from time synchronisation or manual changes are separated from intervals in which the daemon was not executing.

A backwards wall-clock movement SHALL never close a span or produce working time. No emitted event SHALL carry a timestamp earlier than the last event the daemon emitted, because events are ordered by timestamp when paired into spans and an out-of-order transition would pair the wrong edges.

#### Scenario: Clock corrected backwards
- **WHEN** the system clock is stepped backwards while the daemon is running
- **THEN** no span is closed, no negative-length span is produced, and no emitted event precedes the previously emitted event

#### Scenario: Small clock correction absorbed
- **WHEN** time synchronisation steps the clock by less than `min_inactivity`
- **THEN** the adjustment is absorbed and no downtime is reconciled

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
