## Why

The web UI is a single Worker route (`GET /`) that always renders an identical HTML shell; every view state — which tab is showing, the displayed week, the ledger mode, which day lane is expanded, and the admin account-Keys drilldown — lives only in module-level client JS variables, and the client never touches `history`/`location`. As a result, reloading the page always returns to the default landing state, the browser's Back/Forward buttons do nothing, and no view (a specific week, an expanded day, an admin drilldown) can be bookmarked or shared as a link.

## What Changes

- The URL (as a query string on `/`) becomes the source of truth for: active tab, the displayed week (as an absolute calendar date, not the existing relative offset), ledger mode, the expanded day lane, and the admin account-Keys drilldown.
- Reloading or opening a bookmarked/shared URL restores that state instead of always landing on the default.
- Browser Back/Forward navigate a coarse-grained history: tab switches, week navigation, and admin drilldown in/out each create a Back-stop; ledger toggling and day expand/collapse update the current URL via `history.replaceState` without creating a new one.
- A URL param that doesn't resolve to a real view (a `day` not in the loaded week, a `ledger` with no assigned machine, a stale `account` id, an unparseable `week`/unrecognized `tab`) falls back to the same default as if that param were simply absent — independently per field, never cascading to sibling params.
- `GET /api/week` gains an optional `date` query param (an absolute calendar date) as an alternative to the existing `offset` param, so the client can request "the week containing this date" without first resolving the account's timezone itself. The existing `offset` param is unchanged and continues to back the e2e suite's relative week addressing.
- Selection state that is not being deep-linked, by design: which period within an expanded day is highlighted (`selPeriod`) stays session-only — its identity isn't stable enough to be a good URL citizen, and restoring it on reload isn't the goal.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `web-ui`: the Week view, day-timeline expansion, and the (undocumented today) admin console navigation gain URL-addressability — reload/back/forward/bookmark must reflect and restore tab, week, ledger mode, expanded day, and admin drilldown state, with graceful per-field fallback for stale or invalid URL parameters.

## Impact

- `backend/src/ui/render.ts` — the inline client (`CLIENT` string): replaces the plain `weekOffset`/`ledgerMode`/`openDay` module globals plus ad-hoc tab switching and admin drilldown with URL-driven state (read on load, written via `pushState`/`replaceState` on navigation).
- `backend/src/ui/client-helpers.ts` — gains a small pure calendar-date helper (Y-M-D ± N days) alongside the existing `localYMD`/`isoWeekNumber` helpers, used for week prev/next/today math now that navigation is date-based rather than offset-based.
- `backend/src/index.ts` — `api.get("/week", ...)` gains the optional `date` param (additive; `offset` unchanged).
- `backend/src/tenant-do.ts` — no change needed: `getWeek(weekStart_ms, ledger)` is already absolute-date-native; the new `date` param routes to it directly instead of through `weekView(offset, ...)`.
- No change to `backend/e2e/smoke.mjs` or `backend/e2e/fixtures.mjs` — both keep using `offset=`, which is untouched.
- No database schema change, no new Cloudflare infrastructure.
