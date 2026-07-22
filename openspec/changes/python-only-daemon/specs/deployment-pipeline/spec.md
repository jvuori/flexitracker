## MODIFIED Requirements

### Requirement: Release tag matches the workspace version
The daemon package version SHALL be derived from the release tag by the build
backend (hatch-vcs), so the tag *is* the version and the tag,
`flexitracker --version`, and the published assets cannot drift — there is no
separately-maintained version string to keep in sync. A build with no release tag
(a development build) SHALL report version `0.0.0`. The release build SHALL bake
in the PROD backend URL so an end user supplies only an access key.

#### Scenario: The published version is the tag
- **WHEN** a release is cut for tag `vX.Y.Z`
- **THEN** the wheel and the executables report version `X.Y.Z`, derived from the tag with no manual version bump

#### Scenario: A development build reports 0.0.0
- **WHEN** the daemon is built or run from an untagged checkout
- **THEN** `flexitracker --version` reports `0.0.0`

#### Scenario: Backend URL is built in
- **WHEN** a released artifact is run without an explicit backend override
- **THEN** it targets the PROD backend, so the user supplies only an access key

### Requirement: Tagged daemon release build and publish
A version-controlled GitHub Actions workflow SHALL, when a GitHub Release is published, build and publish the Python daemon package (wheel + sdist) to a package index (PyPI) via keyless trusted publishing so users can `uv tool install` it, and SHALL build a standalone single-file executable for Windows and Linux, attaching them to the Release under stable asset names for durable public download URLs. The release job SHALL be gated on the unit tests passing and SHALL run only from a published Release, not on every push. It SHALL remain within free-tier CI (public-repo GitHub Actions), use keyless or secret-free publishing, and MUST NOT introduce paid code-signing.

#### Scenario: Publishing a Release produces the installable package
- **WHEN** a GitHub Release is published and unit tests pass
- **THEN** the workflow publishes the Python wheel + sdist to PyPI and attaches the standalone Windows + Linux executables to the Release

#### Scenario: Stable install references
- **WHEN** the release is published
- **THEN** the package is reachable at a stable, `uv`-installable reference (and any executable at a stable `releases/latest/download/<asset>` URL) for the web app and docs to link

#### Scenario: Failing tests block a release
- **WHEN** unit tests fail on the tagged commit
- **THEN** no release artifacts are built or published

#### Scenario: Release only on a published Release
- **WHEN** a commit is pushed to a branch without publishing a GitHub Release
- **THEN** the release workflow does not run and no artifacts are published

#### Scenario: No secret enters the repo or CI logs
- **WHEN** the package is published from CI
- **THEN** it uses a stable public artifact reference or keyless publishing, introducing no secret into the world-readable repository or CI logs
