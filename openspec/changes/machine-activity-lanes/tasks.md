## 1. Worktime calculation: expose per-machine raw activity

- [x] 1.1 Extend `PairedSpans` (`backend/src/worktime/worktime.ts`) with a `byMachine: Map<string, { active: Interval[]; provisional: ProvisionalSpan[] }>` field
- [x] 1.2 Populate it inside `pairSpans`'s existing per-machine loop (`byMachine.values()`), alongside the existing push into the merged `all`/`provisional` arrays — no change to the merge itself or to `mergeIntervals`
- [x] 1.3 Unit tests: two machines with distinct active windows produce independent per-machine breakdowns that sum correctly with the existing merged result; a still-heartbeating machine's per-machine entry is `growing` independently of another, fully-closed machine's entry on the same day

## 2. Attach the breakdown to day/week reads

- [x] 2.1 In `TenantDO` (`backend/src/tenant-do.ts`), compute each day's per-machine raw activity from the same role-filtered event set already used for the ledger (`filterByLedgerRole`), clamped to the day and filtered by `minActiveSec` — reuse `pairSpans`'s new `byMachine` output, do not re-derive it
- [x] 2.2 Extend the machine-role registry lookup (or add a sibling query) to also fetch `label`, so each raw lane can be labeled by the machine's name, not just its id — added `machineLabels()`, mirroring `machineRoles()`
- [x] 2.3 Attach the per-day per-machine breakdown to `WeekResult`/`DayResult` (or a sibling structure returned alongside them) — additive only, no change to existing fields — new `MachineActivity`/`WeekResultWithActivity` types, `getWeek`/`weekView` return the widened type
- [x] 2.4 Confirm `getWeek`'s sealed-day fallback (days past the raw-retention window) simply omits per-machine detail rather than erroring — verified by inspection: a pruned day has zero raw events left to load, so `byMachine` has nothing to clamp into that day's window and `machineActivity` naturally ends up `[]`, no special-casing needed

## 3. API surface

- [x] 3.1 Include the per-machine breakdown in `GET /week`'s response shape (additive field per day) — automatic: `index.ts`'s `/week` handler already does `c.json(await ...weekView(...))` with no reshaping, so the new field passes through unchanged
- [x] 3.2 Confirm no other endpoint needs changes — corrections, `/corrections/move`, and machine role endpoints are all unaffected by this read-only addition — verified by inspection, no other endpoint touches `getWeek`/`weekView`'s return shape

## 4. Web UI: render raw per-machine lanes

- [x] 4.1 In the expanded day panel (`buildDetail`, `render.ts`), render one thin lane per machine present in that day's per-machine breakdown, always (even for one machine), using the same 0–24h scale/tick helper the merged track already uses
- [x] 4.2 Label each lane with the machine's label
- [x] 4.3 Render each machine's active/idle segments on its lane; mark a `growing` per-machine segment the same way the merged lane already marks provisional periods — `rawTile()` tiles active/idle client-side (a pure presentation split, no bridging judgement involved), `markRawProvisional()` mirrors the merged lane's treatment
- [x] 4.4 Confirm raw lanes re-render only from the (unaffected) per-machine data on each reload — never derive their appearance from merged periods or corrections — verified by inspection: raw lane rendering reads only `d.machineActivity`, never `d.periods`/`d.spans`

## 5. Web UI: unify selection across merged periods, raw segments, and freehand ranges

- [x] 5.1 Generalize period-selection's action-strip trigger so a raw-lane segment click also produces a `[start, end]` selection and opens the action strip — `renderRangeStrip()`
- [x] 5.2 Implement the overlap-gating rule from `manual-corrections`' "Action availability for a selection without correction identity": Count enabled iff selection overlaps `gap`/`review`/`removed`; Exclude and Move enabled iff it overlaps `sensor`/`auto_bridged` (excluding `manual_added`) — extracted the existing Advanced-control overlap check into a shared `overlapsTypes(d,s,e,types)`, used by both the raw-lane click handler and the Advanced control
- [x] 5.3 Ensure Undo/Restore are never offered for a raw-lane or freehand selection (no correction id available) — `renderRangeStrip()` only ever offers Count/Exclude/Move
- [x] 5.4 Wire the resulting Count/Exclude actions to the existing `/corrections` endpoint and Move to the existing `/corrections/move` endpoint, unchanged — `actOnRange()`, no new backend call shapes

## 6. Web UI: Advanced control gains Move

- [x] 6.1 Add a "Move to other side" button to the Advanced exact-times control (`render.ts`), alongside the existing Add work / Mark private
- [x] 6.2 Gate its enabled state with the same overlap rule as task 5.2 (`canMove = canRm`, i.e. overlaps `sensor`/`auto_bridged`, not `manual_added`)
- [x] 6.3 Wire it to `/corrections/move` with the ledger currently being viewed as `fromLedger`

## 7. Verification

- [x] 7.1 Unit tests for the overlap-gating logic covering: pure gap/review/removed overlap, pure sensor/auto_bridged overlap, pure manual_added overlap (nothing offered), and a mixed sensor+manual_added overlap — implemented as `LANE_HELPERS_SRC` in `client-helpers.ts` (mirroring how `TIME_HELPERS_SRC` already lets pure client-side logic be unit-tested via `new Function`, since the client itself is a plain string), tested in `client-helpers.test.ts` (`overlapsTypes`/`rawTile`/`markRawProvisional`, 10 new tests)
- [x] 7.2 Live verification via `wrangler dev` + the existing QA e2e fixtures (unmodified — this feature needed no new fixture scenarios, the existing two-machine Monday was enough): full suite still `ALL FIXTURES VALID`; `GET /week?ledger=work` inspected directly and confirmed `days[0].machineActivity` holds two independent entries (Laptop 08:04–11:28, Desktop 12:06–16:11) matching the fixture, merged `workedMs` unaffected
- [x] 7.3 Browser verification: expanded Monday (2 machines) — both raw lanes render, labeled "Laptop"/"Desktop"; expanded Tuesday (1 machine) — exactly one raw lane still appears; clicked a raw-lane segment on Monday — strip showed "Laptop · 08:04–11:28 · 3h 24m" with Exclude/Move offered; on Tuesday, used the Advanced control to Move 09:10–09:40 (fully inside sensor time) — work `workedMs` dropped by exactly 30m (28800000→27000000) and personal `workedMs` gained exactly 30m (0→1800000), confirming the move landed correctly on both ledgers with nothing lost or duplicated; on Wednesday, set the Advanced control to 11:00–12:00 (fully inside the day's existing `manual_added` block) — Add/Exclude/Move were all correctly disabled with the "nothing to act on" title, confirming the manual_added-exclusion guard from design D3 holds live

## 8. Docs

- [x] 8.1 Update `CLAUDE.md` if any new pitfall surfaces during implementation — one did, found via user feedback after initial verification: the raw per-machine lanes (`.mlane`, `grid-template-columns:96px 1fr`) didn't share `.lane-head`'s column template (`96px 1fr 118px`), so the shared `1fr` timeline column resolved to different pixel widths between the merged and raw tracks — segments were each internally correct (`pct()` math) but the two tracks didn't align with each other. This is the same failure mode as the existing "Day timeline appears shifted" pitfall, now recurring *across* tracks rather than within one; fixed by matching `.mlane`'s grid template (desktop and the `max-width:640px` layout) to `.lane-head`'s exactly, and added a cross-referencing entry to CLAUDE.md. Verified with `getBoundingClientRect` at both desktop (996px+) and mobile (375px) widths — `left`/`width` now identical between the two tracks at both breakpoints.
- [ ] 8.2 Run `/opsx:archive` once implementation and QA e2e are green — not yet: pending commit/push and the real CI pipeline, same as `work-personal-ledgers`
