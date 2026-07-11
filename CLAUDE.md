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

## Local development

- The full stack runs locally on the Cloudflare local runtime (wrangler/Miniflare) with persisted local Durable Object SQLite — no cloud, no cost.
- A configurable **identity stub** replaces Cloudflare Access locally.
- Use the **synthetic-activity generator** to seed a local account and exercise bridging + corrections in a browser. Synthetic events flow through the REAL ingest + rules pipeline — never inject precomputed rollups (local behavior must match production).

## Testing

- **Unit tests** where appropriate: Rust (`cargo test`) for the daemon and rules; TypeScript unit tests for Worker/DO rules (gap-bridging, span-pairing, saldo).
- **Basic E2E integration tests** run post-QA-deploy and must validate ingest → seal → week view → correction round-trip. These gate PROD.

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
