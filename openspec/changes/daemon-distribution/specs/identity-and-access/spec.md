## ADDED Requirements

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
