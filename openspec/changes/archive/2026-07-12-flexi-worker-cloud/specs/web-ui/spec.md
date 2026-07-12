## ADDED Requirements

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
The default view SHALL present one ISO week (Monday–Sunday) with per-day working time, per-day balance, and the weekly total against the weekly norm, and SHALL allow navigating between weeks.

#### Scenario: Navigate weeks
- **WHEN** the user moves to the previous or next week
- **THEN** that week's per-day and total figures are shown with no carryover between weeks

### Requirement: Day timeline with edit mode
Selecting a day SHALL show its timeline of active spans with corrections overlaid and visually distinguished. The timeline SHALL also show raw idle/off-computer periods as a distinct layer even when they have been auto-bridged into working time, so no counted period hides an underlying gap. In edit mode, the user SHALL be able to select a period and mark it as working or private with an optional note.

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

### Requirement: Settings screen
The UI SHALL let the user edit account settings: timezone, working days, daily and weekly norms, lunch deduction and its threshold, and the daemon thresholds.

#### Scenario: Setting saved and applied
- **WHEN** the user changes a setting and saves
- **THEN** the value is persisted and applied to subsequent calculations and daemon config fetches
