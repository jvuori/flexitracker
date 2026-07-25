## MODIFIED Requirements

### Requirement: Day timeline with edit mode
Each day's lane SHALL show its timeline of the currently-viewed ledger's activity on the shared 0–24h scale with corrections overlaid and visually distinguished. In the work ledger, the timeline SHALL also show raw idle/off-computer periods as a distinct layer even when they have been auto-bridged into working time, so no counted period hides an underlying gap; time excluded by a `remove_work` correction SHALL be rendered as a distinct "excluded" band rather than hidden as a plain gap. Selecting a day SHALL expand its lane in place to reveal edit controls; there SHALL be no separate day-detail screen. The collapsed week view SHALL be unaffected by anything below — it SHALL continue to show exactly one merged lane per day.

Within the expanded lane, in addition to the existing merged timeline, the system SHALL render one **raw activity lane per machine** that contributed any event that day, on the same 0–24h scale, always shown regardless of how many machines contributed (including exactly one). A raw lane SHALL show only that machine's own sensor-active intervals (per the worktime-calculation per-machine activity result) — no bridging, no office-hours distinction, no correction overlay — and SHALL NOT change appearance based on any correction, since corrections apply to the merged ledger only.

**Every segment on every lane SHALL be a selectable object** — measured, auto-bridged (work ledger only), manual, reviewable (work ledger only), removed, and plain idle gaps on the merged lane; active and idle segments on any raw per-machine lane — such that activating any point on any lane selects the object covering that point, including selecting a plain gap by activating the visually empty track over it. The merged lane SHALL provide a mirrored list of its periods offering the same selection, so selection is operable by pointer, touch, and keyboard.

Selecting an object SHALL reveal an inline action strip (not a floating overlay) showing the selection's time range and duration, together with the actions valid for it, all scoped to the ledger currently being viewed. When the selection is an exact merged period, its type is also shown and the action set is exactly as before: a period that does not currently count in the current ledger SHALL offer **Count as work**, a period that currently counts SHALL offer **Exclude** and **Move to other side**, and a period produced by a manual correction SHALL offer to **undo/restore** it. When the selection is a raw per-machine segment or a manually-entered range, the action set SHALL instead be determined by the manual-corrections overlap rule for selections without correction identity (Count/Exclude/Move gated by what the selection overlaps in the merged partition; Undo/Restore never offered). Correction boundaries created this way SHALL be taken from the selection's own start and end, not additionally typed by the user.

The expanded lane SHALL also provide a single **Mark whole day as work** action (work ledger only, per the manual-corrections fill requirement), and SHALL retain a manual exact-times control as a secondary/advanced path for a boundary no existing period or raw segment offers, itself scoped to the ledger currently being viewed and offering Count as work, Exclude, and Move to other side, gated by the same overlap rule as a raw-lane selection.

#### Scenario: Edit controls expand in place
- **WHEN** the user selects a day in the week view
- **THEN** that day's lane expands in place to reveal its edit controls, and the user is not navigated to a separate day screen

#### Scenario: Raw per-machine lanes always appear on expand
- **WHEN** the user expands a day, whether one machine or several contributed activity that day
- **THEN** a raw activity lane is shown for each contributing machine, on the same 0–24h scale as the merged lane

#### Scenario: Raw lanes never change based on corrections
- **WHEN** a correction changes the merged lane's rendering for a time range
- **THEN** the raw per-machine lanes for that range are unaffected — they continue to show only actual sensor activity

#### Scenario: Any period is selectable
- **WHEN** the user activates a point on an expanded day's merged lane
- **THEN** the period covering that point is selected and shown as selected on both the timeline and the mirrored period list

#### Scenario: A raw-lane segment is selectable
- **WHEN** the user activates a point on a raw per-machine lane
- **THEN** that machine's segment (active or idle) covering that point is selected and an action strip appears for it

#### Scenario: Plain gap selected from empty track
- **WHEN** the user activates the visually empty track between two periods on the merged lane
- **THEN** the plain idle gap under that point is selected and offers **Count as work** on the current ledger

#### Scenario: Action strip shows the state-appropriate verbs for an exact period
- **WHEN** an exact merged period is selected
- **THEN** an inline action strip shows the period's time range, duration, and type, and offers exactly the actions valid for its state in the current ledger — Count for a non-counting period, or Exclude and Move to other side for a counting period, or undo/restore for a manual correction

#### Scenario: Action strip for a raw-lane or freehand selection is overlap-gated
- **WHEN** a raw-lane segment or a manually-entered range is selected
- **THEN** the action strip offers Count, Exclude, and/or Move to other side according to the manual-corrections overlap rule, and never offers Undo or Restore

#### Scenario: Correction uses the selection's own boundaries
- **WHEN** the user counts, excludes, or moves a selection
- **THEN** the correction(s) are created over that selection's own start and end without the user entering any time, and the day re-renders

#### Scenario: Exclude an auto-bridged or measured period
- **WHEN** the user selects a measured or auto-bridged period and chooses Exclude
- **THEN** a `remove_work` correction on the current ledger excludes that period, the underlying idle/activity remains visible, and that ledger's working time decreases accordingly, with no effect on the other ledger

#### Scenario: Move a period to the other ledger
- **WHEN** the user selects a counting period and chooses Move to other side
- **THEN** the period stops counting in the current ledger and starts counting in the other ledger, attributed there to a manual addition

#### Scenario: Undo a manual addition
- **WHEN** the user selects a manually-added period and chooses to undo it
- **THEN** the underlying `add_work` correction is deleted and the day re-renders as if it had never been added

#### Scenario: Restore a removed period
- **WHEN** the user selects a removed period and chooses to restore it
- **THEN** the underlying `remove_work` correction is deleted (or overridden by an `add_work`) and the period counts as working time again in that ledger

#### Scenario: Mark whole day as work
- **WHEN** the user chooses "Mark whole day as work" on a day with presence overlapping the office window, while viewing the work ledger
- **THEN** the gaps of the office day are filled with a work-ledger `add_work` so the working day reads as continuous, without filling pre-work or evening gaps and without removing existing exclusions

#### Scenario: Manual exact-times control offers Move alongside Add and Exclude
- **WHEN** the user opens the Advanced exact-times control and enters a range that overlaps sensor or auto-bridged merged time
- **THEN** Move to other side is available alongside Add work, gated by the same overlap rule as a raw-lane selection

#### Scenario: Corrections visually distinct
- **WHEN** a day contains both sensor spans and corrections
- **THEN** the corrections are rendered so they are distinguishable from sensor-derived spans

#### Scenario: Manually-removed time shown as excluded, not a gap
- **WHEN** a day contains time excluded by a `remove_work` correction
- **THEN** that period is rendered as a distinct "excluded" band, visually separable from empty inactivity
