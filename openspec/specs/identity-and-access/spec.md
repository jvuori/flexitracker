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
The authenticated UI SHALL mint a new per-machine access key on request and present the exact agent-configuration command containing it. Each key SHALL map to `(account_id, machine_id)` in the global registry and SHALL be individually revocable.

#### Scenario: Add machine
- **WHEN** a signed-in user adds a machine
- **THEN** a new access key is generated and shown within a ready-to-run agent config command

#### Scenario: Revoke one machine
- **WHEN** a user revokes a machine's key
- **THEN** that key stops resolving while other machines' keys continue to work

### Requirement: Read-only connectivity self-test for a machine key
The system SHALL expose a read-only, access-key-authenticated endpoint that echoes
the bound account and machine (and the account's status) so a daemon can prove its
key works **without emitting any activity data or mutating state**. An unknown or
revoked key SHALL be rejected. Being a non-browser path, it SHALL bypass the
interactive login so it returns JSON rather than a login page.

#### Scenario: Valid key echoes its binding
- **WHEN** the self-test endpoint is called with a valid access key
- **THEN** it returns the bound account email, machine label, and account status, and writes nothing

#### Scenario: Bad key is rejected
- **WHEN** the self-test endpoint is called with an unknown or revoked key
- **THEN** it returns 401

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

