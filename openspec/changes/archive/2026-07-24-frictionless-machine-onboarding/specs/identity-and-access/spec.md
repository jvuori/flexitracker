## ADDED Requirements

### Requirement: Machine is a first-class named entity distinct from its key
The system SHALL model a **Machine** as a durable entity `{ machine_id, account_id,
label, ... }` that is distinct from the access key that authorizes a daemon. A
Machine's `machine_id` SHALL be stable across credential rotations and hardware
replacements: it SHALL NOT be minted fresh per key. A key SHALL bind to an existing
Machine's `machine_id` rather than defining a new machine identity by its own
existence.

#### Scenario: Machine id survives a key rotation
- **WHEN** a Machine's key is revoked and a new key is issued for the same Machine
- **THEN** the `machine_id` is unchanged and the Machine's identity and history persist

#### Scenario: Key binds to a Machine
- **WHEN** an access key is issued
- **THEN** it maps to `(account_id, machine_id)` where `machine_id` identifies a durable Machine, not the key

### Requirement: Label-based re-registration preserves machine identity
Registering a machine under a label that already resolves to an existing Machine for
that account SHALL issue a **new key bound to the same `machine_id`** (not a new
machine and not a reused key). This lets a replacement laptop keep the same logical
Machine ("Work laptop") so its event stream and history continue under one
`machine_id`.

#### Scenario: Same label continues the same machine
- **WHEN** a user registers a machine with a label that matches an existing Machine
- **THEN** a fresh key is issued bound to that Machine's existing `machine_id`

#### Scenario: New label creates a new machine
- **WHEN** a user registers a machine with a label that matches no existing Machine
- **THEN** a new Machine with a new `machine_id` is created

### Requirement: At most one active key per Machine
A Machine SHALL have at most one non-revoked key at any time. Issuing a new key for
an existing Machine SHALL revoke that Machine's prior key in the same operation, so
two daemons can never write interleaved activity events under one `machine_id`.

#### Scenario: Re-issuing revokes the prior key
- **WHEN** a new key is issued for a Machine that already has an active key
- **THEN** the prior key is revoked and only the new key resolves for that Machine

#### Scenario: Other machines are unaffected
- **WHEN** a Machine's key is revoked and replaced
- **THEN** every other Machine's key for the account continues to resolve

## MODIFIED Requirements

### Requirement: Per-machine access-key issuance and revocation
The authenticated UI SHALL mint a per-machine access key on request **only for an
`active` account**, and present the exact agent-configuration command containing it.
A non-`active` account SHALL NOT be able to mint a key. Each key SHALL map to
`(account_id, machine_id)` where `machine_id` identifies a durable Machine, and SHALL
be individually revocable. A key MAY be minted either through the authenticated web
UI or through the browser-based daemon `login` flow; in both cases the same
account-active gate, Machine binding, and one-active-key-per-Machine invariant SHALL
apply. When an account is disabled, all of its keys SHALL be revoked.

#### Scenario: Add machine
- **WHEN** a signed-in `active` user adds a machine
- **THEN** a new access key is generated and shown within a ready-to-run agent config command

#### Scenario: Non-active user cannot add a machine
- **WHEN** a `pending`, `rejected`, or `disabled` user attempts to add a machine
- **THEN** no key is issued and the request is denied

#### Scenario: Non-active user cannot log in a daemon
- **WHEN** a `pending`, `rejected`, or `disabled` user completes the browser `login` approval
- **THEN** no key is issued and the daemon reports the account is not active

#### Scenario: Revoke one machine
- **WHEN** a user revokes a machine's key
- **THEN** that key stops resolving while other machines' keys continue to work

#### Scenario: Disabling an account revokes its keys
- **WHEN** an admin disables an account
- **THEN** every access key for that account stops resolving for ingestion
