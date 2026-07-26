## Context

The week view (`backend/src/ui/render.ts`) and its backing status endpoint (`getStatus()` in `backend/src/tenant-do.ts`) render all dates through two small client-side formatters, `clock()` and `dayFmt()`, both hardcoded to the `'en-GB'` locale and missing a year. The week label carries no week number, and week navigation is an unbounded `weekOffset` integer with only relative prev/next controls. Separately, `getStatus()` picks the single most-recently-active event across every machine on the account, with no awareness of the `work`/`personal` ledger split that `getWeek()` already respects via `filterByLedgerRole()` (`tenant-do.ts`, using each machine's current `MachineRole`, defaulting to `work`).

This change is UI/formatting plus status-scoping only. It does not touch `computeDay`/`computeWeek` or any worktime math, and requires no schema or migration changes — `getStatus()` reads the same `event` table and the same registry-backed machine roles `getWeek()` already reads.

## Goals / Non-Goals

**Goals:**
- Dates and times render in the visitor's own browser locale, always including a year.
- The idle-since status disambiguates multi-day idle periods with a date.
- The week label carries an ISO-8601 week number.
- One click returns to the current week from anywhere in the week view.
- The current-activity status reflects the ledger currently being viewed, not the whole account, and is positioned so that relationship is visible (below the toggle, not above it).
- The Work/Personal toggle itself only appears for accounts that actually have machines in both roles.

**Non-Goals:**
- No change to worktime computation, corrections, or sealing.
- No change to `MachineRole` storage, assignment, or the Machines tab's role editor.
- No historical/time-versioned role tracking — role remains a single current value per machine, as today.
- No exact-microcopy commitment beyond what's specified below; punctuation/wording is an implementation detail.

## Decisions

**Locale: `Intl.DateTimeFormat(undefined, {...})` instead of `'en-GB'`.**
Both `clock()` and `dayFmt()` run client-side (they're plain functions inside the embedded `<script>`, invoked from DOM-rendering code), so `undefined` as the locale argument resolves to the browser's own locale at the time the page runs — no server-side locale detection or `Accept-Language` parsing needed. The `timeZone: TZ` option (the account's configured timezone) is independent of locale and is unchanged: locale governs field order, separators, and month-name language; timezone governs which wall-clock instant a timestamp maps to. Alternative considered: detect locale server-side from `Accept-Language` and bake it into the rendered HTML — rejected, since the formatters already run client-side and `undefined` gets the same result for free with less code and no caching/staleness concerns (a shared cache header on the HTML would otherwise freeze one visitor's locale for another).

**Year: add `year: 'numeric'` to `dayFmt()`'s options.**
Applies uniformly to the week range label, the per-day header, and the idle-since date (which reuses `dayFmt`). No conditional suppression — always present, consistent with "follow the browser's date format" (which itself decides day/month/year ordering, just not whether year appears at all).

**Idle-since date: shown when `since`'s calendar day (account TZ) differs from today's calendar day (account TZ).**
Comparing calendar days in the account timezone (not raw elapsed milliseconds) avoids an arbitrary hour threshold and matches how the rest of the UI already reasons about "day" (e.g. day lanes, holiday marking). A same-day idle period shows time only (`idle since 14:06`); a different-day one shows the full date+time (`idle since 25 Jul 2026, 14:06`), reusing `dayFmt` + `clock` rather than inventing a third format.

**Week number: ISO-8601, computed from `wk.weekStart`.**
`weekStart` is already Monday-aligned (`computeWeek` in `worktime.ts`, and `DAYNAMES` starting at `Mon`), so the week number is simply the ISO week number of that Monday — no ambiguity about which day starts "the week" (a potential mismatch if a locale's own week-start convention, e.g. Sunday-first in the US, were used instead). The standard ISO year-boundary rule applies (a week belongs to the year containing its Thursday), implemented as a small pure helper alongside the other date helpers, not sourced from `Intl` (no stable cross-browser `Intl` API yet returns an ISO week number directly).

**Jump-to-current-week: a new button, disabled at `weekOffset === 0`.**
Mirrors the existing disabled-when-current pattern already used by the ledger mode toggle (`.modetoggle button:disabled`) and the period-type action buttons — a consistent, established affordance for "this is where you already are" rather than introducing a new visual language.

**Status scoped by ledger: `getStatus(ledger)` reuses `filterByLedgerRole()`.**
Rather than adding a second, parallel notion of "which machines count for status," `getStatus` gains the same machine-role filter `getWeek` already applies, and is called once per ledger (or the response includes both). "Active/idle" becomes "active/idle on a machine currently assigned to this ledger" — consistent with everything else ledger-scoped in this codebase. A ledger with no currently-assigned machine returns no status entry (not a fabricated "idle" state) — see toggle-visibility below, which uses exactly this signal.

**Toggle visibility: shown only when both `work` and `personal` currently have an assigned machine.**
Derived from the same per-ledger status response — no separate `/machines` round-trip needed on the week tab. Consistent with the existing compute model: because `MachineRole` is not time-versioned (`filterByLedgerRole` always uses a machine's *current* role for all of that machine's history), a role change migrates a machine's entire history to the other ledger's view wholesale rather than leaving anything stranded — so gating the toggle on current role assignment cannot hide reachable history behind a missing control. This was confirmed against the real behavior of `filterByLedgerRole` rather than assumed.

## Risks / Trade-offs

- **[Risk]** A brand-new account or a mid-flight role reassignment could flicker the toggle in/out of existence between reloads. → **Mitigation**: this is the same underlying signal the ledger's own numbers already use, so the toggle's presence and the data it would show are always consistent with each other; no separate staleness window is introduced.
- **[Risk]** Moving the status line below the toggle changes an established visual position users may be scanning for. → **Mitigation**: small, one-time layout change; no functional loss, and the new position is more semantically correct (status follows the context selector that determines it).
- **[Risk]** The ISO week-number helper is hand-rolled (no stable cross-browser `Intl` primitive covers it yet). → **Mitigation**: it's a small, pure, easily unit-tested function operating only on `weekStart` (already Monday-aligned), with the year-boundary edge case as the sole subtlety to test directly.

## Migration Plan

Pure code change, no data migration. Deploys through the existing QA-auto-deploy → e2e → PROD-promotion pipeline like any other change. No feature flag: the formatting changes are strictly additive/corrective, and the status-scoping / toggle-visibility change is only observably different for multi-machine, mixed-role accounts (the QA fixtures include a multi-machine scenario to exercise this — see `backend/e2e/fixtures.data.mjs`).

## Open Questions

- Exact punctuation/wording for the week label (e.g. "Week 31 · 27 Jul – 2 Aug 2026" vs. some other separator) and the jump-to-current-week button's label ("Today" vs. "This week") — left to implementation/tasks, not load-bearing.
