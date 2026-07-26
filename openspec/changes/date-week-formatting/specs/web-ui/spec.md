## MODIFIED Requirements

### Requirement: Current status view
The UI SHALL show, for the ledger currently selected in the week view, the current status derived from the latest events of machines currently assigned to that ledger's role, indicating active (with since-time and machine) or idle. If the idle start falls on a different calendar day (in the account timezone) than today, the status SHALL include the date alongside the time, in the same locale-following format used elsewhere. There SHALL be no systray indicator. The status SHALL render below the Work/Personal mode toggle (when the toggle is shown), so its position reflects that it is scoped to the selected ledger.

#### Scenario: Active status shown
- **WHEN** the most recent event on a machine assigned to the selected ledger indicates ongoing activity
- **THEN** the UI shows "active since <time> on <machine>"

#### Scenario: Idle status includes date after more than a day
- **WHEN** the account is idle and the idle start is on a different calendar day (account timezone) than today
- **THEN** the status shows the date alongside the time (e.g. "idle since 25 Jul 2026, 14:06"), not time alone

#### Scenario: Idle status omits date on the same day
- **WHEN** the account is idle and the idle start is on the same calendar day (account timezone) as today
- **THEN** the status shows only the time (e.g. "idle since 14:06")

#### Scenario: Status reflects the selected ledger's machines only
- **WHEN** a machine assigned to the ledger NOT currently selected has more recent activity than any machine assigned to the selected ledger
- **THEN** the status shown reflects only the selected ledger's machines, unaffected by the other ledger's activity

### Requirement: Week view as default
The default view SHALL present one ISO week (Monday–Sunday) with per-day working time, per-day balance, and the weekly total against the weekly norm, and SHALL allow navigating between weeks. Each day SHALL be rendered as an inline lane on the week page that combines, on one row, the day label, the day's full 0–24h timeline, and the day's numbers (rounded working time, gross minus lunch, and daily balance). A weekly summary SHALL be shown above the lanes reporting worked time, weekly norm, lunch deducted, and weekly balance. The week label SHALL show the date range with its year and its ISO-8601 week number. A control SHALL be available to jump directly back to the current week, disabled when the current week is already shown. The week view SHALL offer a single mode toggle between the **work** ledger and the **personal** ledger, shown only when a machine is currently assigned to each of the two roles; the mode applies to the whole week view (lanes, summary, and edit actions) until changed, and SHALL default to the work ledger. Switching modes SHALL NOT navigate to a different screen or change the selected week.

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

#### Scenario: Week label shows year and week number
- **WHEN** the week view is rendered
- **THEN** the week label shows the date range including its year and the range's ISO-8601 week number

#### Scenario: Jump to current week
- **WHEN** the user activates the jump-to-current-week control from any other week
- **THEN** the view navigates directly to the week containing today, without stepping through intermediate weeks

#### Scenario: Jump-to-current-week control disabled when already current
- **WHEN** the week currently shown already contains today
- **THEN** the jump-to-current-week control is disabled

#### Scenario: Mode toggle hidden for single-ledger accounts
- **WHEN** no machine on the account is currently assigned to one of the two roles
- **THEN** the Work/Personal mode toggle is not shown, and the week view behaves as if only the ledger with an assigned machine exists

#### Scenario: Mode toggle shown once both ledgers have a machine
- **WHEN** at least one machine is currently assigned to each of the work and personal roles
- **THEN** the Work/Personal mode toggle is shown
