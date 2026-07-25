## MODIFIED Requirements

### Requirement: Add-work and remove-work spans
A user SHALL be able to assert `add_work(span)` to count a period as working within a chosen ledger regardless of sensor data, and `remove_work(span)` to exclude a period from a chosen ledger even if the sensor observed activity there. Every correction SHALL be recorded against exactly one ledger (`work` or `personal`) and SHALL affect only that ledger's computation — it SHALL NOT alter the other ledger's totals. Merging two sessions SHALL be expressed as `add_work` over the gap between them, within the ledger currently being viewed.

#### Scenario: Activity-less meeting added
- **WHEN** a user marks a meeting period with no input as working, while viewing the work ledger
- **THEN** an `add_work` correction on the work ledger makes that period count as working time in work mode only

#### Scenario: Private usage removed
- **WHEN** a user marks a period of private computer use, while viewing the work ledger
- **THEN** a `remove_work` correction on the work ledger excludes that period from working time, and the period does not appear in the personal ledger as a result

#### Scenario: Personal-ledger activity included
- **WHEN** a user marks a period as counting, while viewing the personal ledger
- **THEN** an `add_work` correction on the personal ledger makes that period count as personal activity, without affecting the work ledger

### Requirement: Correction precedence and provenance
Corrections SHALL take precedence over the sensor-derived timeline for their span, within their own ledger, and SHALL be recorded with provenance so each derived period can be attributed to its source: sensor activity, automatic bridging (work ledger only), manual addition, or manual removal. When an `add_work` and a `remove_work` overlap the same span **within the same ledger**, the `add_work` SHALL win: that overlapping time counts as working time in that ledger and is attributed to a manual addition, kept distinct from the surrounding sensor spans. A period the user re-includes therefore SHALL NOT be permanently defeated by an earlier removal in the same ledger. Corrections against different ledgers SHALL NOT interact with each other's precedence.

#### Scenario: Manual removal overrides sensor
- **WHEN** a `remove_work` span overlaps sensor-observed activity within the same ledger
- **THEN** the overlapping period is excluded from that ledger and attributed to a manual removal

#### Scenario: Manual removal overrides automatic bridging
- **WHEN** a `remove_work` span overlaps a period that was counted by automatic bridging in the work ledger
- **THEN** the overlapping period is excluded from the work ledger and attributed to a manual removal

#### Scenario: Manual addition overrides an earlier removal
- **WHEN** an `add_work` span overlaps a period previously excluded by a `remove_work` in the same ledger
- **THEN** the overlapping time counts again in that ledger, attributed to a manual addition and kept visually distinct from the surrounding sensor spans

#### Scenario: Corrections on different ledgers do not interact
- **WHEN** a `remove_work` exists on the work ledger and an `add_work` exists on the personal ledger for the overlapping range
- **THEN** each ledger's computation reflects only its own correction, independent of the other ledger's corrections

### Requirement: Fill the working day preserves explicit exclusions
The system SHALL provide a single operation that marks the working day as continuous work by adding work across the gaps of the office day. This operation is a work-ledger-only concept — it SHALL NOT be offered while viewing the personal ledger, since the personal ledger has no office-hours window. The office day's envelope SHALL run from the natural start of the first presence period that overlaps the configured office window to the natural end of the last such period; the office-window boundaries themselves SHALL NOT be used as correction timestamps. The operation SHALL add work over the gaps within that envelope, on the work ledger, and SHALL NOT extend the envelope to, or fill gaps adjacent to, presence that lies entirely outside the office window (pre-work or evening activity). Existing work-ledger `remove_work` exclusions within the envelope SHALL be preserved by the fill.

#### Scenario: Gaps within the office day are filled
- **WHEN** the user marks the whole day as work and the day has presence overlapping the office window with gaps between the sessions
- **THEN** those gaps are covered by a work-ledger `add_work` so the office day reads as continuous, using the natural arrival and departure times as the envelope bounds

#### Scenario: Pre-work and evening activity are not filled
- **WHEN** the day also contains a pre-work check that never reaches the office window and an evening session after it
- **THEN** neither anchors the envelope and the gap adjacent to them is not filled

#### Scenario: Existing exclusions survive the fill
- **WHEN** the day contains a work-ledger `remove_work` exclusion inside the envelope and the user marks the whole day as work
- **THEN** the fill covers only the gaps and leaves the exclusion in place

#### Scenario: Fill is unavailable in personal mode
- **WHEN** the user is viewing the personal ledger
- **THEN** "Mark whole day as work" is not offered, since the personal ledger has no office-day envelope to fill

### Requirement: Holiday marker as a full-day correction
A user SHALL be able to mark a full day as a holiday and to clear that mark, recorded as a `holiday` correction spanning that local day rather than as an edit to raw events. A `holiday` correction is a work-ledger-only concept, since only the work ledger has a norm to zero — it SHALL NOT be offered or have any effect while viewing the personal ledger. A `holiday` correction SHALL be distinct from `add_work` and `remove_work`: it changes only the work ledger's day norm disposition (per worktime-calculation) and SHALL NOT itself add or remove working time. Creating or clearing a holiday SHALL be authored through the authenticated web session and SHALL mark the affected day for recomputation. A holiday SHALL be retained as part of the day's audit like any other correction, and clearing it SHALL delete the correction so the day recomputes as if it had never been marked.

#### Scenario: Mark a day as holiday
- **WHEN** the user marks a day as a holiday
- **THEN** a `holiday` correction spanning that local day is created, no raw event is altered, and the work ledger's day is recomputed with a zero norm

#### Scenario: Clear a holiday
- **WHEN** the user clears a day's holiday marker
- **THEN** the `holiday` correction is deleted and the day recomputes as if it had never been marked

#### Scenario: Holiday does not add or remove work
- **WHEN** a day has measured activity and is marked as a holiday
- **THEN** the measured activity still counts as working time in the work ledger and the holiday only zeroes the day's norm

#### Scenario: Holiday authored only via authenticated session
- **WHEN** a holiday create or clear is attempted without a valid authenticated session
- **THEN** it is rejected, consistent with other corrections

#### Scenario: Holiday has no meaning in personal mode
- **WHEN** the user is viewing the personal ledger on a day marked as a holiday
- **THEN** the personal ledger's totals are unaffected, since it carries no norm for the holiday to zero

## ADDED Requirements

### Requirement: Move a period to the other ledger
A user SHALL be able to move a selected period or manually-entered range from the ledger currently being viewed to the other ledger, as a single action. This SHALL be implemented as a `remove_work` correction on the current ledger paired with an `add_work` correction on the other ledger, over the same span, both created atomically. This is distinct from — and SHALL NOT replace — the ability to exclude a period from the current ledger without moving it anywhere (a bogus reading, or activity by someone else on that machine, which SHALL count in neither ledger).

#### Scenario: Move personal-machine activity into work
- **WHEN** the user is viewing the personal ledger and moves a selected period to the other side
- **THEN** the period is excluded from the personal ledger and an equivalent `add_work` correction makes it count in the work ledger

#### Scenario: Move work-machine activity into personal
- **WHEN** the user is viewing the work ledger and moves a selected period to the other side
- **THEN** the period is excluded from the work ledger and an equivalent `add_work` correction makes it count in the personal ledger

#### Scenario: Move works regardless of which machine produced the underlying activity
- **WHEN** a period is moved to the other ledger and the underlying sensor evidence came from a machine whose role does not match the destination ledger
- **THEN** the move still succeeds — moving a period reclassifies how the time is tracked, not which physical machine recorded it

#### Scenario: Exclude remains available as a distinct action from move
- **WHEN** the user selects a period and chooses to exclude it rather than move it
- **THEN** the period is excluded from the current ledger only and does not appear in the other ledger

#### Scenario: A range already present in the destination ledger is not double-counted
- **WHEN** a moved range overlaps time that already counted in the destination ledger (e.g. from a different machine's own activity)
- **THEN** the destination ledger's total reflects that range once, not twice
