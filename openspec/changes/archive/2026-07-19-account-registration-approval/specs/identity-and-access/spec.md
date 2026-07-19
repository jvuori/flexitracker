## ADDED Requirements

### Requirement: Self-service registration with admin approval gate
Every account SHALL carry an approval `status` of `pending`, `active`, `rejected`, or `disabled`. On first login a new account SHALL be created `pending` and SHALL have **no** capability: all user-data and machine-management routes SHALL return 403 while the account is not `active`, except a minimal self-view (`GET /api/me`) and the registration submission (`POST /api/register`). A `pending` user SHALL be able to submit an access request (with an optional note), and only an admin approval SHALL transition the account to `active`.

#### Scenario: First login creates a pending account
- **WHEN** a Google identity signs in for the first time and is not an admin
- **THEN** a `pending` account is created and the user cannot reach any user data or mint any machine key

#### Scenario: Pending user requests access
- **WHEN** a `pending` user submits the access request
- **THEN** the account records the request (and optional note) and the user sees an on-screen confirmation that an admin will review it

#### Scenario: Approval grants capability
- **WHEN** an admin approves a `pending` account
- **THEN** the account becomes `active` and the user can load the full app and mint machine keys

#### Scenario: Non-active account is capability-gated
- **WHEN** a `pending`, `rejected`, or `disabled` user requests any user-data route or attempts to mint a machine key
- **THEN** the request is denied with 403 while `GET /api/me` still reports their status

### Requirement: Admin bootstrap via allowlist
An account whose email is on the `ADMIN_EMAILS` allowlist SHALL be created (or repaired) as `active` on login, so the owner obtains capability without any prior approver.

#### Scenario: Owner self-bootstraps
- **WHEN** an email on `ADMIN_EMAILS` signs in
- **THEN** the account is `active` immediately, with no approval step required

## MODIFIED Requirements

### Requirement: Per-machine access-key issuance and revocation
The authenticated UI SHALL mint a new per-machine access key on request **only for an `active` account**, and present the exact agent-configuration command containing it. A non-`active` account SHALL NOT be able to mint a key. Each key SHALL map to `(account_id, machine_id)` in the global registry and SHALL be individually revocable. When an account is disabled, all of its keys SHALL be revoked.

#### Scenario: Add machine
- **WHEN** a signed-in `active` user adds a machine
- **THEN** a new access key is generated and shown within a ready-to-run agent config command

#### Scenario: Non-active user cannot add a machine
- **WHEN** a `pending`, `rejected`, or `disabled` user attempts to add a machine
- **THEN** no key is issued and the request is denied

#### Scenario: Revoke one machine
- **WHEN** a user revokes a machine's key
- **THEN** that key stops resolving while other machines' keys continue to work

#### Scenario: Disabling an account revokes its keys
- **WHEN** an admin disables an account
- **THEN** every access key for that account stops resolving for ingestion
