## ADDED Requirements

### Requirement: One-command authorization
The daemon SHALL provide a `configure` command that authorizes the daemon by writing the permission-restricted local config from a supplied access key, using a backend URL baked into the release build by default (overridable for self-hosters). It SHALL support both an interactive prompt and a non-interactive `--key` form so the web app can present a single paste-able command. After writing the config it SHALL run the connectivity self-test.

#### Scenario: Configure with a pasted key
- **WHEN** the user runs `configure --key <key>`
- **THEN** the daemon writes the restricted config with that key and the built-in backend URL, then reports the connectivity result

#### Scenario: Self-hoster overrides the backend
- **WHEN** the user supplies `--backend-url`
- **THEN** that URL is used instead of the baked-in default

### Requirement: Connectivity self-test without sending data
The daemon SHALL provide a `test` command that verifies end-to-end connectivity and authorization by querying a read-only endpoint and reporting reachability, key validity, the bound account email, this machine's label, and the account status. This command SHALL NOT emit, buffer, or send any activity event.

#### Scenario: Successful test shows account data
- **WHEN** the user runs `test` with a valid key
- **THEN** the daemon reports the backend is reachable, the key is valid, and prints the bound account email and machine label, having sent no activity data

#### Scenario: Test surfaces a bad key
- **WHEN** the user runs `test` with an invalid or revoked key
- **THEN** the daemon reports the authorization failure and sends no activity data

#### Scenario: Test surfaces a not-yet-active account
- **WHEN** the key belongs to an account that is not active
- **THEN** the daemon reports the account status rather than implying success

### Requirement: Productized per-OS installation with auto-start
The daemon SHALL be distributed with a productized, auto-starting install path for each supported OS: on Windows a portable package with a login-task script AND a real `setup.exe` installer; on Linux a copy/paste installer that enables the systemd user service. Each installer SHALL configure auto-start on login and SHALL run the daemon without a visible window. Because the binaries are unsigned, each install path SHALL document the OS trust step required to run them (Windows SmartScreen).

#### Scenario: Windows setup.exe installs and auto-starts
- **WHEN** a user runs the Windows `setup.exe`
- **THEN** the daemon is installed, set to auto-start on login without a window, and can capture the access key to write its config

#### Scenario: Windows portable auto-starts
- **WHEN** a user runs the portable package's auto-start script
- **THEN** a login task is registered so the daemon starts automatically at login without a window

#### Scenario: Linux one-liner enables the service
- **WHEN** a user runs the Linux install one-liner
- **THEN** the binary is installed and the systemd user service is enabled and started

#### Scenario: Unsigned-binary trust step documented
- **WHEN** a user is blocked by SmartScreen on first run
- **THEN** the installer text and docs give the exact step to allow the unsigned binary to run
