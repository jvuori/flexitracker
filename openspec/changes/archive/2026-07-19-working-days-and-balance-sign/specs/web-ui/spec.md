## MODIFIED Requirements

### Requirement: Settings screen
The UI SHALL let the user edit account settings: timezone, working days, daily and weekly norms, lunch deduction and its threshold, and the daemon thresholds. The working-days control SHALL present the seven weekdays (Monday through Sunday) as an independently selectable set, default Monday–Friday, and SHALL persist the selection as the account's working days. A weekday left unselected is a non-working day.

#### Scenario: Setting saved and applied
- **WHEN** the user changes a setting and saves
- **THEN** the value is persisted and applied to subsequent calculations and daemon config fetches

#### Scenario: Working days editable
- **WHEN** the user opens the Settings view
- **THEN** the seven weekdays are shown as an editable set with the account's current working days selected (Monday–Friday by default)

#### Scenario: Working days saved and applied to balances
- **WHEN** the user selects a different set of working days and saves
- **THEN** the selection is persisted and each day's norm and balance are recomputed accordingly on the next week view

## ADDED Requirements

### Requirement: Signed balance presentation
Balances SHALL be presented with an explicit sign so a surplus and a deficit are distinguishable at a glance: a positive balance SHALL be prefixed with `+` and a negative balance SHALL be prefixed with `-`. This signing SHALL apply to daily and weekly balances only; plain durations such as worked time, lunch deducted, and norms SHALL NOT be signed. A non-working day that has working time SHALL display its positive credit (e.g. `+3h 00m`) rather than an inert placeholder; a non-working day with no working time MAY display a neutral placeholder.

#### Scenario: Positive balance carries a plus sign
- **WHEN** a daily or weekly balance is a surplus
- **THEN** it is shown with a leading `+` (e.g. `+2h 30m`)

#### Scenario: Negative balance carries a minus sign
- **WHEN** a daily or weekly balance is a deficit
- **THEN** it is shown with a leading `-` (e.g. `-1h 15m`)

#### Scenario: Durations are not signed
- **WHEN** worked time, lunch deducted, or a norm is shown
- **THEN** no `+` or `-` sign is prefixed to it

#### Scenario: Non-working day shows its credit
- **WHEN** a non-working day has working time
- **THEN** its lane shows the positive balance credit (e.g. `+3h 00m`) instead of a placeholder

### Requirement: Non-working days visually distinct
A day whose weekday is not a working day SHALL be visually distinguished from working days in the week view, so the user can tell at a glance which lanes carry no norm. The distinction SHALL be a quiet, recessive treatment (working days remain the primary surface; non-working days recede) and SHALL remain legible in both light and dark themes without obscuring the timeline. The distinction SHALL NOT rely on colour alone.

#### Scenario: Non-working day lane looks different
- **WHEN** the week view is rendered
- **THEN** non-working-day lanes are visually distinct from working-day lanes (e.g. a recessed background tint plus a muted label), legible in light and dark themes

#### Scenario: Distinction survives without colour
- **WHEN** the distinction is perceived without colour (e.g. greyscale or colour-blind viewing)
- **THEN** non-working days remain identifiable by a non-colour cue such as a label or border treatment

### Requirement: Per-day lunch deduction visible
When a day has a lunch deduction applied, that day's lane SHALL show the deducted amount, so the user can see why the day's worked time is below its gross time. A day with no lunch deduction SHALL NOT show a lunch figure. The lunch amount and the day-length threshold that triggers it remain the existing configurable settings; this requirement only concerns surfacing the per-day result.

#### Scenario: Day with lunch shows the deduction
- **WHEN** a day's gross working time exceeds the lunch threshold and a lunch deduction is applied
- **THEN** that day's lane shows the deducted lunch amount (e.g. `lunch −30m`)

#### Scenario: Day without lunch shows none
- **WHEN** a day's gross working time is at or below the lunch threshold and no lunch is deducted
- **THEN** that day's lane shows no lunch figure
