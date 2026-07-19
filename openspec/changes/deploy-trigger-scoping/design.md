## Context

`deploy-qa.yml` fires on `push: branches: [master]` with no path filter. Every push therefore runs unit tests → QA deploy → live e2e → automatic PROD promotion. `ci.yml` is `pull_request` + `workflow_call` only and `deploy-prod.yml` is `workflow_dispatch`, so this is the single trigger that needs scoping.

The repository has five top-level directories — `backend/`, `daemon/`, `docs/`, `openspec/`, `ui/` — of which two contain nothing the deployment can read.

## Goals / Non-Goals

**Goals:**
- A push that cannot change deployed behaviour does not deploy.
- A push that *can* change deployed behaviour always deploys — this property must not be weakened, because the e2e gate in front of PROD is the only safety net.
- The filter stays obvious enough that nobody has to reason about it before pushing.

**Non-Goals:**
- Not changing what the pipeline does once triggered — jobs, e2e gate, promotion, and queueing are untouched.
- Not scoping `ci.yml`, `deploy-prod.yml`, or `release.yml`.
- Not introducing per-component deploys (e.g. daemon-only changes skipping the backend deploy); the pipeline stays all-or-nothing.

## Decisions

### 1. A denylist (`paths-ignore`), not an allowlist (`paths`)

The request was framed as "trigger only on code, tests or infra", which reads as an allowlist. A denylist is the safer encoding of the same intent, because the two options fail in very different directions:

| | If a new path is added and nobody updates the filter |
| --- | --- |
| **Allowlist** (`paths: backend/**, daemon/**, …`) | A new source directory silently stops triggering. Code merges to `master`, no deploy, no e2e, and the omission is invisible until someone notices PROD is stale. |
| **Denylist** (`paths-ignore: openspec/**, docs/**, **/*.md`) | A new documentation directory triggers a pointless deploy. Wasted minutes, nothing else. |

The allowlist's failure mode is silence, and silence is the expensive one here: the e2e is the only thing standing in front of PROD, so "did not run" must never be the default for anything unrecognised. Deploy unless proven inert.

`ui/` is included in the deploying set even though the assets binding was removed and the UI is Worker-rendered today — precisely the kind of judgement that should not be baked into a trigger. If it is genuinely dead, delete the directory; do not encode its deadness in CI.

### 2. Exclusions are limited to paths that cannot be read at build or run time

`openspec/**` (planning artifacts), `docs/**` (reference documentation), and `**/*.md` anywhere. Nothing in the build reads Markdown: the Worker is bundled from `backend/src`, the daemon from `daemon/crates`, and the release assets are binaries. `CLAUDE.md` and the READMEs are for humans.

The one way this becomes wrong is if Markdown ever becomes an input — a generated docs site, or content compiled into the UI. That would need the exclusion narrowed, and it is called out in the workflow comment so the next person meets the constraint where they would break it.

### 3. Mixed commits deploy

GitHub evaluates `paths-ignore` across the whole changed set and runs the workflow when *any* changed file falls outside it. A commit touching both `openspec/**` and `backend/src/**` therefore deploys. This is the required behaviour and needs no extra configuration, but it is worth stating because the opposite reading — "ignored if it touches any ignored path" — is the intuitive misreading.

## Risks / Trade-offs

- **Docs-only pushes no longer revalidate the live environment** → that validation was incidental rather than designed; nothing it covers can change without a non-excluded path changing too. The real exposure is environmental drift (an expired token, a Cloudflare-side change) surfacing at the next real deploy instead of the next push of any kind. Accepted: a scheduled or manual `deploy-prod.yml` dispatch already exists if a liveness check is ever wanted deliberately, rather than as a side effect of pushing a document.
- **Someone adds an inert top-level directory and gets pointless deploys** → the harmless direction, by construction (decision 1).
- **Someone assumes an allowlist and adds a source directory expecting it to be listed** → the denylist means they get deploys by default; the workflow comment states the rule so the assumption is corrected on contact.

## Migration Plan

Single workflow edit; effective on the next push. Rollback is deleting the `paths-ignore` block. No state, no resources, nothing to undo.

## Open Questions

- Should a scheduled run (say weekly) exercise the e2e against live QA to catch environmental drift now that quiet weeks may see no deploy at all? It would restore the incidental coverage this change removes, deliberately rather than accidentally. Left out here to keep the change to one concern.
