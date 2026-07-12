## ADDED Requirements

### Requirement: Cloudflare operations run through version-controlled Actions
All Cloudflare operations — deploys AND infrastructure changes (Access applications/policies, resource bindings) — SHALL be performed by version-controlled scripts run in GitHub Actions, not by ad-hoc dashboard clicks or local commands, except for one-time credential/secret bootstraps.

#### Scenario: Deploys go through Actions
- **WHEN** code is deployed to QA or PROD
- **THEN** it is performed by a workflow running a version-controlled command, not a manual local deploy

#### Scenario: Access provisioning is codified
- **WHEN** the Access bypass applications are (re)created
- **THEN** they are provisioned by a version-controlled script run from a workflow, idempotently

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

### Requirement: Manual-only PROD deployment
PROD SHALL be deployed only by an explicit manual action and SHALL NOT deploy automatically on push.

#### Scenario: No automatic PROD deploy
- **WHEN** code is pushed
- **THEN** PROD is not deployed until an explicit manual deployment is triggered

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
