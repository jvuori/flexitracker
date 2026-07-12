# admin-console Specification

## Purpose
TBD - created by archiving change flexi-worker-cloud. Update Purpose after archive.
## Requirements
### Requirement: Registered users overview
The admin console SHALL list registered accounts with their display email, creation time, machine count, and last-seen activity, read from the global registry.

#### Scenario: List registrations
- **WHEN** an admin opens the console
- **THEN** all registered accounts are listed with their summary details

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

