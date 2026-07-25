# identity-and-access Specification

## Purpose
TBD - created by archiving change flexitracker. Update Purpose after archive.
## Requirements
### Requirement: Human authentication via Google
Human access to the web UI SHALL be authenticated with Google via Cloudflare Access; unauthenticated users SHALL NOT reach user data.

#### Scenario: Login required
- **WHEN** an unauthenticated visitor requests a user page
- **THEN** they are challenged to sign in with Google before any data is served

### Requirement: Stable internal account identity
On first login the system SHALL mint a stable internal `account_id` and map the Google `sub` to it; storage addressing SHALL use `account_id`, never the email, which is stored for display only.

#### Scenario: Email change does not move data
- **WHEN** a user's Google email changes but the `sub` is unchanged
- **THEN** their account and data remain addressed by the same `account_id`

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

### Requirement: Non-interactive CI authentication uses a Service Auth policy
Where automation must reach identity-authenticated routes non-interactively, the
Access application SHALL authorize it with a dedicated **Service Auth** policy
(decision `non_identity`) for the service token. A plain `allow` policy — even one
including the service token — SHALL NOT be relied on, because it still forces
interactive authentication and returns the login page to the caller.

#### Scenario: CI reaches authed routes without a browser
- **WHEN** CI calls an identity-authenticated route with a valid service token
- **THEN** Access admits the request and the app resolves an identity from it, rather than serving a login page

### Requirement: Global registry separate from tenant data
The system SHALL maintain a small global registry (mapping `google_sub → account_id` and `access_key → (account_id, machine_id)`) stored outside the per-tenant Durable Objects.

#### Scenario: Key resolves account
- **WHEN** an ingest request presents an access key
- **THEN** the registry resolves it to the owning account and machine

### Requirement: Per-account timezone setting
Each account SHALL have a timezone setting that governs all boundary and rule calculations, editable from the authenticated settings screen.

#### Scenario: Timezone drives calculation
- **WHEN** a user changes their account timezone
- **THEN** subsequent day/week boundaries and rules are evaluated in the new timezone

### Requirement: Admin gated by email allowlist
Administrative access SHALL be restricted to owner emails on an allowlist, enforced both by a Cloudflare Access policy on `/admin/*` and by a re-check of the Access identity in the Worker.

#### Scenario: Non-admin blocked
- **WHEN** an authenticated non-admin user requests an admin page
- **THEN** access is denied by both the Access policy and the Worker re-check

### Requirement: Read-only connectivity endpoint for the daemon
The backend SHALL expose a read-only `GET /whoami` endpoint authenticated by a per-machine access key that returns the bound account's display email, the machine label/id, and the account status, and that neither stores nor emits any activity data. It SHALL reject an unknown or revoked key. As a non-browser path it SHALL be exempted from the Cloudflare Access login challenge (like `/ingest`, `/config`, `/health`) so it returns JSON rather than a login page.

#### Scenario: Whoami echoes account binding
- **WHEN** a valid access key calls `GET /whoami`
- **THEN** the response contains the bound account email, the machine label, and the account status, and no activity data is recorded

#### Scenario: Whoami rejects a bad key
- **WHEN** an unknown or revoked key calls `GET /whoami`
- **THEN** the request is rejected as unauthorized

#### Scenario: Whoami is not challenged by Access
- **WHEN** the daemon calls `GET /whoami` without a browser session
- **THEN** it receives a JSON response, not an Access login page

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

