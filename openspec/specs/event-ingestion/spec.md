# event-ingestion Specification

## Purpose
TBD - created by archiving change flexitracker. Update Purpose after archive.
## Requirements
### Requirement: Access-key authenticated write path
The ingest endpoint SHALL authenticate each request by resolving its access key to `(account_id, machine_id)` via the global registry and SHALL reject requests whose key is unknown or revoked. The endpoint SHALL NOT require interactive (human) authentication.

#### Scenario: Valid key accepted
- **WHEN** a daemon posts a batch with a registered, active access key
- **THEN** the request is routed to the resolved account's Durable Object for storage

#### Scenario: Unknown or revoked key rejected
- **WHEN** a request carries an access key that is not in the registry or has been revoked
- **THEN** the endpoint rejects the request without writing any events

### Requirement: Thin routing to the tenant Durable Object
The Worker SHALL act as a stateless router, forwarding an authenticated write to the Durable Object addressed by the resolved internal `account_id`.

#### Scenario: Routed by account
- **WHEN** two daemons for different accounts post concurrently
- **THEN** each write is handled by that account's own Durable Object with no cross-tenant access

### Requirement: Idempotent batch deduplication
Ingestion SHALL be idempotent on `(machine_id, batch_seq)`; a batch already recorded SHALL be acknowledged without inserting duplicate events.

#### Scenario: Re-sent batch deduplicated
- **WHEN** a daemon re-sends a batch after a lost acknowledgement
- **THEN** the backend acknowledges success and does not create duplicate events

### Requirement: Server-side receipt timestamp
For every stored event the backend SHALL record a server-side `received_at` in addition to the daemon-provided back-dated `ts`.

#### Scenario: Both timestamps stored
- **WHEN** an event is ingested
- **THEN** the stored row contains the daemon `ts` and the server `received_at`

