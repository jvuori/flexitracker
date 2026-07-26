## 1. Locale and year formatting

- [x] 1.1 Change `clock()` in `backend/src/ui/render.ts` from `Intl.DateTimeFormat('en-GB', {...})` to `Intl.DateTimeFormat(undefined, {...})`, keeping `timeZone: TZ` unchanged.
- [x] 1.2 Change `dayFmt()` the same way, and add `year: 'numeric'` to its options.
- [x] 1.3 Confirm the week range label, the per-day lane header, and any other `dayFmt()` call site now show a year and follow the browser locale (spot-check with a non-`en-GB` browser locale, e.g. `en-US` or `fi-FI`, in dev tools).

## 2. Idle-since date

- [x] 2.1 Add a helper that compares the calendar day of a timestamp against today's calendar day, both in the account timezone (`TZ`).
- [x] 2.2 In `renderWeek()`'s status line, use that helper to decide: same calendar day → time only (`clock()`); different calendar day → date + time (`dayFmt()` + `clock()`), e.g. "idle since 25 Jul 2026, 14:06".
- [x] 2.3 Apply the same treatment to the "active since" branch for consistency (an active session that started yesterday should also show its date).

## 3. Week number

- [x] 3.1 Add a small pure ISO-8601 week-number function operating on `wk.weekStart` (already Monday-aligned), handling the year-boundary edge case (a week belongs to the year containing its Thursday).
- [x] 3.2 Update the week label to include the week number alongside the existing date range (e.g. "Week 31 · 27 Jul – 2 Aug 2026").
- [x] 3.3 Unit test the week-number function directly, including at least one case crossing a year boundary (December/January) in both directions.

## 4. Jump-to-current-week control

- [x] 4.1 Add a button in the week-nav row alongside prev/next that sets `weekOffset = 0` and reloads (`TABS.week()`), clearing `openDay`/`selPeriod` like the existing prev/next handlers do.
- [x] 4.2 Disable the button when `weekOffset === 0`, mirroring the `.modetoggle button:disabled` pattern already used for the current ledger mode.

## 5. Ledger-scoped status (backend)

- [x] 5.1 Extract the machine-role lookup already used by `filterByLedgerRole()` in `tenant-do.ts` so it can be reused by `getStatus()` without duplicating the query.
- [x] 5.2 Change `getStatus()` to accept a ledger (or compute both ledgers in one call) and filter the most-recent-event query to machines currently assigned to that ledger's role.
- [x] 5.3 When no machine is currently assigned to a ledger, that ledger's status entry is absent (not a fabricated "idle"/"unknown" value) — this doubles as the toggle-visibility signal in step 6.
- [x] 5.4 Update the `/status` route in `index.ts` to return the new per-ledger shape.

## 6. Ledger-scoped status (frontend)

- [x] 6.1 Update `TABS.week()`/`renderWeek()` to read the status for the currently selected `ledgerMode` from the new `/status` response shape.
- [x] 6.2 Move the status card to render below the Work/Personal mode toggle instead of above it.
- [x] 6.3 Only render the Work/Personal toggle when the `/status` response has an entry for both `work` and `personal`; when only one is present, render the week view as if that were the only ledger (no toggle, `ledgerMode` forced to the available one).

## 7. Tests

- [x] 7.1 Unit tests for the calendar-day-comparison helper (task 2.1) across a timezone boundary case (e.g. idle since 23:50 local time, now 00:10 local time — different calendar day despite <1h elapsed).
- [x] 7.2 Unit tests for the ISO week-number helper (covered in 3.3).
- [x] 7.3 Unit/integration tests for `getStatus()`'s per-ledger filtering, including: a mixed-role multi-machine account where the two ledgers' most-recent activity differ; an account with only the default `work` role assigned (personal entry absent).
- [x] 7.4 Confirm the existing QA multi-machine fixture scenario (`backend/e2e/fixtures.data.mjs`) exercises the mode toggle appearing/status differing across ledgers, extending it if it currently only exercises `getWeek` and not `getStatus`.

## 8. Manual verification

- [x] 8.1 Ran locally (wrangler dev + `e2e/fixtures.mjs`); confirmed via the served page source that the shipped client script matches the edited source exactly (locale-following formatters, the `today` button, `weekNumberOf`/`isoWeekNumber`, `showToggle`) — no browser available in this session to eyeball actual rendered pixels/locale switching, so that visual pass is still outstanding.
- [x] 8.2 Confirmed the `today` button's disabled-at-`weekOffset===0` wiring is present in the shipped script; interactive click-through (navigate away, click Today, confirm it lands on the current week) still needs a real browser.
- [x] 8.3 Loaded the QA fixtures scenario (2 work-role machines + 1 personal-role machine) locally and confirmed via `/api/status` that `work` and `personal` report different `machineId`s and different `since` times — the core ledger-scoping behavior. Visual confirmation that the toggle disappears for a single-role account still needs a real browser.

Note: browser automation tools weren't available in this session (Playwright/Chrome extension declined), so 8.1–8.3 were verified at the API/served-script level rather than visually. Recommend a quick manual pass in an actual browser — including a locale switch and clicking through Today/prev/next — before merging.
