## 1. Holiday correction kind (data + boundary)

- [ ] 1.1 Add `"holiday"` to `CorrectionKind` in `backend/src/worktime/worktime.ts` (and mirror wherever kinds are validated, e.g. `schema.ts` / `tenant-do.ts`).
- [ ] 1.2 In `addCorrection` / the `/corrections` boundary, accept `holiday` and normalise its span to the full local day (`localDayStart(day)` .. +1 day) so it is unambiguously day-scoped; reject malformed holiday spans.

## 2. Calc: zero norm + weekly-norm reduction

- [ ] 2.1 In `computeDay`, compute `isHoliday` (any `holiday` correction covers `dayStart`), exclude `holiday` corrections from the add/remove interval math, add `isHoliday` to `DayResult`, and set `normMs = (isWorkingDay && !isHoliday) ? dailyNorm : 0`.
- [ ] 2.2 In `computeWeek`, reduce the effective weekly norm by `dailyNormMin` per holiday that falls on an otherwise-working weekday (clamp ≥ 0), set `weeklyNormMs` to the effective norm, and compute `weeklyBalanceMs` against it.
- [ ] 2.3 Tests in `backend/test/worktime.test.ts`: holiday zeroes the day norm; worked-on-holiday still credits; a full holiday week nets to zero; one holiday reduces the weekly norm by one daily-norm; holiday on a non-working day leaves the weekly norm unchanged.

## 3. UI: mark/clear holiday + indicator

- [ ] 3.1 In `renderSettings`/`dayLane` detail (`backend/src/ui/render.ts`), add a day-level "Mark as holiday" / "Clear holiday" toggle that POSTs/DELETEs a full-day `holiday` correction and re-renders the week.
- [ ] 3.2 Show a holiday indicator on the lane and present a holiday day's balance with the zero-norm styling (credit when worked, neutral otherwise); distinguish holiday from weekend via `isHoliday`/`isWorkingDay`.

## 4. Verify end-to-end

- [ ] 4.1 Run the backend unit tests — all green.
- [ ] 4.2 Drive the UI locally: mark a working day as holiday and confirm the day shows no deficit and the weekly balance improves by one daily-norm; add work on a holiday and confirm it credits; clear the holiday and confirm the norm returns.
