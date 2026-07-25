## Context

This follows directly from `work-personal-ledgers` (archived), which asked "did we implement per-machine lanes?" and deliberately answered no — machine identity is discarded the moment `pairSpans` unions per-machine intervals, and that was fine because the whole feature only needed to filter *which* machines feed a ledger, never to attribute merged output back to a machine.

This change is different in kind: it's presentation-only. Nothing about ledger composition, corrections, or sealing changes. The trigger was a direct question during exploration: "did we implement lanes to present different machines separately, or is the plan to always merge them?" — followed by the realization that `pairSpans` already computes the per-machine breakdown internally (`byMachine: Map<machineId, RawEvent[]>`, paired into intervals per machine) and only *discards* it at the final `mergeIntervals(all)` step. Exposing what's already computed is a small, surgical addition.

## Goals / Non-Goals

**Goals:**
- Show, per day, each contributing machine's own raw (noise-floor-filtered, unbridged, uncorrected) activity — always, even for a single machine — alongside the existing merged outcome.
- Let any segment on any lane (raw or merged) seed the same action strip that today only period-selection reaches.
- Keep corrections and their effects strictly merged-ledger-only — raw lanes never change based on corrections, and no correction ever gets attributed to a machine.
- Keep the collapsed week view — the default, most-viewed screen — completely unchanged.

**Non-Goals:**
- Attributing merged `Span`/`Period` objects to machines. Composition stays exactly as it is; only a *separate*, purely additive read gets exposed.
- Making corrections machine-aware in storage or API. A correction remains `{ kind, start, end, ledger }` — never a machine id.
- A "fully overlap-safe Move" that splits an existing `add_work` correction on partial overlap with a freehand/raw-lane selection. Explicitly rejected during exploration: excluding `manual_added` from the Exclude/Move trigger set for non-period selections makes this unnecessary — see D3.

## Decisions

### D1: Expose the per-machine breakdown from `pairSpans` itself, not a separate function
`pairSpans` (`worktime.ts`) already loops over `byMachine.values()`, pairing each machine's own events into active intervals before flattening them into the merged `all` array via `mergeIntervals`. The per-machine intervals — and per-machine provisional/growing detection, which is *already* computed per machine before the merge (the `provisional.push(...)` call is inside the per-machine loop, not after) — are fully available at that point; they're just never returned. `PairedSpans` gains a third field, e.g. `byMachine: Map<string, { active: Interval[]; provisional: ProvisionalSpan[] }>`, populated in the same loop, alongside the existing `active`/`provisional` merge. No new pairing logic, no change to the merge itself.
*Alternative considered:* a second, parallel function that re-derives per-machine intervals from the same event list. Rejected — it would duplicate the exact pairing logic `pairSpans` already has, with a real risk of the two implementations drifting (e.g. a future grace-window tweak applied to one and not the other).

### D2: The per-machine breakdown is a pure display attachment, computed alongside `computeDay`/`computeWeek`, not inside them
`computeDay` stays exactly as it is (byte-for-byte unchanged) — it never needs to know about individual machines, only the already-role-filtered, already-merged interval list it receives today. The per-machine raw breakdown is attached at the `tenant-do.ts` layer (`getWeek`), which already has both the role-filtered event list and the machine roster (via the same `machineRoles()`/`filterByLedgerRole()` machinery `work-personal-ledgers` introduced). A day's raw-lane data is: for each machine present in that day's role-filtered events, its own `pairSpans`-per-machine active intervals clamped to the day, filtered by `minActiveSec` (the same noise floor `computeDay` already applies) — nothing else. This mirrors the personal-ledger composition's philosophy (sensor + noise floor, nothing more) one level further down, but doesn't reuse `computeDay("personal")` directly, since that still runs the correction-composition machinery this data must never touch.
*Alternative considered:* threading a `machineId` field through `Span`/`Period` so the merged partition itself carries attribution. Rejected outright during exploration — it would make corrections' "which machine does this belong to" question live again, exactly the trap the two-ledger design deliberately avoided by keeping corrections time-range-only. Keeping the raw breakdown structurally separate from the composed `Span`/`Period` output is what lets corrections stay machine-blind.

### D3: Action availability for non-period selections is overlap-based against the merged partition, and deliberately excludes `manual_added` from Exclude/Move — no split-safe Move needed
A raw-lane segment or a freehand-typed range carries no correction identity — it's just a `[start, end]`. Whether Count/Exclude/Move should be offered is decided by checking overlap against the *current merged partition*, exactly like the existing "Advanced: enter exact times" control already does for Count/Exclude (`overlaps(['gap','review','removed'])`, `overlaps(['sensor','auto_bridged'])`). `Move` joins the same set as Exclude — `sensor`/`auto_bridged` only, never `manual_added`.

This resolves a correctness question raised during exploration without new machinery: could a freehand/raw-lane `Move` silently under-deliver if the selected range partially overlaps an existing manual addition (a plain `remove_work` is a no-op against `add_work`, per existing precedence)? Excluding `manual_added` from the trigger set means Move is only ever *offered* where a plain `remove_work` can actually act — a mixed selection (part sensor, part manual_added) still enables Move (it overlaps `sensor`), and firing it correctly moves only the sensor/bridged sub-portion, leaving the manual portion untouched — which is the same split-safe behavior every correction already has (`manual-corrections`' "Corrections split partially-overlapping periods"), not a new failure mode.

This does create a real, accepted asymmetry: selecting the *exact* `manual_added` period (via the merged lane or its mirrored list, where the correction id is known precisely) keeps its existing special-cased Move (delete the correction, re-add on the other ledger — a complete, safe move, necessary because a plain `remove_work` there would be a *total*, not partial, no-op). A raw-lane/freehand selection that happens to exactly span that same period does not get this upgrade. Precise selection is correction-aware and can do more; approximate selection is correction-blind and does less, gracefully.
*Alternative considered:* making Move fully overlap-safe by detecting and splitting any partially-overlapping `add_work` correction before moving. Rejected — real implementation cost for a case D3's gating already handles safely by declining to act rather than acting incompletely.

### D4: Raw lanes render in the already-expanded day panel; the collapsed week view is untouched
The "no separate day-detail screen" interaction stays exactly as is — expanding a day is still the same in-place action, just revealing more (the raw lanes) inside the same panel that already holds the legend, action strip, mirrored period list, and Advanced control. This keeps the (already responsive/mobile-tested) collapsed week view — the screen looked at every time, most of the time — completely unaffected, and treats raw lanes as strictly *more detail on demand*, consistent with how the Advanced control itself is already presented.

## Risks / Trade-offs

- **[Risk]** A day with many machines (e.g. testing across several devices) makes the expanded panel tall. → **Mitigation**: raw lanes are thin (matching existing `.track` sizing) and only appear on expand, not in the collapsed week view; acceptable for the common case (1–3 machines).
- **[Trade-off]** The period-selection-vs-freehand-selection Move asymmetry (D3) means the *same* logical time range can offer different actions depending on how it was selected. Accepted as an honest reflection of what each selection mode actually knows, not hidden — the UI should make the two feel like genuinely different granularities of selection, not a bug.
- **[Trade-off]** Raw lanes duplicate some information already visible on the merged lane (a solo-machine day's raw lane looks like the merged lane's sensor portions). Accepted per explicit instruction — always show, even for one machine, for a predictable, non-content-dependent panel shape.

## Migration Plan

Purely additive: a new field on the day/week read shape (no schema/storage change — raw lanes are computed at read time from already-stored raw events, same as everything else `computeWeek` reads), a new UI section, and one new button (Advanced → Move) with a widened but backward-compatible enablement check. No rollout ordering concerns; ships as one deploy.
