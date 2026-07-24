## ADDED Requirements

### Requirement: Daemon login approval surface
For an approved (`active`) user, the web UI SHALL render the approval page reached by
the daemon's browser `login` flow. It SHALL identify the machine being authorized
(its requested label) and require an explicit user action to approve issuing a key.
When the requested label already resolves to an existing Machine whose key is active
and recently seen, the page SHALL surface the conflict (including the machine's
last-seen time) and require the user to choose between replacing the existing machine
(revoking its key) and creating a separate machine — it SHALL NOT silently revoke a
live daemon.

#### Scenario: Approve a new machine
- **WHEN** an active user reaches the login approval page for a label that matches no active machine
- **THEN** they can approve, and a key is minted and handed back to the daemon

#### Scenario: Replacement conflict is surfaced
- **WHEN** the requested label matches an existing Machine with an active, recently-seen key
- **THEN** the page shows the conflict and the last-seen time and requires an explicit replace-or-separate choice before any key change

## MODIFIED Requirements

### Requirement: OS-detected daemon onboarding
For an approved (`active`) user, the web UI SHALL present a daemon onboarding surface
that detects the visitor's operating system and offers the matching download
(Windows or Linux) from the published release. The recommended path SHALL be the
browser-based `login` command, which requires no copying of a key; the surface SHALL
also present the exact `login --key <key>` command with a freshly issued key
pre-filled as a manual fallback, and the `test` command to verify connectivity. It
SHALL link to per-OS auto-start instructions, including the trust step for the
unsigned binary. The Machines tab SHALL be optional for onboarding — used for
viewing, renaming, and revoking machines — rather than the required entry point. The
overall flow presented SHALL be: get approved, download, log in, test, auto-start.

#### Scenario: Download matches the visitor's OS
- **WHEN** an active user opens the machine onboarding surface
- **THEN** the download offered defaults to their detected OS, with the other platforms available

#### Scenario: Login is the recommended path
- **WHEN** an active user views the onboarding surface
- **THEN** the browser `login` command is presented as the recommended, no-copy path, with `login --key` shown as a manual fallback

#### Scenario: Onboarding does not require the Machines tab
- **WHEN** a user onboards a daemon via `login`
- **THEN** they can complete setup without first visiting the Machines tab to add a machine

#### Scenario: Verify guidance references no-data test
- **WHEN** a user follows the onboarding
- **THEN** they are directed to run `test` to confirm connectivity and account binding before any activity data is sent
