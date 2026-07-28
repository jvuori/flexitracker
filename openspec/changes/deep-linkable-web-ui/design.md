## Context

The web UI (`backend/src/ui/render.ts`) is one Worker route (`GET /`) that always renders an identical HTML shell (`renderApp`) regardless of any query string — identity, admin flag, and account status are the only per-request inputs. Everything else the user sees is decided by a plain vanilla-JS client embedded in that shell (the `CLIENT` template string), which holds view state in module-level variables: `weekOffset` (int, relative to "now"), `ledgerMode` (`'work'|'personal'`), `openDay` (a day's `dayStart` timestamp or `null`), `selPeriod` (`{dayStart, idx}` or `null`), plus an implicit "which tab" and, inside the admin tab, "which account's Keys view" state held only by which function last ran. There is no use of `history`, `pushState`, or `location` anywhere in the client (confirmed by grep — zero matches), so every reload discards all of this and every Back/Forward press is a no-op.

`weekOffset` is relative to `Date.now()`, which is exactly why it cannot simply be copied into a URL: a bookmark encoding "next week" (offset `+1`) would show a different week every time it's opened. The fix requires an absolute anchor. Conveniently, the Durable Object already has one: `weekView(offset, ledger, now)` in `tenant-do.ts` is a thin wrapper — `getWeek(localWeekStart(now, tz) + offset*7days, ledger)` — around `getWeek(weekStart: number, ledger, checkTime)`, which is already absolute-date-native. Only the public `GET /api/week` route is offset-only.

`offset` is load-bearing elsewhere and must not change: `backend/e2e/smoke.mjs` and `backend/e2e/fixtures.mjs` both call `/api/week?offset=...` / `/test/week?offset=...` directly, using relative "this week / last week" addressing specifically so QA fixtures never encode a real calendar date (see the QA fixtures section of `CLAUDE.md`). These tests gate the QA→PROD auto-promotion pipeline.

## Goals / Non-Goals

**Goals:**
- Reloading the page restores the view the user was on: tab, week, ledger mode, expanded day, admin drilldown.
- The browser's Back/Forward buttons work, at the granularity of "places" (weeks, tabs, admin drilldown) rather than every micro-interaction.
- A specific week (and optionally ledger mode / expanded day) can be bookmarked or shared as a URL.
- A bare `/` (no query string) continues to behave exactly as it does today — no regression for existing bookmarks/homescreen shortcuts.
- Stale or malformed URL parameters degrade gracefully, per field, never as a hard error or a full reset.

**Non-Goals:**
- Deep-linking the selected/highlighted period within an expanded day (`selPeriod`). It's transient interaction state, and its `idx`-into-a-recomputed-array identity isn't stable enough to be a good URL citizen even if we wanted to.
- Deep-linking which time range is hovered, or any other purely transient UI affordance.
- Path-based routing (`/week/2026-W30`, `/admin/accounts/:id/keys`). See Decisions.
- Any change to `offset`-based access to `GET /api/week` or `GET /test/week` — both are untouched.
- Settings-screen section anchors (`#office-hours`) — not requested, out of scope for this change.

## Decisions

### D1 — Query string on `/`, not path-based routes

The URL scheme is a query string on the single existing route (`/?tab=…&week=…&ledger=…&day=…&account=…`), not new server routes like `/week/2026-W30`.

**Why:** `app.get("/")` already ignores its query string entirely, so every `pushState`/`replaceState` call from client-side navigation never touches the network — only an actual reload or opening a bookmark re-invokes the Worker, and it renders the exact same shell it does today, unconditionally. This requires **zero backend routing changes** for the shell itself. It also mirrors the convention already established by `GET /api/week?offset=&ledger=`. The alternative (real paths) would need a catch-all SPA-fallback route, carefully ordered ahead of/behind `/device/*`, `/test/*`, `/ingest`, etc. — exactly the shape of routing subtlety this project has been burned by before (see `CLAUDE.md`'s "Known pitfalls": Cloudflare Access bypass apps are keyed on literal paths, and a forgotten or misordered route has previously caused a JSON endpoint to silently receive the Access login page). Query-string-only sidesteps that class of bug entirely.

**Alternatives considered:** Path-based routing (rejected: routing/Access-bypass risk, no functional benefit for a query-string-shaped state model). Hash-based routing (`#/week?...`) (rejected: no advantage over a real query string here, since the shell route doesn't care about the query string anyway; a real query string is also what a shared link "looks like" it should be).

### D2 — Every param is omitted at its default value

`/` with no query string must mean exactly what it means today: this week, work ledger, Week tab, nothing expanded. Each URL param is written only when it differs from that default, and left off otherwise.

**Why:** avoids any behavior change for users who already have `/` bookmarked or pinned, and keeps URLs for the common case (today's week, work ledger) clean.

### D3 — Absolute calendar date, not ISO week string, for `week=` / `day=`

`week=2026-07-20` (a plain `YYYY-MM-DD`, always written as that week's Monday), not `week=2026-W30`.

**Why:** the backend's `getWeek(weekStart_ms, ledger)` already resolves *any* absolute date to its containing week via `localWeekStart` — a plain calendar date needs no new parsing on either side. An ISO week string would need a W01/W53 year-boundary-aware parser (the inverse of the `isoWeekNumber` display helper already in `client-helpers.ts`) purely for URL decoding, which is unnecessary complexity for an internal identifier that most users will never type by hand — the "Week 30" framing stays purely a display concern (`weekNumberOf()`), untouched. The resolver reads any date within the target week defensively (not just Mondays), so a hand-edited or slightly-off URL still resolves sensibly.

`day=2026-07-22` uses the same format for consistency, and is resolved against the loaded week's `wk.days[].dayStart` by matching the account-timezone calendar date.

### D4 — Coarse history: push on navigation, replace on refinement

```
pushState (new Back-stop)             replaceState (updates current entry only)
  tab switch                            ledger toggle
  week prev / next / today              day expand / collapse
  admin drilldown open/close (account list <-> account Keys view)
```

**Why:** Back should walk through "places" a user would recognize as distinct steps — weeks, tabs, the admin drilldown — without turning every toggle into a Back-stop. If ledger-toggle and day-expand each pushed history, a phone's back-gesture would need many taps to leave a page barely touched, which is worse than today's "Back does nothing." Ledger mode and the expanded day still fully persist in the *current* URL entry (via `replaceState`), so reload and bookmarking still capture them — they just don't cost a Back-stop of their own.

**Alternatives considered:** Push on every state change (rejected: history-spam, especially on mobile). Never push, only replace (rejected: browser Back/Forward would never do anything, failing the core ask).

### D5 — Per-field graceful defaulting, never a cascading reset

Each URL param is validated independently against the state actually available once data loads, and an invalid/stale value is treated as if that param were absent — it does not invalidate sibling params.

| Param | Invalid when | Falls back to |
|---|---|---|
| `tab` | not one of `week`/`settings`/`machines`/`admin` | `week` |
| `week` | unparseable as a date | today's week (existing default) |
| `ledger` | not `work`/`personal`, or the requested ledger currently has no assigned machine | whichever ledger the existing "forced ledger" logic in `TABS.week()` already selects (unchanged) |
| `day` | date not present among the loaded week's days | no day expanded |
| `account` (admin only) | id doesn't resolve to an existing account | plain admin account list, no drilldown |

**Why:** a URL is frequently hand-edited, stale (the linked day rolled out of retention, the linked account was disabled), or partially valid (a good week + a day that belonged to a different week). Treating the whole query string as atomic — valid or reset-to-full-default — would make an otherwise-good bookmark unusable because of one stale field. Field-by-field fallback keeps as much of the requester's intent as still makes sense.

### D6 — `GET /api/week` gains an additive `date` param; `offset` is untouched

A new optional `date` query param (absolute calendar date) is added to `api.get("/week", ...)` in `index.ts`. When present, it resolves the target week directly via `getWeek(...)` (bypassing `weekView`'s offset arithmetic) using the account's timezone; when absent, behavior is unchanged (`offset`, defaulting to `0`). If both are somehow present, `date` wins.

**Why additive, not a replacement:** `offset` is exercised directly by `backend/e2e/smoke.mjs` and `backend/e2e/fixtures.mjs`, which gate the QA→PROD auto-promotion pipeline and depend on relative addressing (no fixed dates, per the QA fixtures design in `CLAUDE.md`). Changing or removing `offset` risks that pipeline for no benefit — the client is the only consumer that needs `date`.

### D7 — Client-side week navigation becomes calendar-date arithmetic

Prev/next/today buttons currently do `weekOffset +/- 1` (or reset to `0`) and refetch. Under this change they instead shift a `YYYY-MM-DD` value by ±7 calendar days (a new small helper alongside `localYMD`/`isoWeekNumber` in `client-helpers.ts`) and refetch via `?date=`. "Today" button disablement becomes `Date.now()` falling within `[wk.weekStart, wk.weekStart + 7*86400000)` — the week payload the server already returns — mirroring the exact pattern the day lanes already use for their own `isToday` check (`now>=d.dayStart && now<d.dayStart+DAY`).

**Why:** pure `YYYY-MM-DD` arithmetic needs no timezone conversion client-side (no need to know the account's IANA zone before computing "next week"), and reuses an idiom (`wk.weekStart`-relative comparison) already proven in this codebase rather than introducing a new one.

## Risks / Trade-offs

- **[Risk]** A hand-constructed or very old bookmarked URL references a day whose raw events have since aged out of retention, or a week far outside any data → the week view would render mostly-empty rather than erroring. **Mitigation:** this is existing behavior for `offset`-based navigation to a distant week already (nothing new is introduced); D5's per-field fallback still applies (e.g., an unresolvable `day` just doesn't expand).
- **[Risk]** Coarse history (D4) means a user who toggles ledger mode or expands three different days in a row, then hits Back, jumps straight past all of that to the previous *week* — which might read as Back "skipping" state. **Mitigation:** this is the deliberate trade-off discussed and accepted over history-spam; the skipped state is still visible in the URL/page the user lands back on if they re-expand, and nothing is lost, only not individually re-traversable.
- **[Risk]** Two query params encoding overlapping concerns (`week` + `day`, where `day` must belong to `week`) could drift if constructed by hand. **Mitigation:** D5 resolves `day` against the *loaded* week's actual days, not by trusting the URL pair to be internally consistent — an inconsistent pair degrades to "day not expanded," never a crash or a mismatched render.
- **[Trade-off]** Query-string-only (D1) means URLs are less "pretty" than path segments (`/?week=2026-07-20` vs `/week/2026-W30`). Accepted in exchange for zero routing/Access-bypass risk.

## Migration Plan

- Purely additive on the backend (`date` param) and client-only on the frontend (URL read/write logic) — no data migration, no schema change, no new Cloudflare resource.
- Deploys through the existing pipeline: QA auto-deploy → e2e suite (unchanged, still `offset`-based) → auto-promote to PROD on green.
- No rollback complexity beyond the normal `deploy-prod.yml` re-deploy-an-older-ref path, since nothing is destructive or stateful.

## Open Questions

None outstanding — the scope, URL scheme, history granularity, and fallback behavior were settled in discussion before this design was written.
