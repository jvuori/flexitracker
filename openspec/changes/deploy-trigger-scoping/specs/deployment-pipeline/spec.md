## MODIFIED Requirements

### Requirement: Automatic QA deployment on push
Every push to the main branch that changes any path capable of affecting the deployed system SHALL automatically deploy to QA via GitHub Actions. Application code, tests, and the build and deployment infrastructure are all such paths.

A push that changes only planning artifacts or documentation SHALL NOT trigger a deployment, since it cannot alter the deployed system and a deploy that cannot change behaviour dilutes the meaning of the deploy history.

The distinction SHALL be expressed as an exclusion of known-inert paths rather than as a list of included paths, so that a path not yet accounted for deploys by default. A newly added source directory must never be silently excluded from deployment and therefore from the end-to-end suite that gates PROD.

A push that changes both excluded and non-excluded paths SHALL deploy.

#### Scenario: Push deploys QA
- **WHEN** a commit changing application code, tests, or build and deployment infrastructure is pushed to the main branch
- **THEN** GitHub Actions deploys the updated code to the QA environment

#### Scenario: Documentation-only push does not deploy
- **WHEN** a commit changing only planning artifacts or documentation is pushed to the main branch
- **THEN** no deployment runs, and the deployed system is left as it was

#### Scenario: Mixed push deploys
- **WHEN** a pushed commit changes both documentation and application code
- **THEN** the deployment runs, because at least one changed path can affect the deployed system

#### Scenario: An unrecognised path deploys by default
- **WHEN** a commit changes a path that the exclusion list does not mention
- **THEN** the deployment runs, because paths deploy unless explicitly excluded
