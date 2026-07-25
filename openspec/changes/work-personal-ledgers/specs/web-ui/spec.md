## MODIFIED Requirements

### Requirement: Week view as default
The default view SHALL present one ISO week (Monday–Sunday) with per-day working time, per-day balance, and the weekly total against the weekly norm, and SHALL allow navigating between weeks. Each day SHALL be rendered as an inline lane on the week page that combines, on one row, the day label, the day's full 0–24h timeline, and the day's numbers (rounded working time, gross minus lunch, and daily balance). A weekly summary SHALL be shown above the lanes reporting worked time, weekly norm, lunch deducted, and weekly balance. The week view SHALL offer a single mode toggle between the **work** ledger and the **personal** ledger; the mode applies to the whole week view (lanes, summary, and edit actions) until changed, and SHALL default to the work ledger. Switching modes SHALL NOT navigate to a different screen or change the selected week.

#### Scenario: Navigate weeks
- **WHEN** the user moves to the previous or next week
- **THEN** that week's per-day and total figures are shown with no carryover between weeks

#### Scenario: Day timeline and numbers shown together
- **WHEN** the week view is rendered
- **THEN** each day shows its timeline and its per-day numbers together in one lane, without navigating to a separate screen

#### Scenario: Weekly summary present
- **WHEN** the work ledger is shown
- **THEN** a summary shows the week's total worked time, weekly norm, lunch deducted, and weekly balance

#### Scenario: Mode toggle switches the whole view
- **WHEN** the user switches the mode toggle from work to personal
- **THEN** every lane, the summary, and the available edit actions update to reflect the personal ledger for the same week

#### Scenario: Work is the default mode
- **WHEN** the week view is opened
- **THEN** it shows the work ledger unless the user has already switched modes in this session

### Requirement: Day timeline with edit mode
Each day's lane SHALL show its timeline of the currently-viewed ledger's activity on the shared 0–24h scale with corrections overlaid and visually distinguished. In the work ledger, the timeline SHALL also show raw idle/off-computer periods as a distinct layer even when they have been auto-bridged into working time, so no counted period hides an underlying gap; time excluded by a `remove_work` correction SHALL be rendered as a distinct "excluded" band rather than hidden as a plain gap. Selecting a day SHALL expand its lane in place to reveal edit controls; there SHALL be no separate day-detail screen.

Within the expanded lane, **every period of the day SHALL be a selectable object** — measured, auto-bridged (work ledger only), manual, reviewable (work ledger only), removed, and plain idle gaps alike — such that activating any point on the lane selects the period covering that point, including selecting a plain gap by activating the visually empty track over it. The lane SHALL provide a mirrored list of the day's periods offering the same selection, so selection is operable by pointer, touch, and keyboard.

Selecting a period SHALL reveal an inline action strip (not a floating overlay) showing that period's time range, duration, and type, together with the actions valid for its state, all scoped to the ledger currently being viewed: a period that does not currently count in the current ledger SHALL offer **Count as work** (creating an `add_work` correction on the current ledger over the period's own start and end), a period that currently counts SHALL offer **Exclude** (creating a `remove_work` correction on the current ledger over its own start and end) and **Move to other side** (creating the paired remove/add correction that transfers the period to the other ledger), and a period produced by a manual correction SHALL offer to **undo/restore** it (deleting the underlying correction). Correction boundaries created this way SHALL be taken from the selected period, not typed by the user.

The expanded lane SHALL also provide a single **Mark whole day as work** action (work ledger only, per the manual-corrections fill requirement), and SHALL retain a manual exact-times control as a secondary/advanced path for correcting a sub-period boundary that no existing period offers, itself scoped to the ledger currently being viewed.

#### Scenario: Edit controls expand in place
- **WHEN** the user selects a day in the week view
- **THEN** that day's lane expands in place to reveal its edit controls, and the user is not navigated to a separate day screen

#### Scenario: Any period is selectable
- **WHEN** the user activates a point on an expanded day's lane
- **THEN** the period covering that point is selected and shown as selected on both the timeline and the mirrored period list

#### Scenario: Plain gap selected from empty track
- **WHEN** the user activates the visually empty track between two periods
- **THEN** the plain idle gap under that point is selected and offers **Count as work** on the current ledger

#### Scenario: Action strip shows the state-appropriate verbs
- **WHEN** a period is selected
- **THEN** an inline action strip shows the period's time range, duration, and type, and offers exactly the actions valid for its state in the current ledger — Count for a non-counting period, or Exclude and Move to other side for a counting period, or undo/restore for a manual correction

#### Scenario: Correction uses the selected period's boundaries
- **WHEN** the user counts, excludes, or moves a selected period
- **THEN** the correction(s) are created over that period's own start and end without the user entering any time, and the day re-renders

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

#### Scenario: Manual exact-times as the exception path
- **WHEN** the user needs a boundary that no existing period offers (e.g. leaving mid-way through a measured span)
- **THEN** a secondary exact-times control lets them enter a start and end for an `add_work` or `remove_work` correction on the current ledger

#### Scenario: Corrections visually distinct
- **WHEN** a day contains both sensor spans and corrections
- **THEN** the corrections are rendered so they are distinguishable from sensor-derived spans

#### Scenario: Manually-removed time shown as excluded, not a gap
- **WHEN** a day contains time excluded by a `remove_work` correction
- **THEN** that period is rendered as a distinct "excluded" band, visually separable from empty inactivity

### Requirement: OS-detected daemon onboarding
For an approved (`active`) user, the web UI SHALL present a daemon onboarding surface
that detects the visitor's operating system and offers the matching download
(Windows or Linux) from the published release. The recommended path SHALL be the
browser-based `login` command, which requires no copying of a key; the surface SHALL
also present the exact `login --key <key>` command with a freshly issued key
pre-filled as a manual fallback, and the `test` command to verify connectivity. The
headless "Get a key" fallback SHALL present a work/personal role choice, pre-selected
to `work` and changeable before the key is issued. It SHALL link to per-OS auto-start
instructions, including the trust step for the unsigned binary. The Machines tab
SHALL be optional for onboarding — used for viewing, renaming, revoking, and
reclassifying machines — rather than the required entry point. The overall flow
presented SHALL be: get approved, download, log in, test, auto-start.

#### Scenario: Download matches the visitor's OS
- **WHEN** an active user opens the machine onboarding surface
- **THEN** the download offered defaults to their detected OS, with the other platforms available

#### Scenario: Login is the recommended path
- **WHEN** an active user views the onboarding surface
- **THEN** the browser `login` command is presented as the recommended, no-copy path, with `login --key` shown as a manual fallback

#### Scenario: Onboarding does not require the Machines tab
- **WHEN** a user onboards a daemon via `login`
- **THEN** they can complete setup without first visiting the Machines tab to add a machine

#### Scenario: Verify guidance references no-data test
- **WHEN** a user follows the onboarding
- **THEN** they are directed to run `test` to confirm connectivity and account binding before any activity data is sent

#### Scenario: Headless key issuance offers a role choice
- **WHEN** a user issues a key through the headless "Get a key" fallback
- **THEN** they can choose work or personal, pre-selected to work, before the key is issued

### Requirement: Daemon login approval surface
For an approved (`active`) user, the web UI SHALL render the approval page reached by
the daemon's browser `login` flow. It SHALL identify the machine being authorized
(its requested label) and present a work/personal role choice, pre-selected to
`work` and changeable before the user approves, alongside the explicit approve
action required to issue a key. When the requested label already resolves to an
existing Machine whose key is active and recently seen, the page SHALL surface the
conflict (including the machine's last-seen time) and require the user to choose
between replacing the existing machine (revoking its key, keeping its existing role)
and creating a separate machine (with its own role choice) — it SHALL NOT silently
revoke a live daemon.

#### Scenario: Approve a new machine
- **WHEN** an active user reaches the login approval page for a label that matches no active machine
- **THEN** they can choose a role (defaulting to work) and approve, and a key is minted for a Machine with that role and handed back to the daemon

#### Scenario: Replacement conflict is surfaced
- **WHEN** the requested label matches an existing Machine with an active, recently-seen key
- **THEN** the page shows the conflict and the last-seen time and requires an explicit replace-or-separate choice before any key change

#### Scenario: Replacing a machine keeps its existing role
- **WHEN** the user chooses to replace an existing Machine
- **THEN** the new key binds to the same Machine and its role is unchanged, without re-prompting for a role

## ADDED Requirements

### Requirement: Personal mode suppresses work-only chrome
While the personal ledger is selected, the week view SHALL NOT show norm, balance, lunch-deduction figures, or the non-working-day visual distinction, since none of those concepts apply outside the work ledger. It SHALL show each day's total personal activity time and its timeline.

#### Scenario: No balance or norm shown in personal mode
- **WHEN** the personal ledger is selected
- **THEN** the weekly summary and each day's lane show total activity time only, with no norm, balance, or lunch figures

#### Scenario: No non-working-day distinction in personal mode
- **WHEN** the personal ledger is selected
- **THEN** every day's lane is styled the same way regardless of whether its weekday is a configured working day

#### Scenario: Switching back to work mode restores the full chrome
- **WHEN** the user switches from personal back to work mode
- **THEN** norm, balance, lunch, and non-working-day styling reappear as before

### Requirement: Machine role shown and editable in the Machines list
The Machines tab's list of machines SHALL show each machine's current role (work or personal) and SHALL offer a control to change it, alongside the existing rename and revoke actions. Changing a machine's role SHALL take effect immediately for any day still within the raw-event edit window, on next view.

#### Scenario: Role visible per machine
- **WHEN** the Machines tab is opened
- **THEN** each machine's row shows its current role

#### Scenario: Role changed from the Machines tab
- **WHEN** the user changes a machine's role from work to personal
- **THEN** the change is saved, and any not-yet-sealed day's week view reflects it on next load
