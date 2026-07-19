## ADDED Requirements

### Requirement: Open spans are bounded by the machine's last liveness evidence
An active span that has no closing event SHALL NOT be counted up to the time of observation. It SHALL end at the earlier of the observation time and the last time that machine proved it was alive plus a grace allowance derived from the heartbeat interval. Liveness evidence is any presence event from that machine, including a heartbeat.

The bound SHALL be computed per machine and SHALL NOT depend on the machine ever reconnecting, so that a machine which is shut down, crashes, loses power, or never returns cannot accumulate working time in its absence. The grace allowance SHALL tolerate a small number of missed heartbeats so that transient delivery jitter does not truncate genuine work.

The bound is **provisional**. Absence of liveness evidence is not evidence of absence: a quiet machine may be switched off, or may be working normally with its events buffered behind an unreachable network, and these are indistinguishable to the backend. The bound SHALL therefore be derived at read time from stored events rather than written back as a correction, and an explicit closing event SHALL always take precedence over it. When buffered events arrive later, recomputation SHALL supersede the bound with the machine's own account of what happened.

Because the backend cannot distinguish a dead machine from an unreachable one, the bound SHALL err toward under-counting rather than counting time that may not have been worked.

Because a currently-working machine's last liveness evidence is at most one heartbeat interval old, its bound falls in the future and the observation time governs — an active session in progress is unaffected.

#### Scenario: Machine disappears mid-span
- **WHEN** a machine emits an active event and heartbeats, then stops emitting entirely without an idle event
- **THEN** the span ends shortly after its final heartbeat rather than continuing to the time the week is viewed

#### Scenario: Downtime does not bleed into later days
- **WHEN** a machine's last heartbeat is on Friday afternoon and the week is viewed on Sunday evening
- **THEN** Saturday and Sunday show no working time from that machine, and Friday ends shortly after the final heartbeat

#### Scenario: Session in progress is not truncated
- **WHEN** a machine is currently active and heartbeating normally
- **THEN** its open span is counted up to the observation time, unaffected by the bound

#### Scenario: Grace tolerates a missed heartbeat
- **WHEN** a single heartbeat fails to arrive but the machine keeps working and later heartbeats do arrive
- **THEN** the span is not truncated at the missing heartbeat

#### Scenario: Late-arriving heartbeats extend a previously bounded span
- **WHEN** heartbeats buffered while the backend was unreachable arrive after a span was bounded
- **THEN** recomputation extends the span to reflect the newly known liveness

#### Scenario: Network outage under-reports temporarily, then self-corrects
- **WHEN** a machine keeps working through a long network outage, so no events reach the backend
- **THEN** the affected day reads low while the outage lasts, and returns to the correct total once the buffered events are flushed — no working time is lost

#### Scenario: Explicit close always beats the inferred bound
- **WHEN** an idle event closes a span at a time later than the bound would have inferred
- **THEN** the span ends at the idle event, because the machine's own account supersedes the backend's inference

#### Scenario: A bounded period is marked as inferred
- **WHEN** a period's end comes from the bound rather than from a closing event
- **THEN** the computed result marks that period as provisional and carries the machine's last-seen time, so a consumer can distinguish an inferred end from an observed one

#### Scenario: A still-growing period is distinguishable from a stalled one
- **WHEN** a provisional period's machine has been seen within the liveness window, so its extent is still advancing
- **THEN** the computed result exposes that, so a consumer can tell a period that is still moving from one that has stopped moving but remains unresolved

#### Scenario: An explicitly closed period is not marked
- **WHEN** a period's end comes from a closing event
- **THEN** it is not marked provisional

#### Scenario: The truncated remainder is an ordinary gap
- **WHEN** the bound shortens a span and leaves the rest of the day uncovered
- **THEN** the remainder is treated as a normal gap and the existing bridging and private-leave rules decide whether it counts, rather than being silently discarded or given a special disposition

#### Scenario: One machine's downtime does not inflate another's work
- **WHEN** one machine is suspended mid-span while a second machine is genuinely active
- **THEN** the suspended machine's span is bounded independently and only the active machine's time counts
