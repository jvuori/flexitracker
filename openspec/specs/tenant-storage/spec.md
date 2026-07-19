# tenant-storage Specification

## Purpose
TBD - created by archiving change flexitracker. Update Purpose after archive.
## Requirements
### Requirement: One SQLite database per account
Each account SHALL be stored in its own Durable Object with embedded SQLite, addressed deterministically by the stable internal `account_id`. Tenant data SHALL NOT be commingled in a shared table.

#### Scenario: Deterministic tenant addressing
- **WHEN** the same `account_id` is looked up at different times
- **THEN** it resolves to the same Durable Object and SQLite database

#### Scenario: Physical isolation
- **WHEN** account A's Durable Object handles a request
- **THEN** it has no access path to account B's SQLite database

### Requirement: Tenant schema
Each tenant database SHALL hold: immutable raw `event` rows; `correction` overlay rows; `account_settings`; a `machine` registry (including per-machine public metadata, key reference, and last-seen `batch_seq`); derived `session` rows; and `daily_rollup` rows.

#### Scenario: Machine self-registration
- **WHEN** a new machine's first batch arrives
- **THEN** a machine row is created capturing hostname/OS and first/last-seen timestamps

### Requirement: Alarm-driven seal, recompute, and prune
A Durable Object Alarm SHALL run periodically to seal completed days into sessions and rollups, recompute days marked dirty by edits, and prune raw events older than the retention window.

#### Scenario: Day sealed
- **WHEN** a day is complete
- **THEN** the alarm computes its sessions and daily rollup from raw events and corrections

#### Scenario: Edited day recomputed
- **WHEN** a correction marks a day dirty
- **THEN** the next alarm recomputes that day's sessions and rollup

### Requirement: Tiered retention
Raw events SHALL be retained only for the configured edit window and then pruned; sessions, daily rollups, and corrections SHALL be retained indefinitely. The edit window and the raw-retention window SHALL be the same value.

#### Scenario: Raw pruned after window
- **WHEN** a raw event is older than the edit window
- **THEN** the alarm deletes it while retaining the derived sessions and rollups

#### Scenario: Reads use summaries
- **WHEN** the UI requests a past week
- **THEN** the response is served from rollups/sessions without scanning pruned raw events

