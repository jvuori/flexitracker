## Why

Some worked time is **overtime** that the employer compensates separately (paid or banked outside flextime) and must not move the flextime balance. Today every counted minute lands in the flextime total, so there is no way to record "I worked these two hours, but they are overtime" without polluting the saldo. The user needs to tag periods as overtime, keep them out of the flextime balance, and see overtime tallied on its own.

## What Changes

- Add an **overtime** disposition: any selectable period of a day — measured, auto-bridged, manual, reviewable, removed, or a plain gap — SHALL be markable as overtime.
- Overtime time is **excluded from the flextime balance** (not part of a day's worked time, gross, lunch basis, or daily/weekly balance) and is instead **tallied separately** as the day's overtime and the week's total overtime.
- Overtime gets its **own period type and color** in the timeline, visually distinct from measured/bridged/manual/removed/gap, so it is never confused with flextime work.
- The expanded lane gains a **Mark as overtime** action on any non-overtime period and an **Undo overtime** action on overtime periods; boundaries come from the selected period, as with existing corrections.
- Day overtime and weekly total overtime SHALL be **computed and shown** to the user (in the day lane and the weekly summary).
- Persist overtime as a new correction kind so it reuses correction plumbing (create/delete/undo, audit, dirty-day recompute) and never mutates raw events.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `worktime-calculation`: overtime is worked-but-separate — excluded from flextime worked/gross/lunch/balance and accumulated as a distinct daily and weekly overtime total.
- `manual-corrections`: introduce an `overtime` correction kind that takes precedence over add/remove for its span and is undoable by id.
- `web-ui`: overtime period type with distinct color; Mark/Undo-overtime actions on any period; day and weekly overtime totals shown.

## Impact

- **Types** (`backend/src/worktime/interval.ts`): add `overtime` to `PeriodType`. **Correction kind** (`worktime.ts` `CorrectionKind`; kind validation in `tenant-do.ts`/`schema.ts`): add `overtime`.
- **Calc** (`worktime.ts` `computeDay`/`computeWeek`): carve overtime spans out of all flextime layers; add `overtimeMs` to `DayResult` and `weeklyOvertimeMs` to `WeekResult`; keep the partition complete and disjoint with overtime periods; update the "counted periods sum to gross" invariant to separate flextime-counted from overtime-counted.
- **UI** (`backend/src/ui/render.ts`): `.seg.overtime` color; `verbFor` gains overtime; action strip offers Mark/Undo overtime; day lane and weekly summary show overtime totals.
- **Tests** (`backend/test/worktime.test.ts`): overtime excluded from balance, tallied per day/week, precedence over add/remove, partition stays complete/disjoint.
- No daemon or DB-schema-shape change (overtime is a correction row; kind is a TEXT column).
