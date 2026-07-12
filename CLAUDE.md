# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**flexi-worker-cloud** — a personal flextime/saldo tracker. A minimal Rust daemon captures computer activity (idle/active transitions); a serverless Cloudflare backend turns it into trustworthy per-week working-time numbers the user transcribes into an employer's official system.

The full architecture, requirements, and rationale live in `openspec/changes/flexi-worker-cloud/` (`proposal.md`, `design.md`, `specs/`, `tasks.md`). **Read those before implementing**, and keep them in sync when decisions change. Significant changes get a new OpenSpec proposal before code.

## Rule #1 — Zero cost, forever (non-negotiable)

This project MUST never incur any charge — not now, not after any trial or 12-month window.

- Use ONLY Cloudflare's free **plan** and **always-free** primitives: Workers, Durable Objects (SQLite), Pages, Access (≤50 users), and a small D1/KV registry. No paid tiers. No trial-expiring services (AWS 12-month free tier is banned; AWS always-free only).
- BOTH QA and PROD run within the free tier and **share account-wide quotas** (Durable Objects, Access) — budget for that.
- If a feature cannot be built within free limits, **STOP and flag it** — never resolve it by enabling billing.
- Verify current free-tier quotas (Durable Objects, Access) as part of setup. Cost is a first-class design constraint.

## Environments & deployment

- Two **isolated** environments: **QA** and **PROD** (separate Cloudflare resources and data). Never point QA tooling or seed data at PROD.
- **QA auto-deploys on every push** to `main` via GitHub Actions.
- **PROD deploys ONLY on explicit manual instruction from the user.** Never deploy PROD automatically or on your own initiative.
- After QA deploy, the **end-to-end suite runs against live QA** (ingest → seal → week view → correction round-trip); PROD is gated on it passing.

## Cloudflare changes go through GitHub Actions (mandatory)

**All Cloudflare operations — deploys AND infrastructure (Access apps/policies, D1, bindings) — are performed by version-controlled scripts run in GitHub Actions, never by ad-hoc dashboard clicks or local `wrangler` commands.** Reproducible, reviewable, no config drift.

- Deploys: `deploy-qa.yml` (auto on `main`), `deploy-prod.yml` (manual dispatch, gated).
- Access bypass apps: `provision-access.yml` (manual dispatch) → `backend/tools/setup-access-bypass.mjs` (idempotent).
- New Cloudflare infra ⇒ add/extend a script in `backend/tools/` + a workflow; do **not** run it by hand.
- The **only** allowed manual bootstrap (chicken-and-egg / secret-bearing, done once):
  1. creating the `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` GitHub secrets,
  2. the Google IdP + the main Access application (its generated **AUD** is then committed to `wrangler.toml`),
  3. `wrangler d1 create` for the two registry DBs (their ids are committed to `wrangler.toml`).
  Everything after that is codified. (The initial QA `wrangler deploy` done during setup was a one-off bootstrap; henceforth deploys go through Actions.)
- **Required `CLOUDFLARE_API_TOKEN` scopes:** Account · *Workers Scripts: Edit*, *D1: Edit*, *Access: Apps and Policies: Edit*, *Account Settings: Read*.

## Local development

- The full stack runs locally on the Cloudflare local runtime (wrangler/Miniflare) with persisted local Durable Object SQLite — no cloud, no cost.
- A configurable **identity stub** replaces Cloudflare Access locally.
- Use the **synthetic-activity generator** to seed a local account and exercise bridging + corrections in a browser. Synthetic events flow through the REAL ingest + rules pipeline — never inject precomputed rollups (local behavior must match production).

## Testing

- **Unit tests** where appropriate: Rust (`cargo test`) for the daemon and rules; TypeScript unit tests for Worker/DO rules (gap-bridging, span-pairing, saldo).
- **Basic E2E integration tests** run post-QA-deploy and must validate ingest → seal → week view → correction round-trip. These gate PROD.

## QA test data (fixtures) & the PROD data firewall

- **QA is a disposable, fully self-provisioning scenario lab.** Every deploy runs `backend/e2e/fixtures.mjs`, which calls `POST /test/bootstrap` to **wipe ALL QA data** (registry + the fixtures tenant) and **mint its own machine keys** — no seed key, no manual step. It then re-materializes `backend/e2e/fixtures.data.mjs`: fixed scenarios (normal day, auto-bridged gaps, manual add/remove, reviewable meeting, out-of-hours, weekend, multi-machine) on **relative** weeks (this week, last week, …) so there are no fixed dates, and validates every day's computed numbers against a hand-specified oracle. Then the Access-authed smoke runs.
- **QA data may be freely manipulated by pipelines/tests** and is fully reset each deploy, so manual exploration between deploys is overwritten (that's the point — no legacy data spoils tests). Fixtures load into a fixed `qa-fixtures` account; in QA a login with `QA_FIXTURE_EMAIL` is mapped to that account so you can browse the seeded scenarios.
- Account ids are **deterministic** (derived from the identity subject) so a registry wipe re-maps to the same Durable Object instead of orphaning it.
- **PROD data is never touched.** Layered protection — all must hold:
  1. The `/test/*` endpoints (reset/machine/correction/week) exist only where `QA_TEST_MODE=1`, set **only** in `[env.qa.vars]` + local vars — **never** in `[env.prod.vars]`.
  2. `fixtures.mjs` hard-refuses any `BASE` matching `/prod/i`.
  3. No workflow runs fixtures against PROD (`deploy-prod.yml` deploys code only).
  Never add `QA_TEST_MODE` to prod, weaken the loader's prod guard, or point a fixtures run at a prod URL.

## Coding principles

- **Fail fast.** On unexpected conditions, crash loudly rather than masking or "coping" — surface the root cause immediately. Do not swallow errors or add defensive fallbacks that hide bugs.
- **Document root causes.** When a failure is investigated and its root cause found, record it here (or the relevant doc) so the same mistake never recurs. Treat this file as a living postmortem log — see *Known pitfalls* below.
- **Built to grow.** This is the first of many features. Keep capabilities modular and independently specifiable; version the DO SQLite schema with migrations; version public APIs.

## Quality bars (world-class, non-optional)

- **Security:** least privilege everywhere; per-machine access keys are write-only and rotatable; secrets only via GitHub/Cloudflare secret stores — never in code, logs, or the repo; validate all input at the ingest boundary; the two-realm auth (Google for humans via Access, per-machine keys for daemons) is load-bearing — do not weaken it.
- **UX:** node-free HTMX, accessible, and **fluent on both laptop and mobile** (responsive, touch-friendly); the day timeline always shows raw idle periods even when auto-bridged — never hide *why* a minute counts.
- **Architecture & code quality:** typed, linted, formatted, tested, reviewed in CI; keep the Worker a thin router and the per-account Durable Object the unit of isolation; store timestamps in UTC and compute in the account timezone.

## Stack & conventions

- **Backend:** TypeScript + Hono on Cloudflare Workers; per-account Durable Object with embedded SQLite. **Daemon:** Rust. **UI:** vanilla JS / HTMX on Cloudflare Pages. **GA primitives only — no beta.**
- If any Python tooling is ever added, use `uv` exclusively (per global rules) — but prefer Rust/TS to keep the toolchain uniform.

## Known pitfalls (root causes — keep this updated)

<!-- Append an entry whenever a bug's root cause is identified, so it is never repeated.
     Format: - **Symptom** → root cause → fix/prevention. -->

- **UI served the static placeholder instead of the Worker-rendered app** → a
  `wrangler.toml` `assets = { directory = "../ui" }` binding serves static files
  first, so `/` resolved to `ui/index.html` and shadowed the Worker route. Fix:
  the UI is fully Worker-rendered, so the assets binding was removed. If static
  assets are reintroduced, use a non-root path or `run_worker_first` so `/` still
  hits the Worker.
