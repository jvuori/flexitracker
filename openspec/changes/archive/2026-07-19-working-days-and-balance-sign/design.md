## Context

`Settings.workingWeekdays` (0=Mon..6=Sun, default `[0,1,2,3,4]`) already exists and `computeDay` already sets `normMs = isWorkingDay ? dailyNorm : 0`, so a non-working day's `balanceMs = workedMs - 0 = workedMs` is already add-only, and `computeWeek` already sums all days' `workedMs` against the flat `weeklyNorm`. The gaps are entirely at the edges:

- The Settings form (`render.ts` `renderSettings`) has no working-days control and the PUT allow-list omits `workingWeekdays`.
- `/settings` PUT (`putSettings`) shallow-merges any patch with no validation.
- The day lane renders `d.isWorkingDay ? hm(d.balanceMs) : '—'`, hiding a non-working day's real credit.
- `hm(ms)` prefixes `-` for negatives but nothing for positives, and it is shared by durations and balances, so it cannot simply gain a `+`.

## Goals / Non-Goals

**Goals:**
- User-editable working days in Settings, defaulting to Mon–Fri.
- Non-working days visibly credit the balance (`+3h 00m`), never debit it.
- Signed balances (`+`/`-`) for daily and weekly balances only.
- Reject invalid `workingWeekdays` at the ingest boundary (fail fast).

**Non-Goals:**
- No change to how worked time, bridging, corrections, or the weekly norm are computed. The weekly norm stays an independent flat setting (not derived from the count of working days).
- No per-day custom norms; a working day keeps the single `dailyNormMin`.
- No schema, API-shape, or daemon changes.

## Decisions

- **Balance formatter kept separate from `hm`.** Add a small `bal(ms)` helper = `(ms>0?'+':ms<0?'-':'')+hm(abs(ms))` (or reuse `hm`'s magnitude), used only where a balance is rendered: the weekly summary `Balance` stat and each lane's `.bal`. `hm` itself is untouched so durations stay unsigned. Zero renders without a sign.
- **Non-working-day lane shows the credit.** Replace `d.isWorkingDay ? hm(d.balanceMs) : '—'` with: show `bal(d.balanceMs)` whenever `d.balanceMs !== 0` (covers both working days and worked non-working days); show the neutral `—` only when the balance is exactly zero on a non-working day. Working days with a zero balance still show `+0h 00m`/`0h 00m` as today — keep their existing behavior by only diverting to `—` for non-working, zero-balance days.
- **Working-days editor = seven checkboxes** (Mon–Sun) built from `DAYNAMES`, checked from `s.workingWeekdays`. On save, collect the checked indices into a sorted array and include it in the PUT patch alongside the numeric fields.
- **Validation in `putSettings`.** If `patch.workingWeekdays` is present, require an array of integers each in `0..6`; normalise by dedupe + sort; reject (throw) otherwise so the boundary fails loudly rather than storing garbage. An empty array is permitted (a user with no fixed working days — every day then credit-only).
- **Regression test over reasoning.** Because the math is already correct, pin it: a `worktime.test.ts` case asserting a non-working day with work yields `balanceMs === workedMs ≥ 0` and that flipping a weekday out of `workingWeekdays` zeroes its norm.
- **Non-working-day styling = a recessive lane variant.** `dayLane` already knows `d.isWorkingDay`. Add an `off` class to non-working lanes and style `.lane.off` with: a faint neutral wash so the surface sits *below* `--panel` (in light, a hair darker than `--panel`; in dark, a hair lighter — reuse `--panel2`/a subtle tint so it reads as recessed in both), a dashed rather than solid left/whole border to give a non-colour cue, and a muted day label with a small "weekend" tag by the date. Working days keep today's look, so they stay the primary surface. Keep it subtle — the timeline track and numbers must stay fully legible, and it must not fight the `.today` outline (a day can be both today and non-working; `.today` wins on emphasis). This composes with the separate holiday change, which adds its own badge on top.
- **Per-day lunch is display-only.** `DayResult.lunchMs` already exists and the settings that drive it (`lunchDeductMin` / `lunchThresholdMin`) are already editable — the current form already renders both fields. So this is purely a lane render: show `lunch −<hm(lunchMs)>` when `lunchMs > 0`, nothing when zero. No calc, settings, or spec change to the lunch rule itself.

## Risks / Trade-offs

- **Signed zero / working-day zero balance.** A working day exactly on norm shows `+0h 00m` under a naive `ms>0` check only if we special-case zero to unsigned — decision above renders bare `0h 00m` for zero, avoiding a misleading `+0`. Acceptable and clearer.
- **Empty working-days set.** Allowed by design (every day credit-only); the weekly norm still applies, so the weekly balance can still be negative. This matches "weekends only increase" generalised, and is the user's explicit choice.
- **Shared `hm` call sites.** Must audit every balance render site so none is missed and none of the duration sites accidentally gets signed — small, contained to `render.ts`.
