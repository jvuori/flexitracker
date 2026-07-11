## ADDED Requirements

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
