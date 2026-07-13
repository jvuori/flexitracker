## 1. Engine: partition, envelope, correction identity

- [x] 1.1 Thread the correction row `id` through `Correction` (loaded in `tenant-do.ts`) and onto derived `manual_added`/`removed` partition periods via `correctionIds`.
- [x] 1.2 Extend `computeDay` to emit a complete gap-free partition (`periods`): add explicit `gap` periods for plain idle time (the day window minus all counted/review/removed periods), each typed and selectable. Counted-time totals unchanged.
- [x] 1.3 Compute the office-day envelope in `computeDay`: presence spans overlapping `[workdayStartMin, workdayEndMin]` define belonging; envelope = [min natural start, max natural end] of belonging spans; `null` when none overlap.
- [x] 1.4 Unit-test the engine: split attribution across a straddling remove, removed-only-where-counted, add wrapping real activity, plain-gap emission, partition tiles the day with counted-sum == gross, and envelope belonging/natural-boundaries/pre-work+evening excluded/no-envelope cases.

## 2. API surface

- [x] 2.1 Extend the `/api/week` per-day payload (additively) with the gap periods, per-period correction ids, and the office-day envelope. (Done via the new `DayResult.periods`/`officeEnvelope` fields — the payload is `WeekResult` serialized.)
- [x] 2.2 `DELETE /api/corrections/:id` (authenticated session only) wired to the existing `deleteCorrection` DO method — already present in `index.ts` and marks the affected day dirty.
- [x] 2.3 Decision: the "fill working day" path is **client-computed from the partition** — post `add_work` over each `review`/`gap` period inside the envelope. No new endpoint; composition is identical to any typed correction, and `removed` periods are left untouched so exclusions are preserved. (Implemented in 3.5.)

## 3. Lane client: selection + action strip

- [x] 3.1 Render the full partition on the lane, including faint selectable `gap` periods (`.seg.gap`) distinct from review/removed hatching; verified legibility at 360px and 900px (screenshots).
- [x] 3.2 Implement per-period selection: a track click resolves the covering period by x (tiny targets stay usable), outlines it on the bar (`.seg.sel`) and highlights it in the mirrored period list; list rows are `<button>`s (keyboard/touch operable).
- [x] 3.3 Build the inline action strip showing the selected period's range/duration/type and the single state-derived verb (Count / Exclude / Undo / Restore); corrections use the period's own boundaries.
- [x] 3.4 Wire Undo/Restore to `DELETE /api/corrections/:id` using the period's `correctionIds` (deletes all corrections covering the selected period).
- [x] 3.5 Add the "Mark whole day as work" button (hidden when `officeEnvelope` is null) that fills each review/gap period inside the envelope, leaving `removed` exclusions untouched.
- [x] 3.6 Demote the from/to form to a secondary `<details>` "Advanced: enter exact times" control.
- [x] 3.7 Re-fetch `/api/week` and re-render after any action, preserving the open day (selection intentionally reset — the partition changes).

## 4. Tests and verification

- [x] 4.1 Added engine unit tests (partition/split/envelope) and extended the API-level E2E smoke with partition-tiling, office-envelope, and correction-id assertions. (The smoke drives the JSON `/api` directly — not the DOM — and the existing `reviewableGaps`/`spans` assertions still hold since those fields are retained.)
- [x] 4.2 Verified locally via the synthetic-activity generator + Playwright: select measured/bridged/gap/review/removed periods; count/exclude/undo/restore; fill a day; advanced exact-times — across 900px and 360px widths. Zero console errors.
- [x] 4.3 Confirmed weekend/evening-only days expose no `officeEnvelope` (no fill button), the fill respects envelope bounds (morning/evening idle left unfilled), and `removed` periods are skipped by the fill (unit-tested exclusion preservation).
- [x] 4.4 Pushed to `master` (commit `ddd0e1e`); Deploy QA run `29263094987` succeeded — deploy + live-QA E2E (fixtures + smoke) green. PROD stays manual-only, untouched.

## 5. Realistic test/demo data (user request)

- [x] 5.1 Extend the block schema with an optional `ed` (end weekday) so a single effort can run past midnight; `fixtures.mjs` emits the `idle` event on `ed`.
- [x] 5.2 Add a "realistic variation" fixtures week (offset -3): natural non-sharp start/stop times, out-of-hours evening work, and two cross-midnight sessions (Wed→Thu, Fri→Sat) with a hand-computed oracle — all validated by `fixtures.mjs` (splits at 00:00 into per-day periods).
- [x] 5.3 Enrich the local `seed.mjs` demo with the same realism (varied times, out-of-hours, two midnight-spanning sessions); verified the split renders as edge-of-day segments in the UI.
