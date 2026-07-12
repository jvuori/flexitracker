# local-simulation Specification

## Purpose
TBD - created by archiving change flexi-worker-cloud. Update Purpose after archive.
## Requirements
### Requirement: Full stack runs locally without cloud
The entire backend (Worker, per-account Durable Object with SQLite, and the static UI) SHALL run locally via the Cloudflare local runtime with persisted local storage, requiring no deployed cloud resources and incurring no cloud cost.

#### Scenario: Local stack serves the app
- **WHEN** a developer starts the local runtime
- **THEN** the Worker, Durable Object storage, and UI are served locally and function without any cloud deployment

### Requirement: Local identity stub
In local mode the system SHALL substitute a configurable stubbed authenticated identity for Cloudflare Access, so the UI and edit actions are usable without the edge auth layer.

#### Scenario: Local login bypass
- **WHEN** the app runs locally
- **THEN** a stub identity stands in for Cloudflare Access and grants access to a test account

### Requirement: Synthetic test-data generation through the real path
The project SHALL provide a generator for realistic synthetic activity (multi-day, with breaks, meetings, and evening work across one or more machines) that flows through the real ingestion and rules pipeline, not by injecting precomputed rollups.

#### Scenario: Seed a local account
- **WHEN** a developer runs the generator against the local stack
- **THEN** synthetic events are ingested and processed by the same rules as production and become viewable weeks

### Requirement: Exercise bridging and corrections locally
A developer SHALL be able to view generated data in a local browser and exercise bridging outcomes and correction actions (include, exclude, reclassify) exactly as in the deployed app.

#### Scenario: Local correction round-trip
- **WHEN** a developer reclassifies a gap in the local UI
- **THEN** the correction is applied and the day recomputes locally, matching deployed behavior

### Requirement: Self-provisioning, repeatable fixtures
The system SHALL provide a QA-only bootstrap that, without any pre-provisioned key, wipes ALL data (the global registry and the fixtures tenant) and mints its own machine keys, so setting up the environment with data is fully repeatable and free of legacy data. The same fixtures SHALL load identically in local and QA.

#### Scenario: Clean slate every run
- **WHEN** the fixtures loader runs
- **THEN** it first wipes all existing data and mints fresh keys, so results do not depend on any prior state

#### Scenario: Identical local and QA behavior
- **WHEN** the loader runs against local or against QA
- **THEN** it performs the same wipe/load/validate steps and produces the same result

### Requirement: Scenario fixtures validated against an oracle
Fixtures SHALL be defined on RELATIVE weeks (this week, last week, …) with no fixed dates, demonstrate named scenarios (including normal, auto-bridged gaps, manual add/remove, reviewable meeting, out-of-hours, weekend) across MULTIPLE machines, and every day's computed values SHALL be validated against hand-specified expected values on each deploy.

#### Scenario: Every scenario validated on deploy
- **WHEN** a deploy runs the fixtures
- **THEN** each day's worked time, balance, and reviewable count are checked against the expected oracle and the deploy fails on any mismatch

#### Scenario: Multiple machines without manual setup
- **WHEN** fixtures are loaded
- **THEN** the loader provisions more than one machine automatically, with no manual key creation

### Requirement: Fixtures browsable via a mapped identity in QA
In QA a designated fixture identity SHALL be mapped to the fixtures account so the seeded scenarios are viewable in the UI.

#### Scenario: Fixture-email login sees the data
- **WHEN** the designated fixture identity signs in to QA
- **THEN** it sees the seeded weeks of scenario data

### Requirement: Test data can never reach PROD
The wipe/seed test surface SHALL be gated so it does not exist in PROD, and the fixtures loader SHALL refuse to run against a production target — layered so any single failure still protects PROD.

#### Scenario: Test endpoints absent in PROD
- **WHEN** a test/bootstrap or wipe endpoint is called in the PROD environment
- **THEN** it does not exist (not found) and no data is modified

#### Scenario: Loader refuses a production target
- **WHEN** the fixtures loader is pointed at a production URL
- **THEN** it refuses to run and exits without loading any data

