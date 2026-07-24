## Why

Onboarding a daemon today is a manual, error-prone ritual: the user opens the
**Machines** tab, types a label, clicks **Add machine**, and copies a per-machine
access key that is **shown once and then lost forever**. If they miss it they must
issue a fresh key. The secret travels by human copy/paste from the browser to
`flexitracker configure --key <KEY>` on the target machine.

The daemon can do this itself. It can open a browser for the human to authenticate
(exactly the Google-via-Access login they already trust), and receive the minted
key directly — the user copy/pastes nothing and never sees the raw secret. This is
also the moment the system finally distinguishes a **logical machine** ("Work
laptop") from the **credential** that authorizes it, which is a prerequisite for
per-machine working-time views (a follow-up proposal).

## What Changes

- **`flexitracker login` becomes the single authorization command**, replacing
  `configure`. By default it runs an OAuth authorization flow: the daemon opens the
  system browser to a backend endpoint behind Cloudflare Access, the human
  authenticates with Google and approves, and the backend returns the minted
  per-machine key to the daemon over a **loopback redirect** (`127.0.0.1:<port>`).
  The daemon writes the key to `config.toml` (0600). `--name` is optional and
  defaults to the hostname. A non-interactive **`login --key <KEY>`** form preserves
  the paste-a-key path for headless/scripted setups (fed by the web "Add machine"
  button). The user copy/pastes nothing and never sees a secret on the default
  browser path.
- **First-class `Machine` entity** (`{ machine_id, account_id, label, ... }`),
  durable and named, **distinct from the access key**. A Machine outlives the
  hardware and its credentials. Re-registering an existing label ("new Work
  laptop") issues a **new key bound to the same `machine_id`**, so the event stream
  and future per-machine history continue seamlessly. (Today `machine_id` is a
  random UUID minted per *key*, conflating device and credential.)
- **One-daemon-per-machine invariant**: at most **one active key per Machine**.
  Re-registering **revokes the prior key**, preventing two daemons from writing
  interleaved `active`/`idle` events under one `machine_id` (which would corrupt
  span pairing). When `login` targets a label whose Machine still has a live
  daemon, the browser approval page makes replacement **explicit** ("Work laptop is
  already active, last seen 3 min ago — replace it or create a separate machine?"),
  never a silent kill.
- **Machines tab becomes optional** — reduced to view / rename / revoke. It is no
  longer required to onboard a daemon.
- **New `/device/*` backend routes** and a Cloudflare **Access bypass** app for the
  non-browser token-exchange path (like `/ingest`, `/whoami`), provisioned through
  `provision-access.yml`.
- **The `configure` command is removed** — its capability is folded into
  `login --key`, so the daemon's command surface is just **`login` + `test`**. The
  web "Add machine" button remains (it issues a key for the `login --key` fallback).
  Pre-release with no users, so no deprecated alias is kept.

## Capabilities

### New Capabilities
- `daemon-onboarding`: the browser-based device-authorization flow that lets a
  daemon self-register — the `login` command, the `/device/authorize` (protected)
  and `/device/token` (Access-bypassed) endpoints, the loopback handshake, the
  approval/replacement UX, and the security properties (short-lived single-use
  authorization code, strongly-consistent pending state, no Google credential ever
  reaching the daemon).

### Modified Capabilities
- `identity-and-access`: per-machine key issuance now also flows through the device
  authorization grant; introduces the Machine entity as the stable unit a key binds
  to; adds the one-active-key-per-Machine invariant and label-based re-registration
  (new key, same `machine_id`).
- `activity-daemon`: replaces the `configure` command with a single `login`
  command (browser flow by default, `--key` for the manual/headless form),
  leaving `test`; documents that `--name` defaults to the hostname and that a
  successful browser login writes the key without displaying it.
- `tenant-storage`: the `machine` registry becomes a first-class named entity keyed
  by a stable `machine_id` with a human `label`, decoupled from key rows.
- `web-ui`: the Machines tab is repositioned as optional management (view / rename /
  revoke) rather than the required onboarding entry point.

## Impact

- **Daemon** (`daemon-py/`): new `login` command and loopback listener in
  `cli.py`; `config.py` unchanged in shape (still stores the key).
- **Backend** (`backend/src/`): new `/device/authorize` + `/device/token` routes in
  `index.ts`; `registry.ts` gains the Machine model and label-based re-registration
  with prior-key revocation; `ui/render.ts` reworks the Machines tab and adds the
  approval/replacement page.
- **Infra**: `backend/tools/setup-access-*.mjs` + `provision-access.yml` add a
  bypass app for `/device/token`; `/device/authorize` stays protected. Pending-auth
  state (if any) lives in **D1 or a Durable Object**, never KV (eventual
  consistency would make the handshake flaky) — the loopback design avoids needing
  a poll loop at all.
- **No new dependencies; zero-cost constraint holds** — Workers + D1/DO only.
- **`configure` removed**, folded into `login --key`; the daemon exposes only
  `login` + `test`. The manual "Add machine" flow remains as the `login --key`
  source. Safe pre-release (no users to break).
- **Deliberately out of scope** (deferred to the `per-machine-worktime` proposal):
  per-machine weekly view / multi-select, the `counts_as_work` flag, adding
  `machine_id` to `daily_rollup`/`session`, and union-at-read. This change only
  needs the Machine entity to *exist*.
