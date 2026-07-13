## Why

Vacation and public-holiday days are full days off, but the tracker still applies the daily norm to them, so each one silently drags the balance down by a full day (e.g. −7h 30m). The user has to mentally add back those hours to read a vacation week's real flextime. A day should be markable as a holiday so it neither owes the norm nor distorts the week.

## What Changes

- Add a **holiday** marker for a full day. A holiday day's daily norm SHALL be zero, so it can only credit (never debit) the balance — the same disposition as a non-working weekday, but applied to a specific date.
- **Reduce the weekly norm** by one daily-norm for each holiday that falls on an otherwise-working weekday, so a vacation week does not show a weekly deficit while every day reads zero. (The weekly norm is a flat independent number; without this the weekly line contradicts the daily lines.)
- A holiday does **not** exclude real activity: if the user actually works on a holiday, that time still counts as a **credit** (worked − zero norm), and it still adds to the weekly balance.
- Add a day-level **Mark as holiday / clear holiday** action in the expanded day lane, and show a holiday day as visibly a holiday.
- Persist holidays as a new full-day correction kind so they reuse correction plumbing (create/delete/undo, audit, dirty-day recompute) and never mutate raw events.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `worktime-calculation`: a holiday day has a zero daily norm and reduces the weekly norm by one daily-norm; worked time on a holiday still credits.
- `manual-corrections`: introduce a full-day `holiday` correction kind (create/delete/undo), distinct from add/remove.
- `web-ui`: a day-level mark/clear-holiday action and a holiday indicator on the lane.

## Impact

- **Correction kind** (`backend/src/worktime/worktime.ts` `CorrectionKind`; `backend/src/schema.ts` if kinds are shared; `backend/src/tenant-do.ts` `addCorrection` validation): add `holiday`.
- **Calc** (`worktime.ts` `computeDay` / `computeWeek`): `isHoliday` on `DayResult`; `normMs = 0` when holiday; effective weekly norm reduced by `dailyNormMin` per holiday on a working weekday.
- **API** (`backend/src/index.ts`): `/corrections` already creates by kind; ensure `holiday` is accepted and a day-level convenience is available (full-day span).
- **UI** (`backend/src/ui/render.ts`): mark/clear-holiday control in the day detail; holiday badge on the lane; holiday days excluded from the working-day balance styling as appropriate.
- **Tests** (`backend/test/worktime.test.ts`): holiday zeroes the day norm, reduces the weekly norm, and worked time on a holiday still credits.
- No daemon or DB-schema-shape change (holiday is a correction row; kinds are a TEXT column).
