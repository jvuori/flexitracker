# admin-console Specification

## Purpose
TBD - created by archiving change flexitracker. Update Purpose after archive.
## Requirements
### Requirement: Registered users overview
The admin console SHALL list registered accounts with their display email, **approval status**, creation time, machine count, and last-seen activity, read from the global registry, so the admin has basic usage stats and can act on any account.

#### Scenario: List registrations
- **WHEN** an admin opens the console
- **THEN** all registered accounts are listed with their status and summary details (email, joined, last-seen, machine count)

### Requirement: Machine and key administration
The admin console SHALL let an admin view an account's machines and access keys and revoke a key.

#### Scenario: Admin revokes a key
- **WHEN** an admin revokes a machine's access key
- **THEN** that key stops resolving for ingestion

### Requirement: Admin access restricted to allowlist
The admin console SHALL be reachable only by allowlisted owner emails, enforced by the Cloudflare Access policy and re-verified in the Worker.

#### Scenario: Direct request by non-admin denied
- **WHEN** a non-allowlisted authenticated user requests an admin route directly
- **THEN** the request is denied

### Requirement: Admin actions are auditable
Administrative mutations (such as key revocation) SHALL record who performed them and when.

#### Scenario: Revocation recorded
- **WHEN** an admin revokes a key
- **THEN** the action is recorded with the admin identity and timestamp

### Requirement: Registration approval queue
The admin console SHALL present a queue of `pending` registration requests showing each requester's email, request time, and optional note, and SHALL let an admin **approve** (→ `active`) or **reject** (→ `rejected`) each one. Every decision SHALL be audited with the admin identity and timestamp.

#### Scenario: Approve a request
- **WHEN** an admin approves a pending request
- **THEN** the account becomes `active`, leaves the queue, and the decision is recorded with the admin identity

#### Scenario: Reject a request
- **WHEN** an admin rejects a pending request
- **THEN** the account becomes `rejected`, leaves the queue, and the decision is recorded

### Requirement: Kick out a user
The admin console SHALL let an admin disable an `active` account. Disabling SHALL set the account to `disabled`, revoke all of its machine keys so its daemons stop being ingested, and be audited.

#### Scenario: Disable stops the daemon
- **WHEN** an admin disables an active user
- **THEN** that user's access keys stop resolving at ingestion and the user can no longer reach the app

### Requirement: New-request notification is best-effort and free
On a new access request the system SHALL best-effort notify the admin via a native Cloudflare Email Routing `send_email` message to a configured verified address, and SHALL degrade to the in-app queue as the authoritative surface when no mail binding is configured. It SHALL NOT depend on any third-party email service and SHALL NOT email end users. A notification failure SHALL NOT fail the user's request.

#### Scenario: Notify when mail is configured
- **WHEN** a new access request is submitted and an email-sending binding + admin address are configured
- **THEN** a plain-text notification is sent to the admin's verified address

#### Scenario: Degrade gracefully without mail
- **WHEN** no mail binding is configured
- **THEN** the request still succeeds and appears in the in-app registrations queue, with no error surfaced to the user

