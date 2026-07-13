## ADDED Requirements

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
