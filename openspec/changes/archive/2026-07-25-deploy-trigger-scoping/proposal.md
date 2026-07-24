## Why

`deploy-qa.yml` triggers on every push to `master`, so a commit that touches only planning documents runs the full pipeline: unit tests, a QA deploy, the live e2e suite, and an automatic PROD promotion of a bit-identical artifact. The two commits that archived `settings-form-controls` and added the `downtime-robustness` proposal did exactly that — they changed nothing under `backend/` or `daemon/`, and still redeployed PROD.

It is wasted CI minutes on a free-tier budget and, more importantly, it is noise: a PROD deploy should mean something shipped. Deploys that cannot possibly change behaviour dilute that signal and make the deploy history harder to read when something does go wrong.

## What Changes

- **The QA→PROD pipeline triggers only on changes that can affect the deployed system** — application code, tests, and the infrastructure that builds or deploys it. Documentation and planning artifacts no longer trigger a deploy.
- **The exclusion is expressed as a denylist, not an allowlist.** Paths are deployed unless explicitly known to be inert, so a newly added source directory can never be silently excluded from deployment and from the e2e that gates PROD.
- Excluded: `openspec/**`, `docs/**`, and Markdown anywhere. Everything else — `backend/`, `daemon/`, `ui/`, workflows, lockfiles, configuration — continues to trigger the pipeline.
- A commit touching both documentation and code still deploys, since the trigger fires when *any* changed path is outside the exclusions.
- Unchanged: `ci.yml` (pull requests and `workflow_call` only), `deploy-prod.yml` (manual dispatch), `release.yml` (tag only). The queueing behaviour and the e2e gate in front of PROD are untouched.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `deployment-pipeline`: QA auto-deploys on every push to the main branch **that can affect the deployed system**, rather than on every push without qualification.

## Impact

- **Workflow** (`.github/workflows/deploy-qa.yml`): a `paths-ignore` filter on the `push` trigger, plus a comment explaining why it is a denylist.
- No change to the jobs, the e2e gate, the PROD promotion, or the `cancel-in-progress: false` queueing.
- **Risk accepted**: a docs-only push no longer revalidates against live QA. That validation was incidental — nothing it exercises can change without a non-excluded path also changing — but it does mean drift in the deployed environment itself (an expired credential, a Cloudflare-side change) surfaces on the next real deploy rather than on the next push of any kind.
