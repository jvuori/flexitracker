## MODIFIED Requirements

### Requirement: Day timeline with edit mode
Each day's lane SHALL show its timeline of active spans on the shared 0–24h scale with corrections overlaid and visually distinguished. The timeline SHALL also show raw idle/off-computer periods as a distinct layer even when they have been auto-bridged into working time, so no counted period hides an underlying gap. Time excluded by a `remove_work` correction SHALL be rendered as a distinct "excluded" band rather than hidden as a plain gap, so the user can tell excluded time from mere inactivity. Time marked as **overtime** SHALL be rendered as its own distinctly-coloured band, visually separable from flextime work, exclusions, and gaps. Selecting a day SHALL expand its lane in place to reveal edit controls; there SHALL be no separate day-detail screen.

Within the expanded lane, **every period of the day SHALL be a selectable object** — measured, auto-bridged, manual, reviewable, removed, overtime, and plain idle gaps alike — such that activating any point on the lane selects the period covering that point, including selecting a plain gap by activating the visually empty track over it. The lane SHALL provide a mirrored list of the day's periods offering the same selection, so selection is operable by pointer, touch, and keyboard.

Selecting a period SHALL reveal an inline action strip (not a floating overlay) showing that period's time range, duration, and type, together with the action(s) valid for its state: a period that does not currently count toward flextime SHALL offer **Count as work** (creating an `add_work` correction over the period's own start and end), a period that currently counts SHALL offer **Exclude as private** (creating a `remove_work` correction over its own start and end), and a period produced by a manual correction SHALL offer to **undo/restore** it (deleting the underlying correction). Additionally, any non-overtime period SHALL offer **Mark as overtime** (creating an `overtime` correction over its own start and end), and an overtime period SHALL offer **Undo overtime** (deleting the underlying `overtime` correction). Correction boundaries created this way SHALL be taken from the selected period, not typed by the user.

The expanded lane SHALL also provide a single **Mark whole day as work** action that fills the office day in one step (per the manual-corrections fill requirement), and SHALL retain a manual exact-times control as a secondary/advanced path for correcting a sub-period boundary that no existing period offers.

#### Scenario: Edit controls expand in place
- **WHEN** the user selects a day in the week view
- **THEN** that day's lane expands in place to reveal its edit controls, and the user is not navigated to a separate day screen

#### Scenario: Any period is selectable
- **WHEN** the user activates a point on an expanded day's lane
- **THEN** the period covering that point is selected and shown as selected on both the timeline and the mirrored period list

#### Scenario: Plain gap selected from empty track
- **WHEN** the user activates the visually empty track between two periods
- **THEN** the plain idle gap under that point is selected and offers **Count as work**

#### Scenario: Action strip shows the state-appropriate verbs
- **WHEN** a period is selected
- **THEN** an inline action strip shows the period's time range, duration, and type, and offers the action(s) valid for its state — Count for a non-counting period, Exclude for a counting period, or undo/restore for a manual correction — plus **Mark as overtime** for any non-overtime period, or **Undo overtime** for an overtime period

#### Scenario: Correction uses the selected period's boundaries
- **WHEN** the user counts, excludes, or marks-as-overtime a selected period
- **THEN** the correction is created over that period's own start and end without the user entering any time, and the day re-renders

#### Scenario: Mark a period as overtime
- **WHEN** the user selects any non-overtime period and chooses Mark as overtime
- **THEN** an `overtime` correction is created over that period, the time is shown as a distinct overtime band, it is removed from the day's flextime working time, and the day's overtime total increases

#### Scenario: Undo an overtime period
- **WHEN** the user selects an overtime period and chooses Undo overtime
- **THEN** the underlying `overtime` correction is deleted and the day re-renders as if the overtime had never been marked

#### Scenario: Exclude an auto-bridged or measured period
- **WHEN** the user selects a measured or auto-bridged period and chooses Exclude as private
- **THEN** a `remove_work` correction excludes that period, the underlying idle/activity remains visible, and the day's working time decreases accordingly

#### Scenario: Undo a manual addition
- **WHEN** the user selects a manually-added period and chooses to undo it
- **THEN** the underlying `add_work` correction is deleted and the day re-renders as if it had never been added

#### Scenario: Restore a removed period
- **WHEN** the user selects a removed period and chooses to restore it
- **THEN** the underlying `remove_work` correction is deleted (or overridden by an `add_work`) and the period counts as working time again

#### Scenario: Mark whole day as work
- **WHEN** the user chooses "Mark whole day as work" on a day with presence overlapping the office window
- **THEN** the gaps of the office day are filled with `add_work` so the working day reads as continuous, without filling pre-work or evening gaps and without removing existing exclusions

#### Scenario: Manual exact-times as the exception path
- **WHEN** the user needs a boundary that no existing period offers (e.g. leaving mid-way through a measured span)
- **THEN** a secondary exact-times control lets them enter a start and end for an `add_work` or `remove_work` correction

#### Scenario: Corrections visually distinct
- **WHEN** a day contains both sensor spans and corrections
- **THEN** the corrections are rendered so they are distinguishable from sensor-derived spans

#### Scenario: Manually-removed time shown as excluded, not a gap
- **WHEN** a day contains time excluded by a `remove_work` correction
- **THEN** that period is rendered as a distinct "excluded" band, visually separable from empty inactivity

#### Scenario: Overtime shown as its own band
- **WHEN** a day contains time marked as overtime
- **THEN** that period is rendered as a distinctly-coloured overtime band, visually separable from flextime work, exclusions, and plain gaps

## ADDED Requirements

### Requirement: Overtime totals shown
The UI SHALL show each day's overtime total on its lane when non-zero, and the weekly summary SHALL show the week's total overtime, kept visually distinct from the flextime worked time and balance so the two are never conflated. A day or week with no overtime SHALL NOT show an overtime figure.

#### Scenario: Day overtime shown on the lane
- **WHEN** a day has overtime
- **THEN** its lane shows the day's overtime total, separate from its flextime worked time and balance

#### Scenario: Weekly overtime shown in the summary
- **WHEN** a week has overtime on one or more days
- **THEN** the weekly summary shows the week's total overtime, separate from the weekly worked time and balance

#### Scenario: No overtime shows no figure
- **WHEN** a day or week has no overtime
- **THEN** no overtime figure is shown for it
