## 1. Backend: additive `date` param on `GET /api/week`

- [x] 1.1 In `backend/src/tenant-do.ts`, confirm/expose a way to resolve an absolute calendar date (in the account's timezone) to that week's `weekStart` ms, reusing `localWeekStart`/`localDayStart` — `getWeek(weekStart, ledger, checkTime)` already accepts the resulting absolute timestamp directly, so this may need no new DO method, only the call-site change in 1.2.
- [x] 1.2 In `backend/src/index.ts`, extend `api.get("/week", ...)` (~line 198) to read an optional `date` query param; when present, resolve it to the week's start (in the account's timezone) and call `tenant(...).getWeek(weekStart, ledger)` directly instead of `weekView(offset, ledger)`. When absent, behavior is unchanged (existing `offset` path). If both `date` and `offset` are present, `date` wins.
- [x] 1.3 Leave `offset` handling, `test.get("/week", ...)` (~line 443), and `weekView()` in `tenant-do.ts` completely untouched.
- [x] 1.4 Run `backend/e2e/smoke.mjs` and `backend/e2e/fixtures.mjs` locally (or via QA deploy) to confirm existing `offset=`-based calls are unaffected.

## 2. Client: calendar-date helpers

- [x] 2.1 In `backend/src/ui/client-helpers.ts`, add a pure `addDaysYMD(ymd, n)`-style helper (or equivalent) to `DATE_HELPERS_SRC` that shifts a `YYYY-MM-DD` string by `n` calendar days, following the file's existing "self-contained, no DOM/global refs" convention alongside `localYMD`/`isoWeekNumber`.
- [x] 2.2 Add a small parser/validator for a `YYYY-MM-DD` string (reject anything that doesn't round-trip to a real calendar date) for use when reading `week=`/`day=` from the URL.

## 3. Client: URL as the source of truth for view state

- [x] 3.1 In `backend/src/ui/render.ts`'s `CLIENT` template, replace the bare `weekOffset`/`ledgerMode`/`openDay` globals (~lines 432-455) with a single state object derived from `location.search` on load, plus a function that serializes that state back into a query string (omitting each param at its default, per design D2).
- [x] 3.2 Implement URL → state parsing for `tab`, `week` (date, not offset), `ledger`, `day`, and (admin) `account`, each validated independently; an invalid/unresolvable value for one field must not affect the others (design D5 / spec "Invalid URL parameters degrade independently per field").
- [x] 3.3 Wire `TABS.week()` (~line 436) to fetch via `/api/week?date=...&ledger=...` (using the new `date` param from task 1) instead of `?offset=...`, and to validate the URL's `day=` against the loaded week's actual days before restoring `openDay` (a day not present in the loaded week resolves to "not expanded").
- [x] 3.4 Reuse the existing "forced ledger" fallback in `TABS.week()` (the logic around line 444 that already switches to whichever ledger has a machine) as the fallback path when the URL's `ledger=` doesn't have an assigned machine.
- [x] 3.5 On init (~line 1218 `init()`), parse the URL once before the first render and apply the resulting state instead of always starting from the hardcoded defaults.

## 4. Client: writing the URL (push vs. replace per design D4)

- [x] 4.1 Tab switch handler (~line 428-430): `history.pushState` with the new tab reflected in the URL.
- [x] 4.2 Week prev/next/today handlers (~lines 520-522): compute the new anchor date via `addDaysYMD(currentWeekDate, ±7)` (or reset to today for "Today"), then `history.pushState` with the updated `week=`.
- [x] 4.3 Ledger toggle handler (~line 487-490): `history.replaceState` with the updated `ledger=`, no new history entry.
- [x] 4.4 Day expand/collapse handlers (~lines 703-710): `history.replaceState` with `day=` added/removed, no new history entry.
- [x] 4.5 Admin drilldown open (`renderAdminKeys`, ~line 1171) and close (`back` button, ~line 1182): `history.pushState`/appropriate back-navigation so opening a Keys view is a Back-stop and closing it (via the in-app back button) lands on the account-list history entry rather than pushing a duplicate forward entry.
- [x] 4.6 Add a single `popstate` listener that re-derives and re-renders state from `location.search` on every Back/Forward, reusing the same parse/validate/render path as initial load (task 3) so there is exactly one code path for "render from URL," not two.

## 5. Tests

- [x] 5.1 Unit test the new `addDaysYMD` / date-string validator helpers (mirroring how `client-helpers.ts`'s existing helpers are unit-tested).
- [x] 5.2 Unit/integration test `GET /api/week?date=...` in the backend test suite: resolves the correct week regardless of current date, matches the equivalent `offset`-based result for the current week, and leaves `offset`-only calls unaffected. (Covered in `backend/e2e/smoke.mjs`, run locally — see 1.4.)
- [ ] 5.3 Confirm `backend/e2e/smoke.mjs` and `backend/e2e/fixtures.mjs` still pass unmodified against a QA deploy of this change. (Verified locally against `wrangler dev`; not yet run against a live QA deploy — happens automatically once this is pushed and `deploy-qa.yml` runs.)

## 6. Manual verification

- [x] 6.1 Reload while on a non-current week, with the personal ledger, with a day expanded → confirm all three restore.
- [x] 6.2 Back/Forward through: week navigation, tab switches, admin drilldown open/close → confirm each is a distinct Back-stop and ledger/day-expand are not.
- [x] 6.3 Open a URL with a stale `day=` (not in the linked week), a `ledger=` with no machine, and (admin) a nonexistent `account=` → confirm each falls back to its default independently without breaking the other valid params in the same URL.
- [x] 6.4 Confirm a bare `/` with no query string still renders identically to today's default (no regression for existing bookmarks).
