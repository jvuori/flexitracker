## MODIFIED Requirements

### Requirement: Settings screen
The UI SHALL let the user edit account settings: timezone, working days, daily and weekly norms, lunch deduction and its threshold, and the daemon thresholds. The working-days control SHALL present the seven weekdays (Monday through Sunday) as an independently selectable set, default Monday–Friday, and SHALL persist the selection as the account's working days. A weekday left unselected is a non-working day.

Every setting SHALL be edited through a control that carries its own unit, so no field requires the user to convert into a stored representation:

- The timezone SHALL be chosen from a list of IANA timezone identifiers rather than typed as free text, so an identifier the system cannot interpret is not selectable. The list SHALL open with a suggested group containing UTC followed immediately by the timezone detected from the browser, marked as the current location, ahead of the full alphabetical list — so the user can pick the most likely timezone without scrolling. The control SHALL always show the timezone the account currently holds, and SHALL NOT preselect the detected timezone in place of the stored one.
- The workday start and end SHALL be edited as times of day (for example `08:00`), not as a count of minutes since midnight, and SHALL be presented together as a single **Office hours** range rather than as two independent fields.

The Settings screen SHALL group its controls into titled sections rather than presenting one flat list, and SHALL distinguish the office-hours window from the norms. The office-hours window determines *when* rules apply — which gaps are in-hours breaks and which activity belongs to the day — while the norms determine *how much* work is expected; the screen SHALL NOT label or arrange these so that the window reads as an amount of expected work.

Controls SHALL be grouped by that distinction: the private-leave threshold SHALL appear alongside the office hours, because it is only ever applied to gaps lying inside that window; the lunch deduction and its threshold SHALL appear alongside the norms, because they act on how much a day is worth rather than on when the user is present. Each section SHALL carry a short explanation of what its settings affect.
- Each duration setting — daily norm, weekly norm, lunch deduction, lunch threshold, and the private-leave threshold — SHALL be edited as hours and minutes, not as a single number in an implied unit. This applies to the private-leave threshold even though it is stored in seconds.
- Field labels SHALL NOT carry unit suffixes such as "(min)", "(min from midnight)", or "(sec)", because the control itself conveys the unit.

The stored and transported representation of each setting is unchanged; the controls convert on load and on save.

#### Scenario: Setting saved and applied
- **WHEN** the user changes a setting and saves
- **THEN** the value is persisted and applied to subsequent calculations and daemon config fetches

#### Scenario: Working days editable
- **WHEN** the user opens the Settings view
- **THEN** the seven weekdays are shown as an editable set with the account's current working days selected (Monday–Friday by default)

#### Scenario: Working days saved and applied to balances
- **WHEN** the user selects a different set of working days and saves
- **THEN** the selection is persisted and each day's norm and balance are recomputed accordingly on the next week view

#### Scenario: Timezone chosen from a list
- **WHEN** the user opens the Settings view
- **THEN** the timezone control offers IANA timezone identifiers as selectable options with the account's current timezone selected, and the user cannot enter an arbitrary string

#### Scenario: Detected timezone offered at the top of the list
- **WHEN** the user opens the timezone control from a browser reporting `Europe/Helsinki`
- **THEN** the first entries are UTC followed by `Europe/Helsinki` marked as the current location, ahead of the full alphabetical list, so neither requires scrolling

#### Scenario: Stored timezone shown, not the detected one
- **WHEN** the user opens the Settings view on an account whose timezone is still the `UTC` default, from a browser reporting `Europe/Helsinki`
- **THEN** the control shows `UTC` as the selected value, and `Europe/Helsinki` is offered as the current location but not selected

#### Scenario: Current location selected in one interaction
- **WHEN** the user picks the entry marked as the current location and saves
- **THEN** the detected timezone identifier is persisted, without the display marking reaching the stored value

#### Scenario: Workday bounds shown as times of day
- **WHEN** the user opens the Settings view on an account whose workday runs 08:00 to 16:00
- **THEN** the start and end controls show `08:00` and `16:00` rather than `480` and `960`, presented together as one Office hours range

#### Scenario: Office hours separated from norms
- **WHEN** the user opens the Settings view
- **THEN** the office-hours range appears under a section titled for office hours, the daily and weekly norms appear under a separate section, and neither the office-hours label nor its explanation describes the window as an amount of expected work

#### Scenario: Lunch grouped with the norms
- **WHEN** the user opens the Settings view
- **THEN** the lunch deduction and lunch threshold appear in the same section as the daily and weekly norms, not with the office hours

#### Scenario: Private-leave threshold grouped with office hours
- **WHEN** the user opens the Settings view
- **THEN** the private-leave threshold appears in the same section as the office-hours range, reflecting that it is only applied to gaps inside that window

#### Scenario: Sections explain what they affect
- **WHEN** the user opens the Settings view
- **THEN** each section shows a short explanation of what its settings affect, including that the office-hours window governs how gaps and activity are interpreted rather than how much work is expected

#### Scenario: Workday bound edited as a time of day
- **WHEN** the user sets the workday start control to `09:00` and saves
- **THEN** the account's workday start is persisted as 540 minutes since midnight

#### Scenario: Durations shown as hours and minutes
- **WHEN** the user opens the Settings view on an account with a 7h30m daily norm and a 37h30m weekly norm
- **THEN** each is shown as 7 hours and 30 minutes, and 37 hours and 30 minutes, in separate hours and minutes inputs

#### Scenario: Duration edited as hours and minutes
- **WHEN** the user sets the daily norm to 8 hours and 0 minutes and saves
- **THEN** the account's daily norm is persisted as 480 minutes

#### Scenario: Private-leave threshold edited in the same units as its neighbours
- **WHEN** the user opens the Settings view on an account whose private-leave threshold is 7200 seconds
- **THEN** it is shown as 2 hours and 0 minutes, and saving 1 hour 30 minutes persists 5400 seconds
