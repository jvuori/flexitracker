## ADDED Requirements

### Requirement: Browser-based daemon login command
The daemon SHALL provide a `login` command that authorizes the machine without the
user copying or pasting any secret. It SHALL open the system browser to the
backend authorization endpoint, wait for the human to authenticate and approve, and
receive the minted per-machine access key over a loopback redirect. On success it
SHALL write the key to the permission-restricted local config (0600) and run the
connectivity self-test. The command SHALL accept an optional `--name <label>` for
the machine label and SHALL default the label to the machine's hostname when
`--name` is omitted. The user SHALL never be shown the raw access key.

#### Scenario: Login writes the key with no copy/paste
- **WHEN** the user runs `flexitracker login` and completes the browser approval
- **THEN** the daemon writes the restricted config with the minted key and reports the connectivity result, without ever printing the key

#### Scenario: Login carries the machine name
- **WHEN** the user runs `flexitracker login --name "Work laptop"`
- **THEN** the machine is registered (or re-registered) under the label "Work laptop"

#### Scenario: Name defaults to hostname
- **WHEN** the user runs `flexitracker login` with no `--name`
- **THEN** the machine label defaults to the host's name

### Requirement: Loopback authorization handshake
The `login` flow SHALL use a loopback redirect: the daemon SHALL bind a listener on
`127.0.0.1` on an ephemeral port, include that callback address and a random,
unguessable `state` value in the authorization URL, and SHALL accept the backend's
redirect only when the returned `state` matches the value it generated. The backend
SHALL return a short-lived, single-use authorization code to the loopback callback
rather than the access key directly, and the daemon SHALL exchange that code for the
access key over a direct backend call. The loopback listener SHALL bind only to the
loopback interface and SHALL stop as soon as the code is received or the attempt
times out.

#### Scenario: State mismatch is rejected
- **WHEN** the loopback callback is invoked with a `state` that does not match the daemon's generated value
- **THEN** the daemon rejects the callback and does not write any config

#### Scenario: Authorization code is exchanged, not the key
- **WHEN** the backend redirects to the loopback callback
- **THEN** it carries a one-time authorization code, and the daemon exchanges it for the access key over a separate backend request

#### Scenario: Login times out cleanly
- **WHEN** the user does not complete approval within the allowed window
- **THEN** the daemon stops the loopback listener and exits with a clear error, having written no config

### Requirement: Authorization endpoint behind Access; token exchange bypassed
The backend `/device/authorize` endpoint SHALL be a browser path protected by
Cloudflare Access, so the human authenticates with Google exactly as they do for the
web UI; the daemon SHALL NOT handle Google credentials. The `/device/token`
exchange endpoint SHALL be a non-browser path exempted from the Access login
challenge (like `/ingest` and `/whoami`), authorized instead by the single-use
authorization code. The authorization code SHALL expire quickly and SHALL be
redeemable at most once. Any server-side pending-authorization state SHALL be held
in a strongly consistent store (D1 or a Durable Object), never in an
eventually-consistent store.

#### Scenario: Authorize challenges the human
- **WHEN** the daemon opens `/device/authorize` in the browser
- **THEN** Cloudflare Access requires Google sign-in before the approval page is shown

#### Scenario: Token exchange returns JSON, not a login page
- **WHEN** the daemon posts a valid authorization code to `/device/token`
- **THEN** it receives the minted access key as JSON, not an Access login page

#### Scenario: Authorization code is single-use
- **WHEN** an authorization code that was already redeemed is presented again
- **THEN** the exchange is rejected and no key is issued

### Requirement: Explicit replacement of an already-active machine
When a `login` names a label that already resolves to an existing Machine whose key
is active and recently seen, the browser approval page SHALL make replacement
explicit — surfacing that a machine with that label is already active (with its
last-seen time) and requiring the user to choose to **replace** it (revoking the
prior key so its daemon stops) or to **create a separate machine**. The flow SHALL
NOT silently revoke a live daemon's key.

#### Scenario: Replacement is confirmed, not silent
- **WHEN** a user logs in with a label whose Machine still has an active, recently-seen daemon
- **THEN** the approval page shows the conflict and requires an explicit replace-or-separate choice before any key is revoked or issued

#### Scenario: Replace revokes the prior daemon
- **WHEN** the user chooses to replace the existing machine
- **THEN** the prior key is revoked, a new key is bound to the same machine, and the old daemon stops being accepted at ingest

#### Scenario: Separate creates a distinct machine
- **WHEN** the user chooses to create a separate machine
- **THEN** a new Machine (with a distinct id) is created and the existing machine's daemon is left untouched
