# FlexiTracker

Personal flextime/saldo tracker. A minimal Rust daemon captures computer
activity; a serverless Cloudflare backend turns it into trustworthy per-week
working-time numbers to transcribe into an official time system.

See [`CLAUDE.md`](./CLAUDE.md) for the operating rules (chief among them: **zero
cost, forever**) and [`openspec/changes/flexitracker/`](./openspec/changes/flexitracker/)
for the full architecture, specs, and task plan.

## Layout

| Path        | What |
|-------------|------|
| `backend/`  | Cloudflare Worker (TypeScript + Hono) and the per-account Durable Object (SQLite). |
| `daemon/`   | Rust workspace: `flexitracker-core` (shared wire schema) and `flexitracker-daemon` (the agent). |
| `ui/`       | Node-free HTMX static assets for Cloudflare Pages. |
| `docs/`     | Cross-cutting docs, incl. the [wire schema](./docs/wire-schema.md). |

## Develop

Backend (Node 20+ recommended for the latest wrangler):

```bash
cd backend
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run dev         # wrangler dev (local simulation)
```

Daemon:

```bash
cd daemon
cargo build
cargo test
```

## Deploy

QA deploys automatically on push to `main`. PROD deploys **only** on an explicit
manual trigger, gated on the QA end-to-end suite passing.
