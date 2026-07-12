# manual-corrections Specification

## Purpose
TBD - created by archiving change flexi-worker-cloud. Update Purpose after archive.
## Requirements
### Requirement: Raw events are immutable
Raw sensor events SHALL never be modified or deleted by user action; corrections SHALL be recorded as a separate overlay.

#### Scenario: Edit does not touch raw
- **WHEN** a user corrects a period
- **THEN** a correction record is created and no raw event row is altered

### Requirement: Add-work and remove-work spans
A user SHALL be able to assert `add_work(span)` to count a period as working regardless of sensor data, and `remove_work(span)` to exclude a period even if the sensor observed activity. Merging two sessions SHALL be expressed as `add_work` over the gap between them.

#### Scenario: Activity-less meeting added
- **WHEN** a user marks a meeting period with no input as working
- **THEN** an `add_work` correction makes that period count as working time

#### Scenario: Private usage removed
- **WHEN** a user marks a period of private computer use
- **THEN** a `remove_work` correction excludes that period from working time

### Requirement: Correction precedence and provenance
Corrections SHALL take precedence over the sensor-derived timeline for their span and SHALL be recorded with provenance so each derived period can be attributed to its source: sensor activity, automatic bridging, manual addition, or manual removal.

#### Scenario: Manual removal overrides sensor
- **WHEN** a `remove_work` span overlaps sensor-observed activity
- **THEN** the overlapping period is excluded and attributed to a manual removal

#### Scenario: Manual removal overrides automatic bridging
- **WHEN** a `remove_work` span overlaps a period that was counted by automatic bridging
- **THEN** the overlapping period is excluded and attributed to a manual removal

### Requirement: Corrections authored via authenticated session
Corrections SHALL be created only through the authenticated web session (Google identity), not via the daemon access key. Creating or deleting a correction SHALL mark the affected day for recomputation.

#### Scenario: Unauthorized correction rejected
- **WHEN** a write attempts to create a correction without a valid authenticated session
- **THEN** the correction is rejected

#### Scenario: Undo by deletion
- **WHEN** a user deletes a correction
- **THEN** the affected day is recomputed as if the correction never existed

### Requirement: Corrections persist beyond raw retention
Corrections SHALL be retained indefinitely and SHALL remain part of the audit of a sealed day even after the underlying raw events are pruned.

#### Scenario: Editing limited to retained raw
- **WHEN** a user attempts a raw-granularity edit on a day whose raw events have been pruned
- **THEN** the edit is not available while the day's sealed rollup and correction history remain visible

