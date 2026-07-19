## ADDED Requirements

### Requirement: Tagged daemon release build and publish
A version-controlled GitHub Actions workflow SHALL, on a release tag, build the daemon for Windows (x86_64) and Linux (x86_64), and publish the resulting artifacts to a GitHub Release under stable asset names, so users can download them from durable public URLs. The release job SHALL be gated on the unit tests passing and SHALL run only from a tag, not on every push. It SHALL remain within free-tier CI (public-repo GitHub Actions) and MUST NOT introduce paid code-signing.

#### Scenario: Tag produces cross-platform artifacts
- **WHEN** a release tag is pushed and unit tests pass
- **THEN** the workflow builds Windows and Linux binaries and attaches them to a GitHub Release

#### Scenario: Stable download URLs
- **WHEN** the release is published
- **THEN** each platform's artifact is reachable at a stable `releases/latest/download/<asset>` URL for the web app and docs to link

#### Scenario: Failing tests block a release
- **WHEN** unit tests fail on the tagged commit
- **THEN** no release artifacts are built or published

#### Scenario: Release only from a tag
- **WHEN** a commit is pushed without a release tag
- **THEN** the release workflow does not run and no artifacts are published
