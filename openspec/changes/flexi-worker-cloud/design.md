## Context

A single user wants automatic, trustworthy capture of computer working time to transcribe into an employer's official flextime system. The predecessor `jvuori/flexi-worker` solved the activity-detection and workday-grouping problems well (in Python, single-user, local files) but is not deployable as a hosted multi-device service. This rebuild keeps that domain logic as a specification and rebuilds the architecture under three hard constraints:

1. **Zero cost, indefinitely** — no service whose free tier expires after a trial/12-month window. Cloudflare's free *plan* (not a trial) and AWS *always-free* tiers qualify; AWS 12-month tiers do not.
2. **Serverless only** — no Linux servers to run for free.
3. **Minimal-footprint native daemon** — Rust, Windows-first, invisible background operation.

The user has Cloudflare (DNS registrar) and AWS accounts. The decision was to go **all-in on Cloudflare** with **GA-only** primitives.

## Goals / Non-Goals

**Goals:**
- Capture activity as a compact stream of back-dated state transitions, filtered at the edge to minimize payloads.
- Multi-tenant cloud storage with strong per-tenant isolation and flat performance over 10+ years of daily use.
- Real user identity (Google) with a clean split between human read/edit access and machine write access.
- Let the user correct history (add/remove working periods) without ever mutating raw sensor data.
- Present one flextime week at a time, optimized for reading numbers off to type elsewhere.

**Non-Goals (v1):**
- Cumulative/carryover saldo across weeks or long-term balance caps.
- MSI installer or Windows Service; a plain exe + auto-start-on-login scripts suffice.
- Cryptographic payload signing (Ed25519) — obsoleted by real auth (see Decisions).
- Capability-URL / view-token unauthenticated access — replaced by Google login.
- Data export (CSV), mobile-specific apps, live systray indicator.

## Decisions

### 1. All-in Cloudflare, TypeScript backend
Cloudflare's free plan has no expiry clock and no egress traps, directly satisfying "free forever." Python was preferred but Cloudflare's Python Workers are beta; **TypeScript + Hono** is the mature, GA path (the Workers runtime is a JS engine). The event payload is a handful of fields, so keeping the wire schema in sync between the Rust daemon and the TS backend by hand is cheap.
*Alternatives:* AWS Lambda (Python, mature) — rejected because API Gateway's free tier expires at 12 months and the always-free math is tighter and multi-service; Rust-via-`workers-rs` (would share the schema crate with the daemon) — rejected as rougher DX for marginal gain; Cloudflare Python Workers — rejected as beta.

### 2. Durable-Object-per-account with embedded SQLite = the tenant boundary
Each account maps deterministically to a Durable Object via `idFromName(internal_account_id)`; the DO's embedded SQLite database physically isolates that tenant's data. This is the user's requested "client-specific DBs" done natively.
*Alternatives:* D1 database-per-tenant — **rejected**: the free plan caps the number of D1 databases (single digits) and dynamic creation/binding is awkward. Shared D1 with an `account_id` column — rejected: shared limits, noisy-neighbor, not physically separate.
*Consequences (all favorable here):* the free plan's Durable Objects use exactly this SQLite backend, so "free" and "per-tenant DB" are the same choice; a DO is single-threaded per instance, so state-machine reconciliation, span pairing, and day sealing run with no cross-request races; scales to unlimited tenants. Cross-tenant queries are hard — acceptable, tenants are independent (the admin console reads the small global registry instead).

### 3. The Durable Object also hosts the rules/processing tier via Alarms
Rather than a separate Queue or cron Worker, each tenant's DO uses a **DO Alarm** to run a nightly job inside the same object that holds its data: seal the previous day into sessions/rollups, recompute days marked dirty by edits, and prune raw events past the retention window. The Worker stays a ~thin router.
*Alternatives:* Cloudflare Queues (real-time processing) — rejected as overkill; read-time-only computation — rejected because the time-of-day gap-bridging rule is stateful policy that benefits from a materialized seal.

### 4. Tiered retention makes decade-scale trivial
We store summaries forever, not raw events forever. Raw events are kept only for the **edit window** (a few months) then pruned; **sessions**, **daily rollups**, and **corrections** are kept forever (a few MB per machine after a decade). Reads hit the tiny rollups/sessions, never the raw firehose, so write and read performance stay flat because the hot table is *bounded*, not merely fast. The edit window and the raw-retention window are deliberately the **same knob**.

### 5. Two-realm identity: Google for humans, per-machine keys for daemons
Humans authenticate with **Google via Cloudflare Access** (read + edit). Daemons hold a **per-machine access key** in their config and include it in every payload; the backend resolves key → `(account_id, machine_id)`. This is the clean read/write split achieved with two standard mechanisms, and it removes every secret that used to live in a URL. A small **global registry** (D1 or KV) maps `google_sub → account_id` and `access_key → (account_id, machine_id)`; the DO is addressed by the **stable internal `account_id`**, never the email, because email is mutable and the DO address must never move. The logged-in UI mints a per-machine key and shows the exact agent-config command; revocation deletes one key row without disturbing other machines.
*Alternatives:* capability-URL + view-token + Ed25519 payload signing (the earlier design) — **rejected/removed**: real auth obsoletes all three; the access key never appears in a URL, so signing (which existed to protect a URL-borne secret) buys nothing. Email as account key — rejected: mutable, would orphan the DO. Single per-account key — rejected in favor of per-machine keys for independent revocation and a nicer add-machine flow.

### 6. Admin is an email allowlist, not a separate auth system
`/admin/*` is gated by a Cloudflare Access policy restricting it to the owner's email; the Worker re-checks the Access JWT email against an allowlist (defense in depth). Admin reads the global registry (registered users, machines, keys) — it is cross-tenant by nature and therefore lives outside the per-tenant DOs.

### 7. Immutable raw events + a mutable correction overlay
Raw events are append-only sensor truth and are **never mutated** (mutating them would break the daemon's crash-recovery reconciliation and destroy the sensor-vs-human distinction). Human edits are a separate overlay of `add_work(span)` / `remove_work(span)` records with provenance; "merge two sessions" is just `add_work` over the gap. Working time is therefore composed from three additive sources — direct sensor activity, automatic bridging (settings + time), and manual additions — minus manual removals (which override all of them); every derived period keeps its source so the UI can show *why* a minute counts. Corrections are authored through the authenticated web session (not the access key, which is write-only for the daemon and can't sign browser edits), are account-level (a meeting has no machine input to attribute), and take precedence over sensor-derived timeline. Undo = delete the correction and recompute the day.
*Rationale over the literal "inject one pseudo event":* a single pseudo event only bridges a gap if it splits it below the bridge threshold, which is fragile for long meetings; a span states intent unambiguously regardless of duration.

### 8. Edge/cloud filtering split, ported from the predecessor
Noise filtering is spread across three stages, matching `workdays.py`: (1) **daemon** idle-debounce with hysteresis (idle must persist `min_inactivity`; optional `min_activity` active-debounce to keep sub-threshold jitter off the wire), emitting back-dated transitions; (2) **backend** min-active-span drop; (3) **backend** presence-based gap bridging. Reboot/sleep (when the daemon isn't running) is handled separately by persisted `last_active_time` / `last_reported_state` reconciled on startup. Threshold *numbers* live in server-side settings and are fetched by the daemon, so a headless fleet is retunable centrally without redeploying.

### 8a. Gap bridging is two presence regimes, not two thresholds
Bridging encodes two opposite default assumptions about presence rather than one rule with two numbers. **During working hours** the user is assumed present: gaps (coffee, lunch, short meetings) are counted as working time unless a gap exceeds the configured **private-leave threshold** (default ~2h), at which point it is excluded as private leave. **Outside working hours** the user is assumed off: gaps are never bridged and only actual active spans count, so sporadic evening work accrues per-burst while the personal breaks between bursts are excluded. This is why post-processing matters, and it works **both directions**: every in-hours idle gap is preserved with a *default* classification the user can flip. An excluded long gap (a 2h business lunch) is flagged as a reviewable candidate and one action includes it (`add_work`); a short auto-bridged gap that was actually private is equally visible and one action excludes it (`remove_work`). Crucially, **auto-bridging never hides the raw gap** — the timeline renders raw idle/off-computer periods as their own layer even when counted, so a counted stretch can always be inspected and reclassified. Routine breaks are handled automatically by the defaults; the ambiguous tail (either direction) is resolved by explicit human review, which is exactly what the immutable-raw + correction-overlay model (Decision 7) enables.

### 9. Single-week saldo, timezone-authoritative
The product shows one ISO week (Mon–Sun) at a time with per-day working time, per-day balance vs a configurable daily norm (default 7.5h), and a weekly total vs an independent configurable weekly norm (default 37.5h). There is **no** cumulative saldo. Lunch is a configurable deduction applied only when the day exceeds a configurable threshold. Times display exact with a rounded-to-0.5h value alongside for transcription. All timestamps are stored in **UTC**; a **per-account timezone setting is authoritative** for every day/week boundary and rule. The browser is used only to pre-fill that setting on first setup and never reshapes the data (otherwise the same week viewed from a different zone would produce different daily totals).

### 10. Local-first development via the Cloudflare local runtime
The full stack runs locally on the Cloudflare local runtime (wrangler/Miniflare) with persisted local DO SQLite, a stubbed identity replacing Cloudflare Access, and a synthetic-activity generator that feeds the **real** ingest + rules pipeline (not injected rollups). This gives fast, zero-cost iteration where bridging and corrections behave exactly as in production.
*Alternatives:* mocking the DO/rules for UI work — rejected as it would let local behavior drift from production, which is unacceptable for logic as subtle as gap-bridging.

### 11. Two isolated environments, QA-auto / PROD-manual, E2E-gated
GitHub Actions drives CI/CD. Named wrangler environments give QA and PROD fully separate Workers, Durable Objects, registry, Pages, and Access configuration/domains. Every push runs lint/format/type-check and Rust+TS unit tests (blocking), then auto-deploys **QA**. A post-deploy end-to-end suite runs against live QA (ingest → seal → week view → correction round-trip); **PROD** deploys only on an explicit manual trigger and only when the latest QA E2E passed. This yields continuous validation with a human-controlled production gate and catches regressions on QA before they can reach real data.
*Alternatives:* single environment — rejected (no safe place to validate before prod); auto-deploy to PROD on green — rejected (user requires an explicit human gate).

### 12. Cross-cutting standards (non-negotiable)
- **Zero cost, forever:** only free-plan / always-free primitives, across *both* environments; a feature that cannot be built free is escalated, never paid for. Cost is a first-class design constraint, not an afterthought.
- **World-class security:** least privilege throughout; access keys write-only and rotatable; secrets only in GitHub/Cloudflare secret stores; all ingest input validated; the two-realm auth model is load-bearing and must not be weakened.
- **World-class UX:** node-free HTMX, accessible, and fully responsive — fluent on both laptop and mobile; the timeline never hides why a minute counts (raw idle shown even when auto-bridged).
- **Fail fast:** on unexpected conditions, crash loudly rather than masking or "coping" with them, so the root cause surfaces immediately; do not swallow errors. When a failure is investigated and its root cause identified, record it in `CLAUDE.md` (or the relevant doc) so the same mistake is not repeated.
- **Architecture & code quality:** typed, linted, formatted, tested, reviewed; thin Worker, per-tenant DO isolation, UTC storage with account-timezone computation.
- **Built to grow:** this is the first of many features — capabilities stay modular and independently specifiable, the DO SQLite schema is versioned with migrations, and public APIs are versioned.

## Risks / Trade-offs

- **Free-tier quotas could change / be exceeded** → Verify current Durable Object and Cloudflare Access (≤50 users) free-tier terms before committing, remembering QA and PROD share account-wide quotas; personal-scale usage sits far under all limits. This is the one open cost risk to the "zero forever" guarantee.
- **Dependency on Google + Cloudflare Access** → Accepted for real identity and near-zero auth code; hand-rolled OIDC in the Worker is a documented fallback if Access terms change.
- **Access key is a bearer secret in payloads** → Mitigated by TLS transport (never in a URL), write-only scope, per-machine granularity, and one-click rotation from the UI; a leak lets an attacker inject events into one account (annoying, revocable), never read data.
- **Source-side filtering is lossy and permanent** → Intended: sub-threshold breaks are dropped at the edge and cannot be recovered. Thresholds are server-side settings so they can be tuned before data is lost.
- **Daemon/server clock skew** → Store both the daemon `ts` (back-dated truth) and server `received_at` (trust boundary); rules choose per case.
- **Edits after the retention window** → Raw-granularity editing is only possible while raw events exist; past the window the sealed rollup + its correction records remain as the frozen, audited record.
- **Wayland idle detection** → The predecessor's XScreenSaver path is X11-only; Wayland needs logind/D-Bus or is accepted as a v1 limitation (Windows is the priority target).
- **Two-language schema drift** (Rust ↔ TS) → Payload is ~6 fields; kept in sync by hand with a shared documented schema, accepted over the friction of `workers-rs`.

## Migration Plan

Greenfield — no data or system to migrate. Rollout order: (1) provision Cloudflare Worker + DO + Access + registry; (2) implement ingest + storage + rules; (3) daemon MVP against the live ingest endpoint; (4) web UI; (5) admin console. Rollback is redeploy/disable of the Worker; no external state to unwind.

## Open Questions

- Exact current numbers for Cloudflare free-tier DO quotas and Access user limits (verification, not a design change).
- Whether machine-level threshold overrides are ever needed, or settings stay strictly per-account (default: per-account).
