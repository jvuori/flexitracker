## ADDED Requirements

### Requirement: URL reflects navigable view state
The current tab (Week, Settings, Machines, Admin), the displayed week, the ledger mode, the expanded day (if any), and — within the Admin tab — the selected account's Keys drilldown (if open) SHALL be reflected in the page URL as query parameters on `/`, so the URL alone identifies the view being shown. Each parameter SHALL be omitted from the URL when it equals that view's default (this week, work ledger, Week tab, no day expanded, no drilldown open), so a URL with no query string SHALL identify exactly the same view it does today. The selected/highlighted period within an expanded day SHALL NOT be reflected in the URL.

#### Scenario: Default URL unchanged
- **WHEN** the app is opened at `/` with no query string
- **THEN** it shows the Week tab, the current week, the work ledger, and no day expanded — identical to today's behavior

#### Scenario: Non-default state appears in the URL
- **WHEN** the user switches to the personal ledger on a week other than the current one, with a day expanded
- **THEN** the URL's query string identifies that tab, week, ledger, and expanded day

#### Scenario: Selected period is not URL state
- **WHEN** the user selects a period within an expanded day
- **THEN** the URL does not change to reflect that selection

### Requirement: Reload restores the view from the URL
Loading or reloading the page SHALL render the view identified by the current URL's query parameters (tab, week, ledger, expanded day, admin drilldown) rather than always resetting to the default view.

#### Scenario: Reload preserves the displayed week
- **WHEN** the user navigates to a week other than the current one and reloads the page
- **THEN** the same week is shown after reload, not the current week

#### Scenario: Reload preserves an expanded day
- **WHEN** the user expands a day's lane and reloads the page
- **THEN** that day's lane is expanded again after reload

#### Scenario: Reload preserves the admin drilldown
- **WHEN** an admin has opened an account's Keys view and reloads the page
- **THEN** that account's Keys view is shown again after reload, not the account list

### Requirement: Deep-linked and bookmarkable views
A URL captured while viewing a specific week, ledger mode, or expanded day SHALL, when opened later (including in a new browser, by a different authorized user on the same account, or after the account's data has changed), render that same week/ledger/day identity rather than a view relative to whenever the URL is opened.

#### Scenario: A week bookmark does not drift
- **WHEN** a URL naming a specific week is bookmarked and opened again on a later date
- **THEN** it shows the same calendar week it named, not a week computed relative to the new current date

#### Scenario: A shared link opens to the same view
- **WHEN** a URL identifying a week and an expanded day is opened by another authorized user of the same account
- **THEN** they see that week with that day expanded

### Requirement: Coarse-grained Back/Forward navigation
The browser's Back and Forward buttons SHALL step through tab switches, week navigation (previous/next/today), and admin drilldown open/close as distinct history entries. Ledger-mode toggling and day expand/collapse SHALL update the current URL without creating a new history entry, so they are reflected in the URL (and thus restored on reload) without being individually reachable via Back/Forward.

#### Scenario: Back returns to the previous week
- **WHEN** the user is on week 30, navigates to week 31, then presses Back
- **THEN** the view returns to week 30

#### Scenario: Back returns to the previous tab
- **WHEN** the user is on the Week tab, switches to the Machines tab, then presses Back
- **THEN** the view returns to the Week tab

#### Scenario: Back exits an admin drilldown
- **WHEN** an admin opens an account's Keys view from the account list, then presses Back
- **THEN** the view returns to the account list

#### Scenario: Ledger toggle does not consume a Back-stop
- **WHEN** the user is on a given week, toggles from the work ledger to the personal ledger, then presses Back
- **THEN** the view does not return to the work ledger on that same week; Back instead performs whatever the next coarse-grained navigation step would be (e.g. returning to the previous week or tab)

#### Scenario: Day expand does not consume a Back-stop
- **WHEN** the user expands a day's lane, then presses Back
- **THEN** the view does not merely collapse that day; Back instead performs the next coarse-grained navigation step

### Requirement: Invalid URL parameters degrade independently per field
When a URL parameter does not resolve to a real view given the currently available data (an expanded-day date not present in the identified week, a ledger with no assigned machine, an admin account id that no longer exists, an unparseable week date, or an unrecognized tab), the affected parameter alone SHALL be treated as absent and fall back to its default; other, still-valid parameters in the same URL SHALL continue to apply unaffected.

#### Scenario: Stale day falls back without affecting the week
- **WHEN** the URL identifies a valid week together with a day date that is not one of that week's days
- **THEN** the identified week is shown with no day expanded, rather than an error or a reset to the default week

#### Scenario: Unresolvable admin account falls back to the account list
- **WHEN** the URL identifies the Admin tab with an account id that does not resolve to an existing account
- **THEN** the plain admin account list is shown, not an error page

#### Scenario: Unparseable week falls back to the current week
- **WHEN** the URL's week parameter cannot be parsed as a date
- **THEN** the current week is shown

#### Scenario: Unrecognized tab falls back to Week
- **WHEN** the URL's tab parameter is not one of the known tabs
- **THEN** the Week tab is shown

### Requirement: Week identified by absolute date, not relative offset
`GET /api/week` SHALL accept an optional absolute calendar date (`date`) identifying any day within the target week, resolved in the account's timezone, as an alternative to the existing relative `offset` parameter. The existing `offset` parameter's behavior SHALL be unchanged.

#### Scenario: Absolute date resolves to its containing week
- **WHEN** `GET /api/week` is called with `date` set to a date within a given week
- **THEN** that week's data is returned, identified by its Monday start, regardless of the current date

#### Scenario: Existing offset-based callers are unaffected
- **WHEN** `GET /api/week` is called with `offset` and no `date`
- **THEN** it returns the same week it did before this change, computed relative to the current date as today
