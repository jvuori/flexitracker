## Why

The expanded day lane has accumulated every capability we built — provenance, corrections, raw machine lanes, day markers, freehand entry — as seven sibling blocks of equal visual weight, in an order that matches neither the user's reading order nor the scope of each control. The result is a panel that answers *"what can I do here?"* when the user opening a day is almost always asking *"why is this number what it is?"*

That mismatch matters more here than in a typical CRUD screen, because this product's entire value proposition is a **trustworthy number transcribed into an employer's system**. Three things actively undermine that trust today:

- **The visible numbers do not reconcile.** The day head shows `round30(workedMs)` (8h 00m) while the balance beside it is computed from the exact value (+16m) — `8:00 − 7:30 = +30`, not `+16`. And `round30` is applied only to the day headline, never to the week total (`render.ts:365`), so the days on screen do not sum to the week on screen.
- **The rule that governs the whole calculation is invisible.** Bridging is gated on the office-hours window, and that window is drawn nowhere — so "why was this gap counted and that one not?" is unanswerable from the screen.
- **A six-swatch legend sits between the merged lane and the machine lanes**, decoding neither adjacently while visually severing the two tracks that exist precisely to be compared.

The vocabulary compounds it. `Exclude` names a database operation, not a statement about your day. `Move to other side` is a spatial metaphor with no spatial referent on screen. The same `remove_work` primitive is labelled **Exclude** in the action strip (`render.ts:385`) and **Mark private** in the Advanced control (`render.ts:625`). And two of the six period labels both read *"excluded"*, for states that are opposite in agency and opposite in settledness.

## What Changes

**The panel is reordered around the question sequence: answer → receipt → evidence → tools → escape hatches.**

- **A "how this day adds up" receipt replaces the legend.** A small table — swatch, name, amount per row — summing measured + bridged + added into gross, then lunch, then worked. It does three jobs the current panel needs three components for: it explains the number, it defines the colours, and it proves the arithmetic. **The legend is removed.**
- **The day lane's numbers become exact worked · reportable rounded · balance.** The headline is exact, so it reconciles with the balance beside it; the rounded half-hour value rides along as a subordinate figure in decimal hours, labelled as the value to report. **BREAKING** for the `worktime-calculation` presentation requirement, which is restated around the rule that actually matters: every figure standing in an arithmetic relationship to another must share its basis. The reportable value stands in none.
- **The lunch figure vacates the lane** for that slot, and is stated in the receipt between gross and worked — where it reads as a step in the arithmetic rather than a deduction from a quantity the collapsed lane never showed. `Per-day lunch deduction visible` is modified, not dropped.
- **No week-level transcription pane.** Transcription is done a day at a time, so a week pane forces a cross-reference back to the lanes; it was also a fifth block of chrome above the content, and its sum-of-rounded total sat beside the summary's exact total — the exact confusion being designed out. No rounded weekly aggregate is shown anywhere.
- **The office-hours window is drawn as a background band** on every timeline track, collapsed and expanded, merged and raw, making the bridging rule self-documenting.
- **Six period visual classes collapse to five, on two orthogonal channels.** With the band drawn, `review` needs no treatment of its own: it is an uncounted gap sitting inside the office band, reconstructed by band (= in-hours) plus fill (= counts). That is the only merge available — `sensor` and `auto_bridged` must stay distinguishable, because a counted period may never hide the idle it was bridged over. The five are encoded as **fill = counts** (solid measured / hatched inferred / bare not) and an **accent underline = you asserted it** (`manual_added`, `removed`), replacing six unrelated treatments and three near-identical blues. `review` remains a distinct type in the computed partition and the API — this is a rendering and labelling change only.
- **No prompt, no badge, no nag.** A long in-hours break is a *settled* outcome of a rule, not pending business — the rules already classified it, exactly as they classified the short break next to it. The threshold that produced it is surfaced as a factual footnote under the receipt, whose threshold value links into Settings, so a recurring disagreement is fixed at the rule rather than ground out day by day.
- **`Exclude` and `Move to other side` become one classifier.** A selected period presents *"This time was:"* → **Work · Personal · Neither**, showing its current position. This makes the two near-synonymous verbs two positions of one control, mirrors correctly in personal mode, and subsumes `Count as work`. It also newly allows classifying an uncounted gap directly as Personal from the work ledger — an `add_work` on the other ledger, previously unreachable without switching modes.
- **Terminology is unified across every surface**: `auto-bridged` → *short break, counted*; `excluded (review)` and `idle / no activity` → *away*; `excluded (removed)` → *you excluded this*; `measured` → *at the computer*; and the Advanced control's **Mark private** is retired in favour of the same classifier.
- **The action strip stops being a standing component.** It expands inline beneath the selected row in the period list, putting the verb adjacent to the noun and removing a box that is inert whenever nothing is selected.
- **Day-scope actions leave the middle of the panel.** `Mark whole day as work` becomes a primary action on the period-list header; the rarer holiday toggle moves into an overflow menu beside it.
- **Raw per-machine lanes collapse behind a disclosure**, closed by default. This reverses the `machine-activity-lanes` decision to always show them: for the single-machine user — the common case — they duplicate the merged lane and add a second full-width chart to parse. A collapsed heading is an equally consistent shape.
- **The clipped selection ring is fixed.** `.seg.sel` uses `outline`, which paints outside the box, inside a `.track` with `overflow:hidden`; on `.mlane .track` (18px, seg `top:2px;height:14px`) there is no room and the ring is shaved. It becomes an inset ring.
- **Touch targets in the period list reach 44px**, and the classifier becomes a full-width segmented control at narrow widths.

Non-goals: no change to how corrections compose, to the DO schema, to bridging/lunch/norm rules, or to any computed number. Every figure this change displays is already computed today.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `web-ui`: the expanded day lane's composition and ordering; a new day receipt requirement replacing the legend; a new office-window rendering requirement; a new reportable-value-on-the-lane requirement; the per-day lunch deduction moving from the collapsed lane into the receipt; period visual classes reduced to four; the Count/Exclude/Move verb set replaced by a three-position ledger classifier; raw per-machine lanes collapsed by default; the action strip relocated inline to the selected row; day-scope actions relocated; unified terminology.
- `worktime-calculation`: `Transcription-friendly presentation` is restated around the arithmetic-relationship rule — every figure derived from or compared against another is exact, while the rounded half-hour value rides on the day lane as a subordinate output in a contrasting unit form.

## Impact

- **Sequencing:** `machine-activity-lanes` (24/25 tasks) rewrites the same `Day timeline with edit mode` requirement and is expected to archive first; this change's deltas are written against **its** version of that requirement, and it reverses that change's "raw lanes always shown" decision. If the ordering flips, the delta needs rebasing.
- **Web UI:** `backend/src/ui/render.ts` — the day-lane renderer, `buildDetail`, `renderStrip`/`renderRangeStrip`, `actionsFor`/`TYPELABEL`, the `CSS` block (period classes, office band, inset selection ring, mobile rules), plus the new week transcription summary. `backend/src/ui/client-helpers.ts` unchanged.
- **Backend:** none expected. The receipt's component amounts are derivable client-side by summing the existing typed partition; the office band needs `workdayStartMin`/`workdayEndMin`, already returned by `/api/settings` and already fetched by the week view.
- **No change** to the daemon, the `correction` schema, sealed rollups, the ingest path, or any endpoint response shape.
- **Tests:** the post-QA-deploy E2E smoke drives the current action strip by its verb labels (`Count as work` / `Exclude`) and will need updating to the classifier — this is the PROD gate, so it must be updated in lockstep, never weakened.
- **Risk:** this is a large simultaneous change to layout, encoding, and vocabulary on the app's most-used screen. Verification is by eye across laptop + mobile widths and light + dark themes; the timeline-alignment pitfall in `CLAUDE.md` (compare `getBoundingClientRect()` across tracks, never judge by eye) applies to the new office band and any track whose geometry moves.
