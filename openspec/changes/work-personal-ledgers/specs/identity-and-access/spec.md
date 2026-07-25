## MODIFIED Requirements

### Requirement: Machine is a first-class named entity distinct from its key
The system SHALL model a **Machine** as a durable entity `{ machine_id, account_id,
label, role, ... }` that is distinct from the access key that authorizes a daemon. A
Machine's `machine_id` SHALL be stable across credential rotations and hardware
replacements: it SHALL NOT be minted fresh per key. A key SHALL bind to an existing
Machine's `machine_id` rather than defining a new machine identity by its own
existence. Every path that issues a key SHALL create (or resolve to) a Machine
entity first — no key SHALL exist without a backing Machine row, regardless of which
creation surface (browser approval page, headless key-issuance form) produced it.

#### Scenario: Machine id survives a key rotation
- **WHEN** a Machine's key is revoked and a new key is issued for the same Machine
- **THEN** the `machine_id` is unchanged and the Machine's identity and history persist

#### Scenario: Key binds to a Machine
- **WHEN** an access key is issued
- **THEN** it maps to `(account_id, machine_id)` where `machine_id` identifies a durable Machine, not the key

#### Scenario: Headless key issuance creates a backing Machine
- **WHEN** a key is issued through the headless "Get a key" form rather than the browser approval flow
- **THEN** a Machine entity is created (or an existing one is resolved by label) before the key is issued, so the key is never left without a backing Machine row
