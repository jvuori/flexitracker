# machine-classification Specification

## Purpose
TBD - created by archiving change work-personal-ledgers. Update Purpose after archive.
## Requirements
### Requirement: Machine carries a durable work/personal role
Every Machine SHALL carry a `role` of `work` or `personal`, stored alongside its `label` as durable identity (survives key rotation and hardware replacement, per the existing Machine entity). The role SHALL default to `work` for a newly created Machine. A Machine's role SHALL be editable at any time after creation, independent of renaming or key revocation.

#### Scenario: New machine defaults to work
- **WHEN** a Machine is created without an explicit role choice
- **THEN** its role is `work`

#### Scenario: Role survives key rotation
- **WHEN** a Machine's key is revoked and a new key is issued for the same Machine
- **THEN** the Machine's role is unchanged

#### Scenario: Role editable independent of other Machine actions
- **WHEN** a user changes a Machine's role
- **THEN** the change is recorded without affecting the Machine's label, key, or history

### Requirement: Role is chosen at creation time, pre-selected and changeable
Every surface that creates a new Machine SHALL present a work/personal choice pre-selected to `work`, changeable before the creation action is committed, so the common case (a work machine) requires no extra step while a deliberate personal registration remains one click away.

#### Scenario: Default accepted with no extra step
- **WHEN** a user creates a machine and takes no action on the role choice
- **THEN** the Machine is created with role `work`

#### Scenario: Role changed before committing
- **WHEN** a user selects "personal" before approving/creating the machine
- **THEN** the Machine is created with role `personal`

### Requirement: Every Machine has a backing entity regardless of creation path
Every access key SHALL be bound to a Machine created through the same canonical Machine-creation path, so every key has a Machine row to carry a role (and label) on — no creation path SHALL mint a key without first creating (or reusing) a Machine entity.

#### Scenario: Headless key issuance creates a Machine
- **WHEN** a user issues a key through the headless "Get a key" form
- **THEN** a Machine entity is created (or reused, per label resolution) with the chosen role, not merely a bare key

#### Scenario: Every existing key resolves to a Machine
- **WHEN** the Machines list is rendered
- **THEN** every key shown has a backing Machine row, including keys issued before this requirement existed (backfilled)

### Requirement: Daemon and CLI are unaware of role
The role choice SHALL be made entirely by a human in the web UI, at Machine-creation time or later via the Machines list. The daemon and its CLI SHALL NOT accept, require, or transmit any role-related argument or field — in every daemon flow (`login`, `login --key`), the Machine referenced already exists (or is created by the browser-driven `/device/authorize` page) with its role already decided.

#### Scenario: Browser login never surfaces role to the daemon
- **WHEN** a user runs `flexitracker login`
- **THEN** the daemon process never receives, prompts for, or stores a role value

#### Scenario: Headless login never surfaces role to the daemon
- **WHEN** a user runs `flexitracker login --key KEY`
- **THEN** the daemon process never receives, prompts for, or stores a role value — the key it saves was already bound to a Machine whose role was set in the browser
