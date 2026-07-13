## Context

Corrections are span rows (`kind`, `start_ts`, `end_ts`) in the per-account DO; `CorrectionKind` is `"add_work" | "remove_work"`. `computeDay` sets `normMs = isWorkingDay ? dailyNorm : 0` and `computeWeek` computes `weeklyBalanceMs = weeklyWorkedMs - weeklyNormMin*MIN` — a flat weekly norm independent of the day norms. A holiday needs to zero a specific day's norm and, because of that flat weekly norm, also shrink the weekly norm or the week line will still show the deficit the daily lines no longer do.

## Goals / Non-Goals

**Goals:**
- A full-day holiday marker that zeroes that day's norm and reduces the weekly norm by one daily-norm (on otherwise-working days), so a vacation week nets to zero.
- Worked time on a holiday still credits (holiday ≠ remove_work).
- Reuse correction plumbing (create/delete/undo/audit/dirty-day) via a new `holiday` kind.

**Non-Goals:**
- No partial-day holidays (holiday spans the whole local day).
- No holiday calendar import / recurring public-holiday feeds — manual marking only, for now.
- No change to how measured activity, bridging, or add/remove corrections compute.
- Not modelling paid-leave accounting beyond "this day owes no norm."

## Decisions

- **`holiday` as a new `CorrectionKind`, full-day span.** The UI always creates it as `[localDayStart, localDayStart+1day)`. In `computeDay`, `isHoliday = any holiday correction covers dayStart`. Holiday corrections are filtered out of the add/remove interval math entirely — they never touch `spans`, `removedSpans`, or the partition; they only set `isHoliday` and thus `normMs = 0`. So `normMs = (isWorkingDay && !isHoliday) ? dailyNorm : 0`.
- **Weekly-norm reduction lives in `computeWeek`.** After building the 7 days, `effectiveWeeklyNorm = max(0, weeklyNormMin*MIN − dailyNormMin*MIN × count(days that are holidays AND would otherwise be working days))`. `weeklyBalanceMs = weeklyWorkedMs − effectiveWeeklyNorm`. Expose the effective norm as `weeklyNormMs` so the summary line stays self-consistent. A holiday on an already-non-working day contributes no reduction (it carried no norm).
- **Validation.** `addCorrection` (or the `/corrections` boundary) accepts `holiday` and, for that kind, normalises the span to the full local day (or requires it) so a holiday is unambiguously day-scoped. Deleting is the existing `deleteCorrection(id)`.
- **UI = day-level toggle.** In the expanded lane's detail (not the per-period action strip), add "Mark as holiday" / "Clear holiday". A holiday lane gets a badge; its balance uses the same zero-norm presentation as a non-working day (credit when worked, else neutral). Reuses the same recompute/re-render path as other corrections.
- **Interaction with `isWorkingDay`.** `DayResult` keeps `isWorkingDay` (weekly config) and adds `isHoliday`. Norm depends on both; display can distinguish "weekend" from "holiday" via the two flags.

## Risks / Trade-offs

- **Weekly norm now derived, not the raw setting.** The weekly-summary "norm" figure becomes the *effective* norm (reduced by holidays). This is the correct thing to show, but reviewers must know `weeklyNormMs` is no longer a straight echo of `weeklyNormMin`. Documented on `WeekResult`.
- **Independent weekly norm vs daily norms.** If a user sets a weekly norm that isn't 5×daily, holiday reduction still subtracts one *daily* norm per holiday, which is the intuitive "give back a day." Acceptable; noted so it isn't mistaken for a bug.
- **Double-marking / holiday over a non-working day.** Guarded: reduction only counts holidays on otherwise-working weekdays; a holiday correction is idempotent per day (one covering row suffices; creating a second is avoidable by toggling on presence).
- **Cross-midnight / timezone.** Holiday span is computed from `localDayStart` in the account timezone, consistent with every other boundary — no UTC-day drift.
