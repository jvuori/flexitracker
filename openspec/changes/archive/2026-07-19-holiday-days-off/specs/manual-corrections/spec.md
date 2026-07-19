## ADDED Requirements

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
