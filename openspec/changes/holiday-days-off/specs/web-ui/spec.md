## ADDED Requirements

### Requirement: Mark a day as holiday
The expanded day lane SHALL offer a day-level action to mark the whole day as a holiday and, when it is already a holiday, to clear it. This action is distinct from the per-period Count/Exclude actions: it targets the day, not a selected period. A day that is a holiday SHALL be visibly indicated as such on its lane, and its balance SHALL be presented consistently with a zero-norm day (a credit when work was done, neutral otherwise).

#### Scenario: Mark and clear from the day lane
- **WHEN** the user opens a day and chooses "Mark as holiday"
- **THEN** the day is recorded as a holiday, the lane shows a holiday indicator, and the action toggles to "Clear holiday"

#### Scenario: Holiday day balance reads as a zero-norm day
- **WHEN** a holiday day is shown with no working time
- **THEN** its lane does not show a norm deficit, consistent with a day that carries no norm

#### Scenario: Worked holiday shows its credit
- **WHEN** a holiday day has working time
- **THEN** its lane shows the positive credit for that worked time
