## Context

`computeDay` composes flextime as disjoint provenance layers: `sensor`/`auto_bridged`/`manual_added` minus `remove_work`, with `review`/`removed`/`gap` filling the rest into a complete partition; `spans` feed `grossMs`→`workedMs`→`balanceMs`. Corrections are span rows with `kind ∈ {add_work, remove_work}` and an id (undo by id). `PeriodType` is `sensor|auto_bridged|manual_added|review|removed|gap`. Overtime needs a third disposition — worked, but out of flextime and tallied on its own.

## Goals / Non-Goals

**Goals:**
- Any selectable period → overtime; overtime out of flextime worked/gross/lunch/balance; tallied per day and per week.
- Overtime its own period type + color; Mark/Undo actions from the same period-selection model.
- Reuse correction plumbing via a new `overtime` kind (create/delete/undo/audit/dirty-day).

**Non-Goals:**
- No overtime *rate*/pay computation — just the hours, tracked separately.
- No cap, approval workflow, or carry/bank accounting for overtime.
- No change to how add/remove/bridging compute for the non-overtime remainder.

## Decisions

- **`overtime` is a top-priority carve.** In `computeDay`, split corrections into add/remove/overtime. Compute `overtimeSpans = clampAll(overtimeCorr, win)`. Remove overtime from every flextime layer *first*: subtract `overtimeSpans` from `sensor`, `bridged`, `manualAdded`, `removes`-derived `removedSpans`, and `reviewableGaps` before building `spans`/partition. Then the whole `overtimeSpans` becomes `overtime` periods. This realises "overtime overrides add and remove."
- **Separate tally, not a flextime span.** `overtime` periods do NOT enter `spans` (which drive `grossMs`). Add `overtimeMs = totalDuration(overtimeSpans)` to `DayResult`; `WeekResult` gains `weeklyOvertimeMs = Σ days`. `grossMs`/`lunchMs`/`workedMs`/`balanceMs` are computed from flextime `spans` exactly as today, so overtime is automatically excluded from the lunch basis and the balance.
- **Partition stays complete + disjoint.** Add `overtime` to `PeriodType`. Overtime periods are added to `parts`; because overtime was subtracted from all other layers, they don't overlap. The plain-`gap` fill (`subtract([win], partitionCovered)`) then covers whatever remains, including nothing over the overtime spans. The "counted periods sum to gross" invariant is refined: flextime-counted (sensor/auto_bridged/manual_added) sum to `grossMs`; overtime periods sum to `overtimeMs`; disjoint.
- **Assert regardless of activity.** Overtime is tallied over its full span even where no sensor activity existed (like `add_work` asserts), matching "any selectable period, including a gap, can become overtime."
- **UI.** `PeriodType` `overtime` → `.seg.overtime` colour (a saturated accent distinct from the blue work family and the hollow exclusions — e.g. amber/violet). `TYPELABEL.overtime = 'overtime'`. `verbFor`: a non-overtime period additionally offers `{label:'Mark as overtime', act:'overtime'}`; an `overtime` period offers `{label:'Undo overtime', act:'undo'}` (deletes by correction id). The action strip may now show two actions on a counting period (Exclude + Mark as overtime); render both. Day lane shows `overtime +Xh` when `overtimeMs>0`; weekly summary adds an `Overtime` stat when `weeklyOvertimeMs>0`.
- **Correction kind validation** (`tenant-do.ts`/`schema.ts`): accept `overtime`; `/corrections` create takes `{kind:'overtime', start, end}` from the selected period; undo is existing `deleteCorrection(id)` via the period's `correctionIds`.

## Risks / Trade-offs

- **Two actions per period breaks the "single action" assumption.** The existing strip renders exactly one verb; overtime makes counting periods offer two (Exclude, Mark as overtime). The web-ui requirement is modified accordingly; the strip must lay out multiple actions cleanly on mobile.
- **Layer-subtraction ordering.** Overtime must be subtracted from *every* flextime layer, including `removedSpans` and `reviewableGaps`, or an instant could appear both as overtime and as (say) a removed band — breaking the disjoint-partition invariant. Covered by a partition-completeness test with overtime present.
- **Interaction with "Mark whole day as work."** Fill adds `add_work` over office-day gaps; if a gap is already overtime, overtime's top-priority carve wins and the fill's `add_work` over it is inert there. Acceptable and consistent; noted so it isn't read as a fill bug.
- **Invariant/test churn.** Existing partition tests assert counted-sum == gross; they must be updated to exclude overtime from that sum and add an overtime-sum assertion.
