## ADDED Requirements

### Requirement: Overtime as a correction kind
A user SHALL be able to assert `overtime(span)` to mark a period as overtime, recorded as an `overtime` correction over the selected period's own boundaries rather than as an edit to raw events. An `overtime` correction SHALL be distinct from `add_work` and `remove_work` and SHALL take precedence over both for any overlapping time: within an overtime span the time is overtime, neither flextime-counted nor flextime-removed. Overtime corrections SHALL be authored through the authenticated web session, SHALL mark the affected day for recomputation, and SHALL carry their identity so a specific overtime period can be undone precisely by deleting the correction(s) covering it.

#### Scenario: Mark a period as overtime
- **WHEN** the user marks a selected period as overtime
- **THEN** an `overtime` correction is created over that period's own start and end, no raw event is altered, and the day recomputes with that time as overtime

#### Scenario: Overtime overrides add and remove
- **WHEN** an `overtime` span overlaps an `add_work` or `remove_work` over the same time
- **THEN** the overlapping time is treated as overtime, not as flextime-added or flextime-removed

#### Scenario: Undo overtime by deletion
- **WHEN** the user undoes a selected overtime period
- **THEN** the `overtime` correction(s) covering it are deleted by id and the day recomputes as if the overtime had never been marked

#### Scenario: Overtime authored only via authenticated session
- **WHEN** an overtime create or delete is attempted without a valid authenticated session
- **THEN** it is rejected, consistent with other corrections
