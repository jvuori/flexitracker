# deployment-pipeline Specification

## Purpose
Define how FlexiTracker is built, verified, promoted, and served: every Cloudflare
operation is a version-controlled script run from GitHub Actions; QA is deployed
and validated on every push and, when green, the same commit is promoted to PROD
automatically; PROD is served on a custom domain with Cloudflare-managed TLS; and
daemon binaries are published from version tags.
## Requirements
### Requirement: Cloudflare operations run through version-controlled Actions
All Cloudflare operations — deploys AND infrastructure changes (Access applications/policies, resource bindings) — SHALL be performed by version-controlled scripts run in GitHub Actions, not by ad-hoc dashboard clicks or local commands, except for one-time credential/secret bootstraps.

#### Scenario: Deploys go through Actions
- **WHEN** code is deployed to QA or PROD
- **THEN** it is performed by a workflow running a version-controlled command, not a manual local deploy

#### Scenario: Access provisioning is codified
- **WHEN** an environment's Access applications are (re)created — both the protected app guarding the browser UI and the bypass apps for non-browser paths
- **THEN** they are provisioned by a version-controlled script run from a workflow, idempotently, printing the generated AUD for config

#### Scenario: Environment shape is derived, not flagged
- **WHEN** Access provisioning runs for a hostname
- **THEN** whether that environment gets QA-only affordances is derived from the hostname itself, so a forgotten dispatch input cannot delete or add them

### Requirement: Isolated QA and PROD environments
The system SHALL provide two fully isolated environments, QA and PROD, with separate Cloudflare resources and data, so QA activity never affects PROD.

#### Scenario: Environment isolation
- **WHEN** data is written in QA
- **THEN** PROD data and resources are unaffected

### Requirement: Automatic QA deployment on push
Every push to the main branch SHALL automatically deploy to QA via GitHub Actions.

#### Scenario: Push deploys QA
- **WHEN** a commit is pushed to the main branch
- **THEN** GitHub Actions deploys the updated code to the QA environment

### Requirement: Continuous Deployment to PROD on a green QA e2e
A push to the main branch that deploys QA and passes the end-to-end suite SHALL
automatically promote **that same commit** to PROD within the same pipeline run.
A failing e2e SHALL block the promotion. Because there is no manual approval, the
e2e suite is the only safety net in front of production and SHALL NOT be weakened
or bypassed. A manual dispatch SHALL remain available for out-of-band re-deploys
and rollbacks. The pipeline SHALL queue rather than cancel concurrent runs, so a
later push can never abort an in-flight PROD deploy.

#### Scenario: Green e2e promotes to PROD
- **WHEN** the QA end-to-end suite passes for a pushed commit
- **THEN** that same commit is deployed to PROD automatically in the same run

#### Scenario: Red e2e blocks promotion
- **WHEN** the QA end-to-end suite fails
- **THEN** PROD is not deployed and the previous PROD version remains live

#### Scenario: In-flight PROD deploy is never cancelled
- **WHEN** a second push arrives while a PROD deploy is running
- **THEN** the new run queues and the in-flight PROD deploy completes

### Requirement: PROD is served on a custom domain with managed TLS
PROD SHALL be reachable only via its custom domain, with the DNS record and TLS
certificate provisioned and renewed by Cloudflare from version-controlled config
(no manually issued or manually renewed certificates, no origin certificate). The
`*.workers.dev` URL for PROD SHALL be disabled so there is a single entrypoint.

#### Scenario: Domain and certificate are provisioned by deploy
- **WHEN** the PROD Worker is deployed with a custom-domain route in config
- **THEN** Cloudflare attaches the hostname and provisions/renews its certificate automatically

#### Scenario: No alternate PROD entrypoint
- **WHEN** the PROD `*.workers.dev` hostname is requested
- **THEN** it does not serve the application

### Requirement: Daemon releases are published from version tags
Pushing a `v*` tag SHALL build the daemon for the supported targets and publish
the artifacts to a GitHub Release under stable asset names, gated on unit tests,
with the tag verified to match the workspace version. The release build SHALL bake
in the PROD backend URL so an end user supplies only an access key.

#### Scenario: Tag produces installable artifacts
- **WHEN** a `v*` tag is pushed and unit tests pass
- **THEN** per-OS artifacts are published to a GitHub Release under stable, durable download names

#### Scenario: Tag/version mismatch fails the release
- **WHEN** the tag does not match the workspace version
- **THEN** the release fails before building

### Requirement: Retired resources are decommissioned by a guarded script
Cloudflare resources orphaned by a rename SHALL be removed by a version-controlled
script that dry-runs by default, requires explicit confirmation to execute, and
refuses to delete any resource still declared in deployment config.

#### Scenario: Live resources cannot be deleted
- **WHEN** a decommission targets a hostname or Worker still declared in `wrangler.toml`
- **THEN** the operation is refused without deleting anything

### Requirement: Unit tests gate every build
Unit tests (Rust and TypeScript) SHALL run in CI on every push and SHALL block deployment on failure.

#### Scenario: Failing unit tests block deploy
- **WHEN** unit tests fail on a push
- **THEN** the QA deployment does not proceed

### Requirement: End-to-end tests validate QA and gate PROD
After each QA deployment an end-to-end integration suite SHALL run against the live QA environment, validating basic functionality (ingestion, sealing, the week view, and a correction round-trip). PROD deployment SHALL be blocked unless the latest QA end-to-end run passed.

#### Scenario: Basic flow validated on QA
- **WHEN** the QA deployment completes
- **THEN** the end-to-end suite exercises ingestion, sealing, the week view, and a correction round-trip against QA

#### Scenario: E2E failure blocks PROD
- **WHEN** the QA end-to-end suite fails
- **THEN** PROD deployment is not permitted until it passes

### Requirement: Pipeline stays free and protects secrets
Both environments and all CI SHALL remain within free-tier limits, and deployment credentials SHALL be least-privilege secrets that never appear in logs or the repository.

#### Scenario: No secret leakage
- **WHEN** CI runs
- **THEN** credentials are injected as protected secrets and are not printed to logs or committed

#### Scenario: Within free tier
- **WHEN** both QA and PROD operate
- **THEN** combined usage stays within Cloudflare free-tier limits

