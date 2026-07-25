## Context

The week view is a single Worker-rendered page (`backend/src/ui/render.ts`): inline CSS plus a node-free vanilla-JS client driving the JSON `/api`. Each day is an inline lane (label · 0–24h timeline · numbers) with an in-place expandable `.detail` panel built by `buildDetail`.

That panel now holds seven sibling blocks at equal visual weight — a one-line summary, a six-swatch legend, a permanently-mounted action strip, raw per-machine lanes, two day-scope buttons, the mirrored period list, and the Advanced control — in an order set by the sequence in which features landed rather than by how the screen is read. Every number it shows is already computed: `computeDay` emits a complete typed partition (`sensor`, `auto_bridged`, `manual_added`, `review`, `removed`, `gap`), the office envelope, per-machine raw activity, and correction ids.

So this is a presentation change over an engine that is already right. The constraint that shapes it: this product exists to produce a number someone transcribes into an employer's system, so anything that makes the number look unreliable — two figures that don't reconcile, a rule whose inputs are invisible, a label that means two things — is a defect against the core value, not a polish item.

## Goals / Non-Goals

**Goals:**
- Opening a day answers *"why is this number what it is?"* before it offers *"what can I do here?"*
- Every figure on screen reconciles with every other figure on screen.
- The rules that produced the number are legible from the timeline itself.
- One vocabulary across the action strip, the period list, the receipt, and the Advanced control.
- The editing vocabulary reflects what the time *was*, not what happens to a database row.
- Fluent at 360px and by touch, in both themes.

**Non-Goals:**
- No change to how corrections compose, to bridging/lunch/norm rules, to the DO schema, or to any computed value. No number changes; only which numbers are shown, where, and under what name.
- No new backend endpoint or response field. Everything the redesign shows is derivable from `/api/week` + `/api/settings` as they stand.
- No drag-to-select on the bar (still deferred, as in `direct-timeline-editing`).
- No new UI dependency — vanilla JS + inline CSS.
- No change to the collapsed week lane's *interaction*; its numbers change, its behaviour does not.

## Decisions

### The receipt replaces the legend

The panel opens with a table summing the day's counted components into its worked figure:

```
  HOW THIS DAY ADDS UP
    ▄▄ at the computer        6h 34m      ← Σ sensor
    ▓▓ short breaks, counted  1h 42m      ← Σ auto_bridged
    ░░ you added                  —       ← Σ manual_added
       ─────────────────────────────
       before lunch           8h 16m      ← grossMs
       lunch                  −  30m      ← lunchMs
       worked                 7h 46m      ← workedMs
```

Component rows are summed client-side from the existing partition; `grossMs`/`lunchMs`/`workedMs` come from the server. A row whose component is zero renders as `—` rather than being dropped, so the table's shape is stable across days.

- *Why:* one component does three jobs that currently take three (legend, summary line, and the missing "prove it adds up" surface). Because each row carries its swatch beside its name and amount, the encoding is defined exactly where it is used, and a legend that decodes neither adjacent track becomes unnecessary.
- *Why client-side:* the partition is already in the payload and the counted periods are specified to sum to gross (`worktime-calculation`: "Partition agrees with reported working time"). Summing in the client keeps the change backend-free; if the sums ever disagree with `grossMs`, that is a genuine engine bug and the fail-fast principle says it should be visible, not papered over.
- *Alternative:* server-computed component totals as new response fields. Rejected — a new field for a value already derivable, on a payload we control end to end.

### The reportable value goes in the lane's third slot, not a separate pane

The lane's three-line numbers cell becomes: **exact worked** (dominant) · **`~8.0h`** (subordinate) · **balance**. The lunch figure vacates that slot; the receipt already states it as a step in the arithmetic. There is no week-level transcription pane.

- *Why the exactness rule survives:* the original defect was that the lane's **dominant** figure was rounded while the balance beside it was exact-derived, so `8h 00m … +16m` read as an arithmetic error (`8:00 − 7:30 = +30`). Keeping the headline exact fixes that regardless of what else the cell carries. The precise rule is therefore not "never show rounded beside exact" but *"every figure that stands in an arithmetic relationship to another must share its basis"* — and the reportable value stands in none, because nothing on screen is derived from it.
- *Why not a separate pane:* the transcribe job is done a day at a time, so a week-level pane forces a cross-reference back to the lanes for every value. It was also a fifth block of week chrome above the content (status, mode, nav, summary, pane), against the density this change exists to recover — and its sum-of-rounded total (`37.5`) sat two inches from the summary's exact `37h 11m`, which is the very confusion being designed out.
- *Why decimal hours:* `8.0` / `7.5` is what timesheet systems accept, and the unit-format difference from `7h 46m` is what keeps the two from reading as competing claims about the same quantity. That format contrast is now load-bearing rather than incidental, since the figures share a cell.
- *Rendered `~8.0h`, not `report 8.0`:* the `~` mitigates the one residual risk in this decision rather than merely labelling around it — a user could otherwise compute `8.0 − 7.5 = +30m` and wonder why the balance says `+6m`, and an explicit approximation marker discourages arithmetic on the figure at all. The `h` closes a real gap, since a bare `7.5` carried no unit. The purpose the `report` prefix conveyed moves into the accessible name (`title` + `aria-label`): it repeated identically on all seven lanes while only the value varied, so it did not earn row space, and putting it in the accessible name keeps it available to a screen reader — which would otherwise hear only a tilde.
- *Trade-off:* no rounded weekly total anywhere. Summing five rounded days is left to the reader or to the employer's system. Deliberate: any rounded weekly aggregate would disagree with the summary's exact total, which is exactly the class of contradiction this change removes.
- *Cost:* the TSV copy action goes with the pane. It served the same job, but it was speculative — no clipboard workflow was ever established — and reintroducing it needs a home that is not a week-level pane.

### Lunch moves out of the lane and into the receipt

- *Why:* the collapsed lane shows neither gross nor worked-before-lunch, so a bare `Lunch 30m` there names a deduction from a quantity the user cannot see. In the receipt it sits between gross and worked, where it reads as the step it is. The `Per-day lunch deduction visible` requirement is modified accordingly — its intent (the user can see why worked is below gross) is better served, not dropped.

### The office window is a background of the track, not an overlay element

Each `.track` gets two inline custom properties (`--ofs`, `--ofe`, the window bounds as percentages of the day) and the static CSS appends a fourth `background-image` layer, painted behind the three existing tick gradients.

- *Why an inline gradient rather than a positioned child:* `CLAUDE.md` records this exact failure mode twice — a timeline-scale element that positions correctly within its own scale but renders at a different width from the track it must align with. A background on the *same element as the segments* cannot drift from them by construction. It also inherits automatically into `.mlane .track` (which overrides only `height`), so raw lanes get the band for free.
- *Why it matters:* bridging is gated on this window and the window is currently drawn nowhere, so the single most consequential rule in the system has invisible inputs.

### Six visual classes collapse to five, on two orthogonal channels

With the band drawn, `review` is fully reconstructed by two channels already on screen:

```
                        inside office band        outside band
                    ┌────────────────────────┬──────────────────┐
   filled (counts)  │ auto_bridged           │  — (never)       │
   bare (doesn't)   │ `review`  → "away"     │ `gap` → "away"   │
                    └────────────────────────┴──────────────────┘
```

`review` is simply an uncounted gap that sits inside the band, so it needs no treatment of its own. **That is the only merge available.** An earlier draft of this design also merged `sensor` with `auto_bridged` to reach four classes; that is forbidden by a requirement this change keeps — *"the timeline SHALL also show raw idle/off-computer periods as a distinct layer even when they have been auto-bridged"* — and by `CLAUDE.md`'s "never hide *why* a minute counts". `manual_added` and `removed` must likewise stay visible, since an edit you cannot see is an edit you cannot undo.

So the real fix is not fewer classes but *principled* ones. Five treatments encoded on two independent channels, rather than six unrelated ones:

| | rules produced it | you asserted it |
|---|---|---|
| **counts** | `sensor` solid · `auto_bridged` hatched | `manual_added` solid + accent outline |
| **doesn't count** | `gap` / `review` bare track | `removed` bare + accent outline |

- **Fill** carries counting: solid or hatched = counts, bare = does not.
- **Texture** separates measured from inferred within the counted half: solid = *measured*, hatched = *inferred*. This replaces three near-identical blues with one hue on a texture channel.
- **Accent outline** carries authorship: an outline means *you did this*, on both halves.
- *Why the accent needs no new colour:* `--review`'s amber is freed by this change and is repurposed as the user-assertion accent, high-contrast against the counted blue in both themes.
- *Scope:* rendering and labelling only. `review` remains a distinct type in `computeDay`, in `DayResult`, and in `/api/week` — `worktime-calculation`'s partition requirements are untouched.

### The band is work-ledger only

The personal ledger applies no office-hours gating, so a band there would advertise a rule that does not run — and `web-ui`'s "Personal mode suppresses work-only chrome" already establishes the pattern. The band renders only while the work ledger is selected.

### Explain, never ask

A long in-hours break is a *settled* outcome of a rule, symmetric with the short break beside it — `worktime-calculation` specifies both defaults as equally overridable. Nothing prompts, badges, or asks. When a day contains uncounted in-hours time, one muted line sits under the receipt:

```
    2h 11m away 11:00–13:11 — not counted, over your 2h break limit
                                                    ▲ links to Settings
```

- *Why:* the rules are the product; corrections are the exception path. A prompt implies the rules are provisional, which corrodes exactly the trust this app exists to produce. Calling the type `review` and labelling it `excluded (review)` invented a pending-business state the rules never had.
- *Why the threshold links to Settings:* a user overriding the same rule every week has a settings problem, not a workflow. Linking the threshold points at the durable fix instead of the per-day grind, without nagging.

### `Exclude` + `Move to other side` + `Count as work` become one three-position classifier

A selected period shows *"This time was:"* with **Work · Personal · Neither**, the current position marked and inert. Each cell maps to existing API calls:

| current state (viewing ledger L, other O) | → L | → O | → Neither |
|---|---|---|---|
| counts, `sensor` / `auto_bridged` | *(current)* | `POST /corrections/move` (atomic remove+add) | `remove_work` on L |
| counts, `manual_added` | *(current)* | delete its `add_work`, then `add_work` on O | delete its `add_work` |
| not counting, `gap` / `review` | `add_work` on L | `add_work` on O | *(current)* |
| not counting, `removed` | delete its `remove_work` | `add_work` on O | *(current)* |

- *Why:* `Exclude` and `Move to other side` are near-synonyms to a user (for the work number they are identical), so presenting them as sibling verbs forces a distinction the user cannot make. As two positions of one control the distinction becomes structural and self-evident: *Neither* means it counts nowhere, *Personal* means it counts there.
- *Why undo/restore disappear as named verbs:* the classifier expresses a desired end state and the client picks the primitive — sometimes creating a correction, sometimes deleting one. "Undo addition" is exactly "this time was Neither" for a `manual_added` period, and "Restore as work" is exactly "this time was Work" for a `removed` one. The row's own label still says *you added this* / *you excluded this*, so the user can see it is their own edit they are moving.
- *Why `manual_added` → O keeps its special case:* a plain `remove_work` loses to an `add_work` in the same ledger by specified precedence, so the existing delete-then-re-add path (`render.ts:482`) is still required. This preserves the accepted asymmetry documented in `machine-activity-lanes`.
- *New capability, deliberately:* an uncounted gap can now be classified `Personal` directly from the work ledger — an `add_work` on the other ledger, previously reachable only by switching modes. It falls out of the control's symmetry rather than being designed in.
- *Alternative:* keep three verbs, rename them. Rejected — renaming `Exclude` does not stop it and `Move` from being confusable, because the confusion is structural.

### The action strip moves inline to the selected row

It is no longer a standing component; it expands beneath the selected row in the period list.

- *Why:* the current strip is mounted whenever a day is open and inert whenever nothing is selected, spending prime space on a hint. Expanding at the row puts the verb adjacent to the noun it acts on instead of ~200px above it.
- *Constraint honoured:* `web-ui` requires "an inline action strip (not a floating overlay)". A row-anchored disclosure is inline; the rejection in `direct-timeline-editing` was of *popovers anchored to 2px segments*, which this is not.
- *Selection from the timeline* scrolls/expands the corresponding row, so both selection sources converge on one presentation.

### Raw per-machine lanes collapse behind a disclosure

Closed by default, under *"What each computer recorded"*.

- *Why:* for the single-machine user — the common case — a raw lane duplicates the merged lane and adds a second full-width chart to parse, directly against the density this change is trying to recover.
- *Reverses:* `machine-activity-lanes`' "always shown, even when only one machine was active, for a consistent shape regardless of day content." The shape argument is preserved — a collapsed heading is equally consistent — while the redundancy is not paid on every day.
- *Alternative:* auto-open for 2+ machines. Rejected — makes the panel's shape vary by day, which is the property that decision was protecting.

### Selection is shown by growth plus an inward ring

`.seg.sel` grows to the full track height and takes `outline-offset:-2px` so the ring paints inside its own box.

- *Why:* today's `outline` paints outside the box inside a `.track{overflow:hidden}`; on `.mlane .track` (18px, seg `top:2px;height:14px`) there is no slack and the ring is shaved — the reported "cuts pixels from the bottom". An inward ring cannot be clipped at any track height.
- *Why growth as well:* an inward ring is invisible on a segment near `min-width`, whereas vertical growth is legible at any width and needs no room outside the box.

### Terminology

| now | becomes |
|---|---|
| `measured` | at the computer |
| `auto-bridged` | short break, counted |
| `added by you` | you added this |
| `excluded (review)` | away |
| `idle / no activity` | away |
| `excluded (removed)` | you excluded this |
| `Exclude` / `Mark private` | *Neither* (classifier position) |
| `Move to other side` | *Personal* / *Work* (classifier position) |
| `Count as work` | *Work* (classifier position) |
| `Undo addition` / `Restore as work` | *(subsumed by the classifier)* |
| `Total` (panel) | before lunch |

The Advanced control keeps its exact-times inputs and adopts the same classifier, retiring the **Exclude**/**Mark private** divergence between `render.ts:385` and `render.ts:625`.

## Risks / Trade-offs

- **Large simultaneous change to layout, encoding, and vocabulary on the most-used screen** → land it behind no flag but verify against the synthetic-activity generator across every fixture scenario (normal day, bridged gaps, manual add/remove, reviewable meeting, out-of-hours, weekend, multi-machine) at laptop and 360px, light and dark, before pushing.
- **Losing the `review`/`gap` visual distinction could hide why an in-hours break did not count** → the receipt footnote states it in words with its threshold, which is more informative than a hatch pattern was; and the office band makes the in-hours/out-of-hours difference visible where the hatch was carrying it implicitly.
- **The classifier makes a destructive-ish action (delete a correction) reachable from an ordinary-looking control** → the row label always names your own edits (*you added this* / *you excluded this*), so the classifier never silently discards a correction the user did not know existed. A follow-up undo affordance is out of scope here (see Open Questions).
- **Office band geometry drifting from segment geometry** → structurally impossible as designed (same element), but `CLAUDE.md`'s rule stands: verify by comparing `getBoundingClientRect()` across tracks, never by eye.
- **E2E smoke drives the current verb labels** (`Count as work`, `Exclude`) and this is the only gate in front of PROD → update it in the same commit as the renderer; never skip or weaken a failing check to get the deploy through.
- **Reordering breaks muscle memory** for the one user who has been using the current panel daily → accepted; the current order was not designed, and the change is a net reduction in what must be learned.

## Migration Plan

1. Rebase check: confirm `machine-activity-lanes` has archived, so the `Day timeline with edit mode` delta applies to its version of the requirement.
2. CSS: office band layer + `--ofs`/`--ofe`, four period classes, inward selection ring + growth, receipt table, classifier segmented control, mobile rules (44px rows, full-width classifier).
3. Client: rewrite `buildDetail` into ordered sections (receipt → footnote → period list with inline classifier → collapsed raw lanes → collapsed Advanced); replace `actionsFor`/`TYPELABEL`/`renderStrip`/`renderRangeStrip` with the classifier and its state table; drop `round30` from the lane; add the week transcription summary + copy.
4. Update the Worker/DO unit tests that assert rendered labels, and the post-deploy E2E smoke's action-strip interactions.
5. Verify locally via the synthetic-activity generator across every fixture scenario, both widths, both themes; measure `getBoundingClientRect()` on the band against the segments.
6. Push to `master` → QA auto-deploys, fixtures + E2E run, and a green e2e auto-promotes the same commit to PROD.
- *Rollback:* pure renderer change with no data or schema effect — revert the commit.

## Open Questions

- **Should an undo affordance ship with this?** Every action is a single correction row and `DELETE /api/corrections/:id` exists, but today a correction silently re-renders the week with the selection dropped — no confirmation, no diff, no way back except finding the period again. A `−54m · Undo` toast would change how confidently people edit. Currently scoped out; worth its own change.
- ~~**Does the transcription summary belong to the week view or its own surface?**~~ **Resolved: neither.** The pane was cut and the rounded value moved into the day lane's third slot, displacing the lunch figure. A week-level pane forced a cross-reference back to the lanes for a job done a day at a time, and its sum-of-rounded total sat beside the summary's exact total. See *The reportable value goes in the lane's third slot*.
- **What does the receipt show in personal mode?** Reduced to `at the computer` + `you added` = total, since bridging, lunch, and the office window do not exist there. Assumed; confirm against the reduced-composition requirement during implementation.
- ~~**Should the exact/rounded pairing survive anywhere per-day?**~~ **Resolved: yes, on the lane itself** — exact dominant, rounded subordinate, in contrasting unit forms. The `worktime-calculation` requirement is restated around the arithmetic-relationship rule rather than a blanket ban on showing the two together.
- **Does the copy affordance deserve a home?** Removed with the transcription pane. If a clipboard workflow turns out to matter, it needs somewhere that is not a week-level block — a per-lane copy, or an action in the week summary.
