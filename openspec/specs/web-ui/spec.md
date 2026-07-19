# web-ui Specification

## Purpose
TBD - created by archiving change flexitracker. Update Purpose after archive.
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

### Requirement: Timeline scale and ruler
Every day timeline SHALL span a fixed full-day 0–24h scale in the account timezone and SHALL render a time ruler with tick marks at three levels — hour (most prominent), half-hour, and quarter-hour — together with hour numbers labelling 0 through 24. The fixed scale ensures activity outside normal working hours (early morning, late evening, weekend) is always visible rather than clipped.

#### Scenario: Ruler shown on every lane
- **WHEN** a day timeline is rendered
- **THEN** it shows hour, half-hour, and quarter-hour tick marks distinguished by prominence, and hour numbers from 0 to 24

#### Scenario: Out-of-hours activity remains visible
- **WHEN** a day contains activity before the configured workday start or after its end (e.g. a span starting shortly after midnight)
- **THEN** that activity is still drawn on the 0–24h lane and is not clipped out of view

### Requirement: OS-detected daemon onboarding
For an approved (`active`) user, the web UI SHALL present a daemon onboarding surface that detects the visitor's operating system and offers the matching download (Windows or Linux) from the published release, alongside the exact `configure` command with the freshly issued access key pre-filled and the `test` command to verify connectivity. It SHALL link to per-OS auto-start instructions, including the trust step for the unsigned binary. The overall flow presented SHALL be: get approved, download, configure, test, auto-start.

#### Scenario: Download matches the visitor's OS
- **WHEN** an active user opens the machine onboarding surface
- **THEN** the download offered defaults to their detected OS, with the other platforms available

#### Scenario: Exact commands with the key
- **WHEN** a user adds a machine
- **THEN** the UI shows the ready-to-run `configure --key <key>` command and the `test` command, with the key copyable

#### Scenario: Verify guidance references no-data test
- **WHEN** a user follows the onboarding
- **THEN** they are directed to run `test` to confirm connectivity and account binding before any activity data is sent

### Requirement: Registration and pending-state experience
The web UI SHALL render according to the signed-in account's approval status rather than assuming full capability. A `pending` account that has not yet requested access SHALL be shown a *Request access* form (with an optional note); after submitting, and while awaiting a decision, it SHALL be shown a "waiting for approval" state. A `rejected` or `disabled` account SHALL be shown the corresponding state message. Only an `active` account SHALL render the full application (week view, machines, settings, admin).

#### Scenario: New user sees the request form
- **WHEN** a `pending` user who has not requested access opens the app
- **THEN** they see a *Request access* form instead of the app, and submitting it shows an on-screen confirmation

#### Scenario: Awaiting approval
- **WHEN** a `pending` user who has already requested access opens the app
- **THEN** they see a "waiting for approval" message and no user data

#### Scenario: Rejected or disabled state
- **WHEN** a `rejected` or `disabled` user opens the app
- **THEN** they see the corresponding state message and no user data or machine controls

#### Scenario: Active user sees the app
- **WHEN** an `active` user opens the app
- **THEN** the full application is rendered as before

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

