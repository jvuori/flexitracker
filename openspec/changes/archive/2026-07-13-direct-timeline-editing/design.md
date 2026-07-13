## Context

The web UI is a single Worker-rendered page (`backend/src/ui/render.ts`): inline CSS + a node-free vanilla-JS client driving the JSON `/api`. Each day is an inline lane with a 0–24h timeline, a tick ruler, per-day numbers, and an in-place edit panel (the combined-weekly-timeline change).

Editing today is form-first. The `.detail` panel lists reviewable gaps ("Include as work") and removed spans ("Re-include"), plus a from/to time form for add-work / mark-private. Measured and auto-bridged spans — the periods that *count* — have no click action, and the plain idle gaps between spans are unrendered empty track, so they can't be selected at all. Clicking the lane only toggles the panel open.

The calculation engine (`backend/src/worktime/worktime.ts`) already composes corrections as non-merging provenance layers using interval algebra: `subtract(sensor, removes)`, `subtract(bridged, removes)`, `manualAdded = subtract(adds, survivingCovered)`, and `removedSpans = (sensor∪bridged) ∩ removes − adds`. Partial overlaps therefore already split correctly and re-attribute only the affected sub-span. This change is about **surfacing** those periods as directly manipulable objects, not changing how they compose.

## Goals / Non-Goals

**Goals:**
- Any period on a day — counted, excluded, or a plain gap — is a selectable object; selecting it reveals the one verb valid for its state, with boundaries pre-filled from the period itself.
- A single "Mark whole day as work" action fills the office day's gaps, anchored to real presence and bounded by the configured office window.
- `Undo`/`Restore` remove the exact correction behind a manual period.
- Works identically by tap on a phone and click on a laptop; screen-reader/keyboard navigable via a mirrored segment list.
- Manual time entry survives as the sub-period-precision escape hatch.

**Non-Goals:**
- No change to how corrections *compose* (interval algebra is already correct) or to the DO schema.
- No drag-to-select-a-range on the bar in this change (typed entry remains the precision path; drag can be a later change).
- No new UI dependency — stays vanilla JS + inline CSS.
- No change to worktime numbers, bridging thresholds, or lunch rules.

## Decisions

### Two verbs over the existing primitives
Every period is either counted or not, and its state picks the verb: not-counted → **Count** (`add_work`), counted → **Exclude** (`remove_work`), manual correction → **Undo/Restore** (delete the correction). The UI never asks the user to choose a primitive; it shows the applicable verb for the selected period.
- *Why:* collapses the editing vocabulary to what the user is actually deciding ("does this time count?"), and every action targets a real, already-computed period so boundaries come for free.

### The day is a complete, gap-free partition
`computeDay` emits a partition where every millisecond of the day belongs to exactly one typed period: `sensor`, `auto_bridged`, `manual_added`, `review`, `removed`, or a new `gap` type for plain idle time (out-of-hours, or in-hours below/around thresholds that isn't reviewable). The client renders and selects against this partition.
- *Why:* enables "click any period" literally, and solves the tiny-target problem — a 2px gap is still a full-width-of-itself selectable object, so tapping the visually empty track selects the gap under the finger. No invisible hit-padding needed.
- *Alternative:* derive gaps client-side from `spans`. Rejected — the server already knows the window and thresholds; duplicating that partition logic in the client risks drift from the engine.

### Inline action strip, not a floating popover
Selecting a period outlines it on the bar and reveals a **stable inline strip** below the bar showing the period's identity (time range, duration, type) and its one verb. A mirrored segment list underneath is the accessible/keyboard/precision path; selection is shared between bar and list.
- *Why:* popovers anchored to 2px segments are miserable on touch and collide at the lane edges. An inline strip is stable, mobile-friendly, and screen-reader navigable.
- *Alternative:* popover (rejected, above); list-only (rejected — loses the direct-manipulation feel the user asked for).

### Office-day fill envelope (anchored to presence, bounded by the office window)
The office window (`workdayStartMin`/`workdayEndMin`, e.g. 7–17) is **never a timestamp** — no period starts or ends at exactly 07:00. It only decides *which presence periods belong to the office day*: a sensor span belongs iff it **overlaps** the window. "Mark whole day as work" computes `envelope = [natural start of the first belonging span, natural end of the last belonging span]` and emits `add_work` over the gaps inside it. A pure pre-work check (e.g. 06:00–06:40, never reaching 07:00) doesn't overlap → doesn't anchor; an evening span (e.g. 20:30) doesn't anchor and its preceding gap isn't filled. Existing `remove_work` exclusions inside the envelope are **preserved** (the fill covers gaps, not deliberate removals).
- *Why:* matches how people actually work — "count my real arrival-to-departure day" — without silently filling evening or midnight-adjacent gaps, and without an artificial 07:00 boundary. Preserving exclusions honours the fail-loud principle (one tap must not un-do a deliberate private-time removal).
- *Trade-off:* a belonging span that runs late (13:00–20:00 continuous) extends the envelope end to 20:00, but there is no *gap* there to fill, so nothing is falsely added. Accepted.

### Corrections split partially-overlapping periods (already true; made explicit)
A `remove_work(08:00–12:00)` over sensor 09:00–10:00, bridged 09:00–09:15, and sensor 11:00–14:00 yields: plain gaps 08–09 and 10–11 (nothing was counted there, so nothing is "removed"), `removed` bands 09:00–10:00 and 11:00–12:00, and `sensor` 12:00–14:00. An `add_work` that overlaps real activity wraps the surrounding time as `manual_added` while the real span keeps its own provenance. This is exactly what the interval algebra already produces; the change records it as spec'd behaviour and regression-guards it, and requires the **partition to carry each split boundary as its own selectable object** (five rows above, not one merged blob).

### Correction identity threads through to periods
`Correction` carries its row `id`; `manual_added` and `removed` periods in `DayResult`/`/api/week` carry the id(s) of the correction(s) that produced them. `Undo`/`Restore` calls `DELETE /api/corrections/:id`.
- *Why:* deleting by span-match is ambiguous when corrections overlap or were clamped; the id is exact. `deleteCorrection(id)` already exists on the DO.
- *Note:* a period may derive from more than one correction (e.g. two adjacent adds); the strip's Undo removes the correction(s) covering the selected period.

## Risks / Trade-offs

- **Partition density on a 24h lane** → adding plain gaps as objects must not visually clutter the bar; render them as faint/near-transparent fills that read as "empty but selectable," distinct from the excluded/review hatching. Verify at ~360px.
- **Multi-correction periods for Undo** → a selected manual period spanning two corrections needs a defined behaviour (remove all corrections covering the selection). Spec'd; keep the strip's label honest ("Undo 2 additions").
- **`/api/week` payload growth** → emitting every gap increases the response, but a day has O(tens) of periods; negligible.
- **E2E coupling** → the post-deploy smoke drives the two suggestion buttons; it must move to select-a-period + action strip and exercise the whole-day fill. Caught by the QA E2E gate before PROD.
- **Overlap-vs-touch edge** → "belongs" is defined as a non-empty intersection with the office window; a span ending exactly at the window start (measure-zero) does not belong. Documented so it isn't re-litigated.

## Migration Plan

1. Extend the engine: `DayResult` gains the typed partition (add `gap` periods) and the office-day envelope; thread correction `id` through `Correction`/`Span`. Unit-test split attribution, plain-gap emission, and envelope belonging/boundaries.
2. Extend `/api/week` (additive) with gap periods + per-period correction ids; add `DELETE /api/corrections/:id`.
3. Rework the lane client: per-period selection (bar + mirrored list), inline action strip with the state-derived verb, "Mark whole day as work" button, `Undo`/`Restore`; demote the from/to form to an "exact times" advanced control.
4. Update Worker/DO unit tests and the post-deploy E2E smoke to the new interactions.
5. Verify locally via the synthetic-activity generator (select periods, fill day, undo/restore) across laptop + mobile widths, light + dark.
6. Push to `main` → QA auto-deploys and E2E runs; PROD stays manual-only and gated.
- *Rollback:* the engine additions are backward-compatible (additive fields); revert the renderer + route commits to return to form-first editing without data migration.

## Open Questions

- **Fill-day verb for a day with no belonging span** (e.g. only evening activity, or a day off): the envelope is empty, so "Mark whole day as work" is a no-op. Hide the button, or offer a plain "count the whole configured office window"? Default: hide it when there is no office-day envelope; revisit if users want to assert a fully activity-less office day.
- **Gap period visual weight** — exact tint/opacity for plain gaps so they read as selectable-but-empty without competing with review/removed hatching. To settle against a live mockup during implementation.
- **Undo scope wording** when a selection spans multiple corrections — confirm the "remove all covering corrections" behaviour reads clearly in the strip.
