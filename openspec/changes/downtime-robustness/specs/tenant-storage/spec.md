## ADDED Requirements

### Requirement: A change to a span's extent marks every day it covered
When ingested events change the extent of an existing span — most commonly a late-arriving idle event that closes a span previously assumed to run to the present — every day that span covered under the previous interpretation SHALL be marked for recomputation, not only the day containing the arriving event.

Marking only the arriving event's own day would leave the days worst affected by an unbounded span still sealed with inflated totals, so the correction would be invisible precisely where the error was largest.

#### Scenario: Late idle repairs every affected day
- **WHEN** an idle event arrives for Friday afternoon, closing a span that had been counted through Saturday and Sunday
- **THEN** Friday, Saturday and Sunday are all marked for recomputation and their totals are corrected

#### Scenario: Ordinary event marks only its own day
- **WHEN** an ingested event does not change the extent of any existing span
- **THEN** only the day containing that event is marked for recomputation

#### Scenario: Sealed rollups are corrected
- **WHEN** the affected days had already been sealed into rollups
- **THEN** those rollups are recomputed from the corrected spans rather than retaining the inflated totals

### Requirement: Daemon protocol timing is not account-configurable
Daemon timing values that determine how often the backend performs storage writes, or that define protocol behaviour rather than user preference, SHALL NOT be part of per-account settings. Specifically the liveness transmit interval and the inactivity-confirmation threshold SHALL be backend constants: ingest write volume scales with both — the first directly, the second through how often state transitions occur — so per-account values could take the deployment outside the free tier. The inactivity threshold additionally defines the boundary between downtime that is absorbed and downtime that is reconciled, which must not vary by account.

These constants SHALL continue to be served to the daemon over the configuration endpoint so that both sides observe a single source of truth and cannot drift. A settings write that attempts to set them SHALL NOT change them.

The threshold for confirming a return to activity SHALL remain configurable, because it expresses a genuine preference — how much sustained input counts as returning to work — and because a fixed inactivity threshold already caps how often transitions can occur, so it cannot drive write volume on its own. It SHALL be validated at the settings boundary like any other setting.

Making the protocol values unsettable rather than merely validating minimums keeps the zero-cost constraint structural: a value that cannot be set cannot be misconfigured.

#### Scenario: Protocol timing is not settable
- **WHEN** a settings write supplies a liveness transmit interval or an inactivity-confirmation threshold
- **THEN** the stored settings and the values served to daemons are unchanged

#### Scenario: Daemons still receive the constants
- **WHEN** a daemon fetches its configuration
- **THEN** it receives the backend's constant transmit interval and inactivity threshold, as before

#### Scenario: Activity-confirmation threshold remains settable and validated
- **WHEN** a settings write supplies a valid activity-confirmation threshold
- **THEN** it is persisted and served to daemons; an out-of-domain value is rejected

#### Scenario: Write volume stays within the free tier by construction
- **WHEN** any account is operating normally
- **THEN** its transmit interval and inactivity threshold are backend constants, so sustained ingest write volume cannot be driven outside the free-tier allowance by configuration
