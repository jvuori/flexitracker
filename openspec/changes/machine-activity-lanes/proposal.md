## Why

The day timeline shows only the merged outcome across every machine in a ledger — `pairSpans` already computes each machine's own paired active/idle intervals internally but discards that breakdown the instant it unions them (`mergeIntervals`). There is no way to see *which* machine contributed a given stretch of measured time, or to precisely correct a boundary that belongs to one specific machine's activity without typing exact times. This also under-serves the project's own stated UX principle — "the day timeline always shows raw idle periods even when auto-bridged, never hide why a minute counts" — which today only applies *within* the merged timeline, not one layer earlier, at the per-machine source.

## What Changes

- Expanding a day (already the existing "no separate day-detail screen" interaction) now also reveals one **raw activity lane per machine** that contributed to that day, on the same 0–24h scale as the existing merged lane — always shown, even when only one machine was active, for a consistent shape regardless of day content.
- Raw lanes show literal per-machine paired active/idle intervals — noise-floor filtered (`minActiveSec`) and nothing else: no bridging, no office-hours gating, no corrections. They are the per-machine equivalent of today's personal-ledger composition, minus even the corrections layer.
- Raw lanes are **read-only as data, but selectable** — clicking any segment (active or idle) on a raw lane yields a `[start, end]` range, exactly as clicking the empty merged track already does today. Raw lanes never change appearance based on corrections; corrections continue to target the merged ledger only (raw events remain immutable, unchanged from today).
- The action strip (Count as work / Exclude / Move to other side / Undo·Restore) becomes reachable from three selection sources instead of one: an exact merged period (as today, unchanged), a raw-lane segment (new), or the existing "Advanced: enter exact times" freehand range (extended). The **collapsed week view is unaffected** — one merged lane per day, exactly as today.
- For the two selection sources that don't carry correction identity (raw-lane segment, freehand range), action availability is determined purely by **overlap against the current merged partition** — mirroring the enable/disable logic the Advanced control already uses today, extended to cover Move: Count enabled when the range overlaps `gap`/`review`/`removed`; Exclude and Move enabled when it overlaps `sensor`/`auto_bridged` (deliberately **not** `manual_added` — a plain `remove_work` is already a no-op against it, same reason today's Advanced "Mark private" excludes it). Undo/Restore remain reachable only via exact period selection, since they require a known correction id.
- **Accepted asymmetry, not a gap to close**: selecting the exact `manual_added` period (from the merged lane or its mirrored list) keeps the existing precise Move handling (delete the correction, re-add on the other ledger — a full, safe move). Selecting a raw-lane segment or freehand range that happens to overlap that same manual addition does *not* get this treatment — Move there only ever fires against `sensor`/`auto_bridged` overlap, so a mixed selection moves the sensor/bridged portion and correctly leaves the manual portion in place (the same split-safe behavior every correction already exhibits), without pretending to have moved the whole selection.
- The Advanced exact-times control gains a **Move to other side** button (it currently only has Add work / Mark private), gated by the same overlap rule as raw-lane Move.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `worktime-calculation`: day/week computation additionally exposes each contributing machine's own raw paired active/idle intervals, alongside the existing merged result — a pure addition, no change to existing composition, corrections, or norm/balance semantics.
- `manual-corrections`: generalizes how action availability is determined when a selection isn't an exact merged period (raw-lane segment or freehand range) — overlap-based against the merged partition, explicitly excluding `manual_added` from the Exclude/Move trigger set, and documents the resulting period-selection-vs-freehand-selection asymmetry for `Move`.
- `web-ui`: day timeline gains per-machine raw lanes on expand; every segment on every lane (raw or merged) is selectable into the same action strip; the Advanced control gains Move.

## Impact

- **Backend:** `backend/src/worktime/worktime.ts` (`pairSpans` also returns a per-machine breakdown of paired active intervals — machine identity was already computed internally, just discarded before return), `backend/src/tenant-do.ts` (attach the per-machine breakdown to each day's result, using the same role-filtered event set and machine-label lookup already built for the ledger split).
- **Web UI:** `backend/src/ui/render.ts` (render per-machine lanes in the expanded day panel; unify raw-lane/period/freehand selection into one action-strip code path; extend the Advanced control with Move and the shared overlap-gating logic).
- **No change** to `computeDay`/`computeWeek`'s composition, `correction` schema, sealed `daily_rollup`, or any existing endpoint's response shape beyond an additive field — this is a read/selection-surface change, not a rules change.
- **No daemon changes** — raw activity is already fully present in existing ingest data (`machine_id` per event); nothing new is captured.
