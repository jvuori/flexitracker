## Why

The combined weekly timeline made every day scannable, but editing is still **form-first**. Only two period types are directly actionable — a reviewable gap gets an "Include as work" button and a removed span gets a "Re-include" button — and everything else is corrected by typing two clock times into an add-work / mark-private form. The measured and auto-bridged spans that *count* aren't clickable, the plain idle gaps between spans are invisible (unrendered track), and the common intent "I worked all day, stop nitpicking the gaps" has no single action.

The engine underneath already composes corrections correctly by interval algebra (`add_work`/`remove_work` split partially-overlapping spans and tag provenance), so this is a **presentation and interaction** change, not a recalculation change. We want direct manipulation: every period on a day is a selectable object, selecting it reveals the one verb that applies with its boundaries filled in automatically, and a one-tap action can mark the whole office day as continuous work. Typed time entry survives only as the escape hatch for sub-period precision.

## What Changes

- **Every period becomes a selectable object.** `computeDay` exposes a complete, gap-free partition of the day — measured, auto-bridged, manual, reviewable, removed, **and the plain idle gaps that are invisible today** — so tapping anywhere on the lane (including empty track) selects the period under the finger. This also removes the tiny-target problem: a gap is a full-width-of-itself object.
- **Selecting a period shows an inline action strip** with the single verb valid for that period's state — `Count` for anything not counted (reviewable gap, plain gap, removed span → `add_work`), `Exclude` for anything counted (measured, auto-bridged → `remove_work`), and `Undo`/`Restore` for a manual correction (delete it). No floating popovers. The selected period is outlined on the bar and highlighted in a mirrored segment list.
- **Boundaries are automatic.** A period-driven correction spans exactly that period's start and end — no clock typing for the common case.
- **New "Mark whole day as work" action** fills the gaps of the **office day** in one tap. The envelope runs from the natural start of the first presence period that overlaps the configured office window to the natural end of the last such period; gaps inside it are covered with `add_work`. Pre-work and evening activity neither anchor the envelope nor get filled, and existing `remove_work` exclusions are preserved.
- **Manual time entry is demoted** to the exception path — sub-period precision (a boundary no real period offers), not the primary workflow.
- **Derived periods carry their correction identity** so `Undo`/`Restore` targets the exact correction (a `DELETE /api/corrections/:id`) rather than guessing by span.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities

- `web-ui`: The "Day timeline with edit mode" requirement is rewritten — any period (including plain gaps) is selectable, selection reveals a contextual inline action strip whose verb is derived from the period's state, corrections created from a period use the period's own boundaries, a "Mark whole day as work" action fills the office day, `Undo`/`Restore` remove a correction, and typed time entry is retained only for sub-period precision.
- `manual-corrections`: Gains explicit requirements that (a) corrections split partially-overlapping periods and re-attribute only the affected sub-spans, (b) derived periods carry the identity of the correction that produced them so a single correction can be undone, and (c) a "fill the working day" operation adds work across the office-day gaps while preserving explicit `remove_work` exclusions.
- `worktime-calculation`: The day result gains a **complete selectable partition** (every millisecond attributed to exactly one typed period, plain idle gaps included) and an **office-day envelope** (first/last presence periods overlapping the office window, at their natural boundaries) used by the fill action.

## Impact

- **Code:** `backend/src/worktime/worktime.ts` — `DayResult` gains a partition of typed periods (adding plain gaps) and an office-day envelope; `Correction`/`Span` carry the source correction id. `backend/src/ui/render.ts` — lane gains per-period selection, an inline action strip, a mirrored segment list, and a "Mark whole day as work" button; the add-work/mark-private form is demoted to an "advanced / exact times" control. `backend/src/tenant-do.ts` — `/api/week` payload includes gap periods and per-period correction ids; a `DELETE /api/corrections/:id` route backs Undo/Restore (the `deleteCorrection` DO method already exists).
- **Data/APIs:** no DO schema change (corrections already have ids); the `/api/week` response shape is extended (additive) and one new `DELETE /api/corrections/:id` route is added.
- **Tests:** worktime unit tests for the partition (split attribution, plain-gap emission) and the office-day envelope (belonging by overlap, natural boundaries, evening/pre-work excluded); UI/E2E smoke updated to drive select-a-period + action strip and the whole-day fill instead of the two suggestion buttons.
- **Spec:** deltas in this change update `web-ui`, `manual-corrections`, and `worktime-calculation`.
