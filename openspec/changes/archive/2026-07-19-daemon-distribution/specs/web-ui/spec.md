## ADDED Requirements

### Requirement: OS-detected daemon onboarding
For an approved (`active`) user, the web UI SHALL present a daemon onboarding surface that detects the visitor's operating system and offers the matching download (Windows or Linux) from the published release, alongside the exact `configure` command with the freshly issued access key pre-filled and the `test` command to verify connectivity. It SHALL link to per-OS auto-start instructions, including the trust step for the unsigned binary. The overall flow presented SHALL be: get approved, download, configure, test, auto-start.

#### Scenario: Download matches the visitor's OS
- **WHEN** an active user opens the machine onboarding surface
- **THEN** the download offered defaults to their detected OS, with the other platforms available

#### Scenario: Exact commands with the key
- **WHEN** a user adds a machine
- **THEN** the UI shows the ready-to-run `configure --key <key>` command and the `test` command, with the key copyable

#### Scenario: Verify guidance references no-data test
- **WHEN** a user follows the onboarding
- **THEN** they are directed to run `test` to confirm connectivity and account binding before any activity data is sent
