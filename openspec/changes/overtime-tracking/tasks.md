## 1. Overtime types + correction kind

- [ ] 1.1 Add `"overtime"` to `PeriodType` in `backend/src/worktime/interval.ts`.
- [ ] 1.2 Add `"overtime"` to `CorrectionKind` in `backend/src/worktime/worktime.ts` and to kind validation at the `/corrections` boundary (`tenant-do.ts`/`schema.ts`).

## 2. Calc: carve, tally, partition

- [ ] 2.1 In `computeDay`, split corrections into add/remove/overtime; compute `overtimeSpans = clampAll(overtimeCorr, win)`.
- [ ] 2.2 Subtract `overtimeSpans` from every flextime layer (sensor, bridged, manualAdded, removedSpans, reviewableGaps) before building `spans`, so overtime overrides add/remove and nothing double-counts.
- [ ] 2.3 Add `overtime` periods (carrying `correctionIds`) to the partition; keep the plain-`gap` fill last so the partition stays complete and disjoint.
- [ ] 2.4 Add `overtimeMs = totalDuration(overtimeSpans)` to `DayResult`; leave `grossMs`/`lunchMs`/`workedMs`/`balanceMs` computed from flextime `spans` only (overtime excluded from balance and lunch basis).
- [ ] 2.5 In `computeWeek`, add `weeklyOvertimeMs = Σ days` to `WeekResult`.

## 3. Calc tests

- [ ] 3.1 Overtime is excluded from `workedMs`/`balanceMs` and does not affect lunch.
- [ ] 3.2 Overtime over measured time removes it from flextime and adds to `overtimeMs`; overtime over a gap tallies its full span.
- [ ] 3.3 Overtime overrides `add_work` and `remove_work` on the same span.
- [ ] 3.4 Partition stays complete + non-overlapping with overtime present; flextime-counted sum == `grossMs` and overtime periods sum == `overtimeMs`, disjoint.
- [ ] 3.5 `weeklyOvertimeMs` equals the sum of daily overtime.

## 4. UI: color, actions, totals

- [ ] 4.1 Add a distinct `.seg.overtime` colour (saturated accent, clearly not the blue work family or the hollow exclusions) and `TYPELABEL.overtime`.
- [ ] 4.2 Extend `verbFor`/the action strip: any non-overtime period also offers **Mark as overtime** (`overtime` correction over the period); an `overtime` period offers **Undo overtime** (delete by `correctionIds`). Render two actions where a counting period now has both Exclude and Mark-as-overtime, laid out cleanly on mobile.
- [ ] 4.3 Show the day's overtime on its lane when `overtimeMs>0`, and add an `Overtime` stat to the weekly summary when `weeklyOvertimeMs>0`; keep both visually distinct from flextime worked/balance.

## 5. Verify end-to-end

- [ ] 5.1 Run the backend unit tests — all green.
- [ ] 5.2 Drive the UI locally: mark a measured period and a gap as overtime; confirm the flextime balance is unchanged, the day/week overtime totals appear, the overtime band has its own colour, and Undo overtime restores the prior disposition.
