## MODIFIED Requirements

### Requirement: OS-detected daemon onboarding
For an approved (`active`) user, the web UI SHALL present a daemon onboarding surface
that detects the visitor's operating system and offers the matching download
(Windows or Linux) from the published release. The recommended path SHALL be the
browser-based `login` command, which requires no copying of a key; the surface SHALL
also present the exact `login --key <key>` command with a freshly issued key
pre-filled as a manual fallback, and the `test` command to verify connectivity. The
headless "Get a key" fallback SHALL present a work/personal role choice, pre-selected
to `work` and changeable before the key is issued. The surface SHALL present the
per-OS auto-start command inline, copy-pasteable, matching the detected OS (a
Windows registry `reg add` command, or the Linux `systemctl --user` commands),
including the trust step for the unsigned binary, rather than only linking out to
external docs. The Machines tab SHALL be optional for onboarding — used for viewing,
renaming, revoking, and reclassifying machines — rather than the required entry point.
The overall flow presented SHALL be: get approved, download, log in, test, auto-start.

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

#### Scenario: Headless key issuance offers a role choice
- **WHEN** a user issues a key through the headless "Get a key" fallback
- **THEN** they can choose work or personal, pre-selected to work, before the key is issued

#### Scenario: Auto-start command shown inline, matching the detected OS
- **WHEN** an active user reaches the auto-start step of the onboarding surface
- **THEN** the exact copy-pasteable command for their detected OS is shown on the page itself (a Windows `reg add ...\Run` command, or Linux `systemctl --user` commands), with no need to leave the page to find it
