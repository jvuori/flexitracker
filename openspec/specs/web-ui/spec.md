# web-ui Specification

## Purpose
TBD - created by archiving change flexi-worker-cloud. Update Purpose after archive.
## Requirements
### Requirement: Node-free HTMX frontend
The web UI SHALL be built without a Node.js toolchain, using server-rendered HTML with HTMX (or equivalent vanilla approach) served from Cloudflare Pages, and SHALL read the authenticated identity from the Cloudflare Access assertion.

#### Scenario: No client build step
- **WHEN** the UI is deployed
- **THEN** it serves static assets and server-rendered fragments without a Node.js build pipeline

### Requirement: Responsive on laptop and mobile
The UI SHALL work fluently on both laptop and mobile screens, with layouts, the day timeline, and edit interactions remaining usable and legible at small widths and via touch.

#### Scenario: Mobile layout usable
- **WHEN** the UI is viewed on a narrow mobile screen
- **THEN** the week view, day timeline, and edit actions remain legible and operable by touch without horizontal page scrolling

### Requirement: Current status view
The UI SHALL show the account's current status derived from the latest events across machines, indicating active (with since-time and machine) or idle. There SHALL be no systray indicator.

#### Scenario: Active status shown
- **WHEN** the most recent event indicates ongoing activity
- **THEN** the UI shows "active since <time> on <machine>"

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
Each day's lane SHALL show its timeline of active spans on the shared 0–24h scale with corrections overlaid and visually distinguished. The timeline SHALL also show raw idle/off-computer periods as a distinct layer even when they have been auto-bridged into working time, so no counted period hides an underlying gap. Time excluded by a `remove_work` correction SHALL be rendered as a distinct "excluded" band rather than hidden as a plain gap, so the user can tell excluded time from mere inactivity. Selecting a day SHALL expand its lane in place to reveal edit controls; there SHALL be no separate day-detail screen.

Within the expanded lane, **every period of the day SHALL be a selectable object** — measured, auto-bridged, manual, reviewable, removed, and plain idle gaps alike — such that activating any point on the lane selects the period covering that point, including selecting a plain gap by activating the visually empty track over it. The lane SHALL provide a mirrored list of the day's periods offering the same selection, so selection is operable by pointer, touch, and keyboard.

Selecting a period SHALL reveal an inline action strip (not a floating overlay) showing that period's time range, duration, and type, together with the single action valid for its state: a period that does not currently count SHALL offer **Count as work** (creating an `add_work` correction over the period's own start and end), a period that currently counts SHALL offer **Exclude as private** (creating a `remove_work` correction over its own start and end), and a period produced by a manual correction SHALL offer to **undo/restore** it (deleting the underlying correction). Correction boundaries created this way SHALL be taken from the selected period, not typed by the user.

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

#### Scenario: Action strip shows the state-appropriate verb
- **WHEN** a period is selected
- **THEN** an inline action strip shows the period's time range, duration, and type, and offers exactly the action valid for its state — Count for a non-counting period, Exclude for a counting period, or undo/restore for a manual correction

#### Scenario: Correction uses the selected period's boundaries
- **WHEN** the user counts or excludes a selected period
- **THEN** the correction is created over that period's own start and end without the user entering any time, and the day re-renders

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

### Requirement: Settings screen
The UI SHALL let the user edit account settings: timezone, working days, daily and weekly norms, lunch deduction and its threshold, and the daemon thresholds.

#### Scenario: Setting saved and applied
- **WHEN** the user changes a setting and saves
- **THEN** the value is persisted and applied to subsequent calculations and daemon config fetches

### Requirement: Timeline scale and ruler
Every day timeline SHALL span a fixed full-day 0–24h scale in the account timezone and SHALL render a time ruler with tick marks at three levels — hour (most prominent), half-hour, and quarter-hour — together with hour numbers labelling 0 through 24. The fixed scale ensures activity outside normal working hours (early morning, late evening, weekend) is always visible rather than clipped.

#### Scenario: Ruler shown on every lane
- **WHEN** a day timeline is rendered
- **THEN** it shows hour, half-hour, and quarter-hour tick marks distinguished by prominence, and hour numbers from 0 to 24

#### Scenario: Out-of-hours activity remains visible
- **WHEN** a day contains activity before the configured workday start or after its end (e.g. a span starting shortly after midnight)
- **THEN** that activity is still drawn on the 0–24h lane and is not clipped out of view

