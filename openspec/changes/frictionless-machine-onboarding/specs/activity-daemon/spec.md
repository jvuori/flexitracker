## MODIFIED Requirements

### Requirement: One-command authorization
The daemon SHALL authorize itself through a single `login` command; there SHALL be
no separate `configure` command. By default `login` runs the browser-based
authorization flow (opening the system browser to the backend authorization
endpoint and writing the permission-restricted local config from the key the
backend returns, with the user supplying and seeing no key — the flow's mechanics
are defined by the daemon-onboarding capability). For headless or scripted setups it
SHALL also accept a non-interactive `login --key <KEY>` form that writes the
restricted config from a supplied key (the key the web "Add machine" surface
issues). It SHALL accept an optional `--name <label>` that defaults to the hostname,
SHALL use the backend URL baked into the release build by default (overridable with
`--backend-url` for self-hosters), and SHALL run the connectivity self-test after
writing the config.

#### Scenario: Browser login authorizes without a pasted key
- **WHEN** the user runs `flexitracker login` and approves in the browser
- **THEN** the daemon writes the restricted config from the returned key and reports the connectivity result, without the user supplying or seeing a key

#### Scenario: Manual key form for headless or scripted setups
- **WHEN** the user runs `flexitracker login --key <key>`
- **THEN** the daemon writes the restricted config from that key and the built-in backend URL and reports the connectivity result, without opening a browser

#### Scenario: Self-hoster overrides the backend
- **WHEN** the user supplies `--backend-url`
- **THEN** that URL is used for the flow instead of the baked-in default

#### Scenario: No configure command
- **WHEN** the user runs `flexitracker configure`
- **THEN** the command is not recognized (authorization is done through `login`)
