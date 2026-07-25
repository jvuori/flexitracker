## MODIFIED Requirements

### Requirement: Tenant schema
Each tenant database SHALL hold: immutable raw `event` rows; `correction` overlay
rows (each recorded against a `ledger` of `work` or `personal`); `account_settings`;
a `machine` registry; derived `session` rows; and `daily_rollup` rows. The `machine`
registry SHALL model each machine as a first-class named entity keyed by a stable
`machine_id` with a human `label`, decoupled from the access-key rows (a machine's
identity SHALL survive key rotation and hardware replacement). It SHALL also carry
per-machine public metadata (hostname/OS), and first/last-seen and last-batch-seq
bookkeeping. `daily_rollup` rows SHALL carry sealed totals for **both** ledgers —
work and personal — computed and stored together at seal time.

#### Scenario: Machine self-registration
- **WHEN** a new machine's first batch arrives
- **THEN** a machine row is created capturing hostname/OS and first/last-seen timestamps

#### Scenario: Machine identity is stable across key rotation
- **WHEN** a machine's key is rotated (a new key bound to the same `machine_id`)
- **THEN** the same machine row persists, retaining its label and history rather than creating a new one

#### Scenario: Rollup carries both ledgers
- **WHEN** a day's rollup is read
- **THEN** it exposes work-ledger totals (worked/gross/lunch/norm/balance) and personal-ledger totals (activity time) independently

### Requirement: Alarm-driven seal, recompute, and prune
A Durable Object Alarm SHALL run periodically to seal completed days into sessions and rollups, recompute days marked dirty by edits, and prune raw events older than the retention window. Sealing a day SHALL compute and persist both the work ledger's and the personal ledger's totals in the same pass, from the same raw events and each ledger's own corrections.

#### Scenario: Day sealed
- **WHEN** a day is complete
- **THEN** the alarm computes its sessions and daily rollup — both ledgers — from raw events and corrections

#### Scenario: Edited day recomputed
- **WHEN** a correction marks a day dirty
- **THEN** the next alarm recomputes that day's sessions and rollup for the ledger the correction was recorded against

#### Scenario: Role change reshapes only unsealed days
- **WHEN** a machine's role is changed
- **THEN** any day still within the raw-retention/edit window recomputes both ledgers live on next read, while a day already sealed keeps the ledger split it had at seal time
