# manual-corrections Specification

## Purpose
TBD - created by archiving change flexitracker. Update Purpose after archive.
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
Corrections SHALL take precedence over the sensor-derived timeline for their span and SHALL be recorded with provenance so each derived period can be attributed to its source: sensor activity, automatic bridging, manual addition, or manual removal. When an `add_work` and a `remove_work` overlap the same span, the `add_work` SHALL win: that overlapping time counts as working time and is attributed to a manual addition, kept distinct from the surrounding sensor spans. A period the user re-includes therefore SHALL NOT be permanently defeated by an earlier removal.

#### Scenario: Manual removal overrides sensor
- **WHEN** a `remove_work` span overlaps sensor-observed activity
- **THEN** the overlapping period is excluded and attributed to a manual removal

#### Scenario: Manual removal overrides automatic bridging
- **WHEN** a `remove_work` span overlaps a period that was counted by automatic bridging
- **THEN** the overlapping period is excluded and attributed to a manual removal

#### Scenario: Manual addition overrides an earlier removal
- **WHEN** an `add_work` span overlaps a period previously excluded by a `remove_work`
- **THEN** the overlapping time counts as working time again, attributed to a manual addition and kept visually distinct from the surrounding sensor spans

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

### Requirement: Corrections split partially-overlapping periods
A correction whose span partially overlaps existing periods SHALL affect only the overlapping sub-spans and SHALL re-attribute exactly those, leaving the non-overlapping remainder of each period intact with its original provenance. A `remove_work` SHALL exclude only time that was actually counted within its span (measured or auto-bridged), leaving portions of its span that counted nothing as plain gaps rather than marking them "removed". An `add_work` that overlaps existing counted activity SHALL cover only the surrounding uncounted time as a manual addition, leaving the real activity attributed to its own source. The resulting periods SHALL be exposed as individually selectable objects at every split boundary, not merged into a single span.

#### Scenario: Remove splits a straddling measured span
- **WHEN** a `remove_work(08:00–12:00)` overlaps a measured span 11:00–14:00
- **THEN** 11:00–12:00 is excluded as removed and 12:00–14:00 remains counted as measured

#### Scenario: Remove excludes measured and auto-bridged time within its span
- **WHEN** a `remove_work(08:00–12:00)` overlaps measured 09:00–10:00 and an auto-bridged gap 09:00–09:15
- **THEN** both the measured and the auto-bridged time within 08:00–12:00 are excluded and reported as removed

#### Scenario: Remove over uncounted time leaves plain gaps, not removed bands
- **WHEN** a `remove_work(08:00–12:00)` covers sub-ranges (e.g. 08:00–09:00, 10:00–11:00) where nothing was counted
- **THEN** those sub-ranges remain plain idle gaps and are not marked as removed

#### Scenario: Add wraps existing activity as manual addition
- **WHEN** an `add_work` span overlaps existing counted activity
- **THEN** only the surrounding uncounted time becomes a manual addition and the existing activity keeps its own provenance, un-merged

### Requirement: Derived periods carry correction identity
Each derived period produced by a manual correction — a manual addition or a manually-removed exclusion — SHALL carry the identity of the correction(s) that produced it, so that a single correction can be undone or restored precisely. Undoing such a period SHALL delete the correction(s) covering the selected period rather than inferring the target by span matching.

#### Scenario: Manual addition reports its correction
- **WHEN** a day is read and it contains a manually-added period
- **THEN** the period carries the id of the `add_work` correction that produced it

#### Scenario: Undo deletes the exact correction
- **WHEN** the user undoes a selected manual period
- **THEN** the correction(s) covering that period are deleted by id and the affected day is recomputed as if they never existed

### Requirement: Fill the working day preserves explicit exclusions
The system SHALL provide a single operation that marks the working day as continuous work by adding work across the gaps of the office day. The office day's envelope SHALL run from the natural start of the first presence period that overlaps the configured office window to the natural end of the last such period; the office-window boundaries themselves SHALL NOT be used as correction timestamps. The operation SHALL add work over the gaps within that envelope and SHALL NOT extend the envelope to, or fill gaps adjacent to, presence that lies entirely outside the office window (pre-work or evening activity). Existing `remove_work` exclusions within the envelope SHALL be preserved by the fill.

#### Scenario: Gaps within the office day are filled
- **WHEN** the user marks the whole day as work and the day has presence overlapping the office window with gaps between the sessions
- **THEN** those gaps are covered by `add_work` so the office day reads as continuous, using the natural arrival and departure times as the envelope bounds

#### Scenario: Pre-work and evening activity are not filled
- **WHEN** the day also contains a pre-work check that never reaches the office window and an evening session after it
- **THEN** neither anchors the envelope and the gap adjacent to them is not filled

#### Scenario: Existing exclusions survive the fill
- **WHEN** the day contains a `remove_work` exclusion inside the envelope and the user marks the whole day as work
- **THEN** the fill covers only the gaps and leaves the exclusion in place

### Requirement: Holiday marker as a full-day correction
A user SHALL be able to mark a full day as a holiday and to clear that mark, recorded as a `holiday` correction spanning that local day rather than as an edit to raw events. A `holiday` correction SHALL be distinct from `add_work` and `remove_work`: it changes only the day's norm disposition (per worktime-calculation) and SHALL NOT itself add or remove working time. Creating or clearing a holiday SHALL be authored through the authenticated web session and SHALL mark the affected day for recomputation. A holiday SHALL be retained as part of the day's audit like any other correction, and clearing it SHALL delete the correction so the day recomputes as if it had never been marked.

#### Scenario: Mark a day as holiday
- **WHEN** the user marks a day as a holiday
- **THEN** a `holiday` correction spanning that local day is created, no raw event is altered, and the day is recomputed with a zero norm

#### Scenario: Clear a holiday
- **WHEN** the user clears a day's holiday marker
- **THEN** the `holiday` correction is deleted and the day recomputes as if it had never been marked

#### Scenario: Holiday does not add or remove work
- **WHEN** a day has measured activity and is marked as a holiday
- **THEN** the measured activity still counts as working time and the holiday only zeroes the day's norm

#### Scenario: Holiday authored only via authenticated session
- **WHEN** a holiday create or clear is attempted without a valid authenticated session
- **THEN** it is rejected, consistent with other corrections

