## Why

Tracking flextime working hours by hand is unreliable and tedious: you forget when you started, when you took a break, and whether a long no-input stretch (a meeting) was work or not. This project captures actual computer usage automatically and turns it into trustworthy per-day working times for a single week, so the user can confidently transcribe those numbers into their employer's official time system.

It is a ground-up rebuild of the predecessor (`jvuori/flexi-worker`, a local Python/Angular tool). The hard-won activity-detection and workday-grouping logic is reused as a specification; the architecture is entirely new: a minimal Rust daemon plus a serverless, multi-tenant cloud backend that must cost **zero** indefinitely (no trial-tier expiry), built exclusively on Cloudflare's free plan and General-Availability primitives.

## What Changes

- **New Rust daemon** (Windows-first, Linux appreciated): a minimal-footprint background agent that polls OS idle time (`GetLastInputInfo` / XScreenSaver), runs a debounced hysteresis state machine, emits only back-dated state-transition events plus periodic heartbeats, survives reboots/crashes via persisted state, and buffers events in a local outbox that flushes on reconnect. Distributed as a plain executable with auto-start-on-login scripts.
- **New serverless cloud backend on Cloudflare**: a thin TypeScript/Hono Worker routes each request to a per-account Durable Object whose embedded SQLite database *is* the tenant boundary. A DO alarm performs nightly sealing, recomputation of edited days, and pruning.
- **New identity model**: humans authenticate with Google via Cloudflare Access (read/edit); daemons authenticate with per-machine access keys (write-only). A small global registry maps identities and keys to a stable internal account id.
- **New manual-correction overlay**: raw events are immutable; users add `add_work` / `remove_work` spans through the authenticated UI to fix reality (mark an activity-less meeting as work, or remove private usage).
- **New node-free web UI** (HTMX on Cloudflare Pages): current status, a default week view, a day timeline with edit mode, settings, and an admin console.
- **BREAKING vs. predecessor**: single-user local files, the Angular UI, and the always-on FastAPI service are removed and replaced by the multi-tenant serverless design.

## Capabilities

### New Capabilities
- `activity-daemon`: OS idle/session monitoring, the debounced back-dating state machine, heartbeats, crash/reboot recovery, local config, and the offline outbox with idempotent flush.
- `event-ingestion`: the Worker write path — access-key validation, resolving key → account/machine, and idempotent `(machine_id, batch_seq)` deduplication.
- `tenant-storage`: Durable-Object-per-account SQLite schema, the alarm-driven seal/recompute/prune lifecycle, and tiered retention (raw = edit window; sessions/rollups/corrections forever).
- `worktime-calculation`: the rules pass (min-active-span drop, timezone-aware gap bridging, cross-midnight split, conditional lunch deduction) and single-week saldo computation against configurable daily/weekly norms.
- `manual-corrections`: the immutable-raw + correction-overlay model and its `add_work` / `remove_work` semantics, precedence, and audit trail.
- `identity-and-access`: Google login via Cloudflare Access, the global identity/key registry, per-machine key issuance and revocation, timezone-authoritative settings, and the admin email allowlist.
- `web-ui`: the authenticated node-free HTMX screens — current status, week view, day timeline with edit mode, and settings.
- `admin-console`: cross-tenant admin views (registered users, machines, keys) gated to the owner allowlist.
- `local-simulation`: run the full stack locally with seeded synthetic data through the real pipeline — no cloud dependency or cost — to exercise bridging and corrections in a browser.
- `deployment-pipeline`: GitHub Actions CI/CD with isolated QA and PROD environments (QA auto-deploys on push, PROD manual only), unit tests, and a post-QA end-to-end suite that gates PROD.

### Modified Capabilities
- (none — greenfield repository)

## Impact

- **New codebase**, no existing code to modify. Two runtimes: a Rust workspace (daemon) and a TypeScript Cloudflare Workers project (Worker + Durable Object), plus static HTMX assets for Pages.
- **External dependencies**: Google as OIDC provider; Cloudflare Workers, Durable Objects (SQLite), Pages, Access, and a small D1/KV registry — all on the free plan. CI/CD on GitHub Actions.
- **Environments**: two isolated Cloudflare environments (QA, PROD), both within the free tier; local runtime for offline development.
- **Cost constraint to verify**: current Cloudflare free-tier Durable Object quotas and Cloudflare Access free-tier (≤50 users) terms — across both QA and PROD, which share account-wide quotas — to confirm the zero-cost-forever guarantee.
- **Data**: all timestamps stored in UTC; a per-account timezone setting is authoritative for every day/week boundary and rule.
