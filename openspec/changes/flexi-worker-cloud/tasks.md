## 1. Foundations & cost verification

- [x] 1.1 Confirm current Cloudflare free-tier Durable Object quotas and Cloudflare Access free-tier (≤50 users) terms; record findings in design.md Open Questions
- [x] 1.2 Create the repository layout: a Rust workspace (daemon) and a TypeScript Cloudflare Workers project (Worker + Durable Object), plus a static Pages assets directory
- [ ] 1.3 Provision Cloudflare resources via wrangler: Worker, Durable Object binding (SQLite backend), Pages project, and the global registry store (D1 or KV)
- [x] 1.4 Document the shared event/batch wire schema (~6 fields) in one place referenced by both Rust and TypeScript

## 2. Identity, access & registry

- [ ] 2.1 Configure Cloudflare Access with Google IdP; policy allowing any Google account on user routes and an owner-email allowlist on `/admin/*`
- [x] 2.2 Implement the global registry: `google_sub → account_id` and `access_key → (account_id, machine_id)` with strong-consistency reads
- [x] 2.3 Implement first-login account minting (stable internal `account_id` from `sub`; store email for display only)
- [x] 2.4 Implement per-machine access-key issuance and revocation, including the ready-to-run agent-config command shown in the UI
- [x] 2.5 Implement the Worker re-check of the Access identity/email for admin routes (defense in depth)

## 3. Tenant storage (Durable Object)

- [x] 3.1 Define the tenant SQLite schema: `event`, `correction`, `account_settings`, `machine`, `session`, `daily_rollup`
- [x] 3.2 Implement DO addressing by internal `account_id` and machine self-registration on first batch
- [x] 3.3 Implement the DO Alarm lifecycle: seal completed days, recompute dirty days, prune raw events past the edit window
- [x] 3.4 Implement tiered retention so reads are served from sessions/rollups and pruned raw is never scanned

## 4. Event ingestion (Worker write path)

- [x] 4.1 Implement access-key authentication and rejection of unknown/revoked keys
- [x] 4.2 Implement thin routing of authenticated writes to the resolved tenant DO
- [x] 4.3 Implement idempotent `(machine_id, batch_seq)` deduplication
- [x] 4.4 Store both daemon `ts` and server `received_at` on each event

## 5. Worktime calculation & rules

- [x] 5.1 Implement timezone-authoritative day/week bucketing (store UTC; compute in account timezone)
- [x] 5.2 Implement span pairing from transitions and heartbeat-bounded open spans
- [x] 5.3 Implement min-active-span drop and presence-based gap bridging (in-hours: bridge up to the private-leave threshold; out-of-hours: no bridging, active spans only), retaining excluded in-hours gaps as reviewable candidates
- [x] 5.4 Implement cross-midnight split and conditional lunch deduction
- [x] 5.5 Implement single-week (Mon–Sun) daily balances and weekly total against configurable norms; exact + rounded-to-0.5h presentation
- [x] 5.6 Port edge-case tests from the predecessor `workdays.py` / `activity_monitor.py` (back-dating, sudden-shutdown recovery, orphan spans, cross-midnight)

## 6. Manual corrections

- [x] 6.1 Implement `add_work` / `remove_work` correction records with provenance, authored only via the authenticated session
- [x] 6.2 Compose working time from its four sources (sensor-active, auto-bridged, manual-added, minus manual-removed) with manual removal overriding, and tag each derived period with its source for display/audit
- [x] 6.3 Mark affected day dirty on create/delete and support undo-by-deletion
- [x] 6.4 Enforce that raw events are never mutated and that raw-granularity edits are unavailable past the retention window

## 7. Rust daemon

- [x] 7.1 Implement OS idle detection (Windows `GetLastInputInfo`; Linux XScreenSaver) and session lock/logout detection, with no input-content capture
- [x] 7.2 Implement the debounced hysteresis state machine with back-dated transitions and heartbeats
- [x] 7.3 Implement persisted `last_active_time` / `last_reported_state` and reboot/crash reconciliation on startup
- [x] 7.4 Implement the permission-restricted config file `{account_id, machine_id, access_key, cached settings}` and startup settings fetch with offline fallback
- [x] 7.5 Implement the durable local outbox with whole-queue flush on reconnect and monotonic `batch_seq`
- [x] 7.6 Ensure minimal footprint (no per-poll process spawns); build a plain exe and auto-start-on-login scripts/instructions (Windows first, Linux)

## 8. Web UI (HTMX on Pages)

- [x] 8.1 Scaffold the node-free HTMX app reading the Cloudflare Access identity assertion
- [x] 8.2 Implement the current-status view from latest cross-machine events
- [x] 8.3 Implement the default week view with per-day balances, weekly total, and week navigation
- [x] 8.4 Implement the day timeline with corrections overlaid and an edit mode (select period → mark working/private + note)
- [x] 8.5 Implement the settings screen (timezone, working days, daily/weekly norms, lunch deduction + threshold, daemon thresholds) with browser-timezone pre-fill on first setup

## 9. Admin console

- [x] 9.1 Implement the registered-users overview (email, created, machine count, last seen) from the global registry
- [x] 9.2 Implement per-account machine/key views and key revocation
- [x] 9.3 Record admin mutations with admin identity and timestamp

## 10. Local simulation harness (establish early)

- [x] 10.1 Run the full stack locally via wrangler/Miniflare with persisted local Durable Object SQLite storage
- [x] 10.2 Implement a configurable local identity stub that replaces Cloudflare Access in local mode
- [x] 10.3 Build a synthetic-activity generator (multi-day; breaks, meetings, evening work; multi-machine) that posts through the real ingest pipeline
- [x] 10.4 Verify local browser viewing and bridging/correction round-trips match deployed behavior on both laptop and mobile widths

## 11. CI/CD and environments (GitHub Actions, establish early)

- [x] 11.1 Define isolated QA and PROD Cloudflare environments (separate Workers, Durable Objects, registry, Pages, Access) via named wrangler environments
- [x] 11.2 CI on every push: lint, format, type-check, and Rust + TS unit tests (blocking)
- [x] 11.3 Auto-deploy QA on push to the main branch
- [x] 11.4 Run the end-to-end integration suite against live QA after deploy (ingest → seal → week view → correction round-trip)
- [x] 11.5 Manual, explicitly-triggered PROD deploy, gated on the latest QA end-to-end run passing
- [x] 11.6 Least-privilege deploy credentials as protected secrets; assert no secret leakage and combined free-tier compliance

## 12. End-to-end validation

- [x] 12.1 Verify a full path: daemon capture → offline buffer → flush → ingest → seal → week view numbers, across a simulated multi-day/multi-machine dataset
- [x] 12.2 Verify a correction round-trip (add meeting, remove private usage) recomputes the day and updates weekly totals
- [x] 12.3 Verify timezone authority (same week identical from two browser timezones) and admin allowlist enforcement
- [ ] 12.4 Confirm end-to-end operation stays within free-tier limits
