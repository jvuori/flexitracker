## ADDED Requirements

### Requirement: Timeline scale and ruler
Every day timeline SHALL span a fixed full-day 0–24h scale in the account timezone and SHALL render a time ruler with tick marks at three levels — hour (most prominent), half-hour, and quarter-hour — together with hour numbers labelling 0 through 24. The fixed scale ensures activity outside normal working hours (early morning, late evening, weekend) is always visible rather than clipped.

#### Scenario: Ruler shown on every lane
- **WHEN** a day timeline is rendered
- **THEN** it shows hour, half-hour, and quarter-hour tick marks distinguished by prominence, and hour numbers from 0 to 24

#### Scenario: Out-of-hours activity remains visible
- **WHEN** a day contains activity before the configured workday start or after its end (e.g. a span starting shortly after midnight)
- **THEN** that activity is still drawn on the 0–24h lane and is not clipped out of view

## MODIFIED Requirements

### Requirement: Week view as default
The default view SHALL present one ISO week (Monday–Sunday) with per-day working time, per-day balance, and the weekly total against the weekly norm, and SHALL allow navigating between weeks. Each day SHALL be rendered as an inline lane on the week page that combines, on one row, the day label, the day's full 0–24h timeline, and the day's numbers (rounded working time, gross minus lunch, and daily balance). A weekly summary SHALL be shown above the lanes reporting worked time, weekly norm, lunch deducted, and weekly balance.

#### Scenario: Navigate weeks
- **WHEN** the user moves to the previous or next week
- **THEN** that week's per-day and total figures are shown with no carryover between weeks

#### Scenario: Day timeline and numbers shown together
- **WHEN** the week view is rendered
- **THEN** each day shows its timeline and its per-day numbers together in one lane, without navigating to a separate screen

#### Scenario: Weekly summary present
- **WHEN** the week view is rendered
- **THEN** a summary shows the week's total worked time, weekly norm, lunch deducted, and weekly balance

### Requirement: Day timeline with edit mode
Each day's lane SHALL show its timeline of active spans on the shared 0–24h scale with corrections overlaid and visually distinguished. The timeline SHALL also show raw idle/off-computer periods as a distinct layer even when they have been auto-bridged into working time, so no counted period hides an underlying gap. Time excluded by a `remove_work` correction SHALL be rendered as a distinct "excluded" band rather than hidden as a plain gap, so the user can tell excluded time from mere inactivity. Selecting a day SHALL expand its lane in place to reveal edit controls; there SHALL be no separate day-detail screen. In the expanded lane, the user SHALL be able to select a period and mark it as working or private with an optional note.

#### Scenario: Edit controls expand in place
- **WHEN** the user selects a day in the week view
- **THEN** that day's lane expands in place to reveal its edit controls, and the user is not navigated to a separate day screen

#### Scenario: Correction created from timeline
- **WHEN** the user selects a gap in edit mode and marks it as working with a note
- **THEN** a correction is submitted and the day re-renders with the updated timeline

#### Scenario: Corrections visually distinct
- **WHEN** a day contains both sensor spans and corrections
- **THEN** the corrections are rendered so they are distinguishable from sensor-derived spans

#### Scenario: Reviewable excluded gap surfaced and included
- **WHEN** a day contains an in-hours gap excluded as private leave
- **THEN** the gap is highlighted as a review candidate and a single action includes it as working time via an `add_work` correction

#### Scenario: Auto-bridged gap visible and excludable
- **WHEN** a day contains a short in-hours gap that was auto-bridged into working time
- **THEN** the underlying idle period is visible and a single action excludes it via a `remove_work` correction

#### Scenario: Manually-removed time shown as excluded, not a gap
- **WHEN** a day contains time excluded by a `remove_work` correction
- **THEN** that period is rendered as a distinct "excluded" band, visually separable from empty inactivity

#### Scenario: Removed period re-included in one action
- **WHEN** the user chooses to re-include a period previously marked private
- **THEN** an `add_work` correction restores it as working time and the day re-renders
