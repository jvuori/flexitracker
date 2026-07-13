## 1. Settings validation (backend boundary)

- [x] 1.1 In `backend/src/tenant-do.ts` `putSettings`, when `patch.workingWeekdays` is present, validate it is an array of integers each in `0..6`; normalise by dedupe + sort; throw on anything else (fail fast). Allow an empty array.
- [x] 1.2 Add a unit test covering valid, out-of-range, non-integer, duplicate, and empty `workingWeekdays` patches.

## 2. Non-working-day balance guarantee (regression pin)

- [x] 2.1 In `backend/test/worktime.test.ts`, add a case: a non-working day with working time yields `balanceMs === workedMs` and `>= 0`, and it adds to `weeklyBalanceMs`.
- [x] 2.2 Add a case asserting that flipping a weekday out of `workingWeekdays` sets that day's `normMs` to 0 (and thus its balance can only be a credit).

## 3. Signed balance formatter (UI)

- [x] 3.1 In `backend/src/ui/render.ts`, add a balance-only formatter `bal(ms)` = leading `+` for positive, `-` for negative, no sign for zero, wrapping the existing `hm` magnitude.
- [x] 3.2 Use `bal(...)` for the weekly `Balance` summary stat; confirm `Worked`, `Weekly norm`, and `Lunch` keep unsigned `hm`.
- [x] 3.3 In `dayLane`, render the daily balance with `bal(d.balanceMs)` when `d.balanceMs !== 0`, and show the neutral `—` only for a non-working day whose balance is exactly zero.

## 4. Working-days editor (Settings UI)

- [x] 4.1 In `renderSettings`, add a working-days control: seven checkboxes (Mon–Sun from `DAYNAMES`) checked from `s.workingWeekdays`.
- [x] 4.2 On Save, collect checked indices into a sorted array and include `workingWeekdays` in the PUT `/settings` patch alongside the numeric fields.

## 5. Non-working-day styling (UI)

- [x] 5.1 In `dayLane`, add an `off` class when `!d.isWorkingDay`; add a `.lane.off` rule (recessed neutral wash + dashed border cue + muted label with a small "weekend" tag), theme-aware in light and dark, not colour-only, without obscuring the track and without fighting the `.today` emphasis.

## 6. Per-day lunch visibility (UI)

- [x] 6.1 In `dayLane`, when `d.lunchMs > 0`, show the day's lunch deduction (e.g. `lunch −30m`) in the lane numbers; show nothing when zero. Confirm the settings form already exposes `lunchDeductMin` and `lunchThresholdMin` (no settings change needed).

## 7. Verify end-to-end

- [x] 7.1 Run `cd backend && ./node_modules/.bin/vitest run` (or the project's test command) — all unit tests green.
- [x] 7.2 Drive the UI locally (wrangler dev + synthetic seed + Playwright): unchecking Friday persisted `workingWeekdays=[0,1,2,3]` and flipped Friday from a `-2h 09m` deficit to a `+5h 21m` credit with the `off` recessed styling + tag; Sat credit `+1h 22m`, Sun `—`; weekly `-0h 19m` and per-day surpluses show `+`, deficits `-`, durations unsigned; long days show `lunch −0h 30m`, short days none.
