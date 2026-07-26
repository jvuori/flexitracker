## Why

The week view's date, time, and status formatting has accumulated several usability gaps that make it harder to read at a glance: idle durations spanning more than a day are ambiguous about which day they started, week and day headers omit the year, all dates are hardcoded to `en-GB` formatting regardless of the visitor's own locale, the week label carries no week number, there is no way to jump back to the current week once navigated away, and the current-activity status line reports account-wide machine activity even when the visitor is looking at a specific ledger (work or personal) — so it can show the wrong machine's activity for the ledger currently on screen.

## What Changes

- `clock()` and `dayFmt()` (the two client-side date/time formatters) switch from a hardcoded `'en-GB'` locale to the visitor's browser locale, while keeping the account timezone unchanged.
- `dayFmt()` gains a year, so the week range label and every per-day header always show one.
- The "idle since <time>" status line shows the date (in the same browser-locale, full format) whenever the idle start falls on a different calendar day than today, not just the time.
- The week label shows its ISO-8601 week number alongside the date range (e.g. "Week 31 · 27 Jul – 2 Aug 2026").
- A new button jumps the week view back to the current week in one step, disabled when already there.
- The current-activity status becomes ledger-scoped: it reflects only machines currently assigned to the ledger being viewed, and renders below the Work/Personal toggle instead of above it.
- The Work/Personal toggle itself only renders when a machine is currently assigned to each of the two roles; single-machine/default-role accounts (today's common case) never see it, matching today's de facto behavior.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-ui`: "Current status view" changes from account-wide to ledger-scoped, and its position moves below the mode toggle; "Week view as default" gains a week number in the week label, a jump-to-current-week control, and a rule for when the Work/Personal toggle itself is shown.

## Impact

- `backend/src/ui/render.ts`: `clock()`, `dayFmt()`, `renderWeek()` (status placement, week label, new button), week nav wiring.
- `backend/src/tenant-do.ts`: `getStatus()` reworked to compute per-ledger using the same machine-role filtering `filterByLedgerRole()` already applies for `getWeek()`.
- `backend/src/index.ts`: `/status` route response shape (per-ledger status + role presence).
- No change to `computeDay`/`computeWeek` worktime math, no schema/migration changes, no daemon changes.
