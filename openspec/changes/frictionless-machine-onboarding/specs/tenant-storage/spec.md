## MODIFIED Requirements

### Requirement: Tenant schema
Each tenant database SHALL hold: immutable raw `event` rows; `correction` overlay
rows; `account_settings`; a `machine` registry; derived `session` rows; and
`daily_rollup` rows. The `machine` registry SHALL model each machine as a
first-class named entity keyed by a stable `machine_id` with a human `label`,
decoupled from the access-key rows (a machine's identity SHALL survive key rotation
and hardware replacement). It SHALL also carry per-machine public metadata
(hostname/OS), and first/last-seen and last-batch-seq bookkeeping.

#### Scenario: Machine self-registration
- **WHEN** a new machine's first batch arrives
- **THEN** a machine row is created capturing hostname/OS and first/last-seen timestamps

#### Scenario: Machine identity is stable across key rotation
- **WHEN** a machine's key is rotated (a new key bound to the same `machine_id`)
- **THEN** the same machine row persists, retaining its label and history rather than creating a new one
