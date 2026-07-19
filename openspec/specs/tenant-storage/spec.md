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

### Requirement: Settings writes are validated
A settings write SHALL be validated before it is merged and persisted, and SHALL be rejected fail-fast when any supplied value falls outside its permitted domain. Because persisting settings marks every day dirty for recomputation, an out-of-domain value that is accepted would silently reshape the account's entire history; rejection at the write boundary prevents that.

Validation SHALL apply to writes from every client, not only the web UI, and SHALL cover:

- `timezone` — a non-empty string that the runtime accepts as a timezone identifier
- `workdayStartMin`, `workdayEndMin` — integers that denote a time of day (0 to 1439); 1440 is excluded because it is not a time of day and has no representation the user could enter or read back
- `dailyNormMin`, `lunchDeductMin`, `lunchThresholdMin` — integers from 0 to 1440
- `weeklyNormMin` — an integer from 0 to 10080
- `privateLeaveThresholdSec` — an integer from 0 to 86400

Beyond the per-field domains, a settings write SHALL be rejected when the resulting settings are internally incoherent, even where each individual value is within its own domain:

- the office-hours start SHALL be strictly earlier than the office-hours end
- the daily norm SHALL NOT exceed the weekly norm
- the lunch deduction SHALL NOT exceed the lunch threshold

These cross-field rules SHALL be evaluated against the settings as they would stand after the write, not against the supplied values alone, so that a write carrying only one side of a pair is still checked against the stored other side.

A rejected write SHALL leave the stored settings unchanged and SHALL NOT mark any day dirty. Validation applies to the incoming write only; values already stored are never rejected on read.

#### Scenario: Valid settings write accepted
- **WHEN** a settings write supplies a valid timezone, workday bounds and norms
- **THEN** the values are persisted, the merged settings are returned, and the account's days are marked for recomputation

#### Scenario: Out-of-range value rejected
- **WHEN** a settings write supplies a workday start of 4800 minutes, or a negative daily norm
- **THEN** the write is rejected, the stored settings are unchanged, and no day is marked dirty

#### Scenario: Uninterpretable timezone rejected
- **WHEN** a settings write supplies a timezone string the runtime cannot interpret
- **THEN** the write is rejected and the stored timezone is unchanged

#### Scenario: Inverted office-hours window rejected across a partial patch
- **WHEN** a settings write supplies only an office-hours start that is at or after the account's stored office-hours end
- **THEN** the write is rejected, because the ordering rule is evaluated against the settings as they would stand after the write

#### Scenario: Daily norm exceeding the weekly norm rejected
- **WHEN** a settings write would leave the account with a daily norm greater than its weekly norm
- **THEN** the write is rejected, even though both values are individually within their domains

#### Scenario: Lunch deduction exceeding its threshold rejected
- **WHEN** a settings write would leave the account with a lunch deduction greater than the lunch threshold
- **THEN** the write is rejected, because a day just over the threshold would otherwise compute a negative worked total

#### Scenario: Coherent multi-field write accepted
- **WHEN** a settings write moves both office-hours bounds, or both norms, to a new but internally consistent pair
- **THEN** the write is accepted and persisted

#### Scenario: Rejected write surfaces as a client error
- **WHEN** a settings write is rejected by validation
- **THEN** the API responds with a 400 client error rather than a server error

