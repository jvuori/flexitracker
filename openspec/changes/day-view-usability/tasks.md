## 1. Prerequisites

- [x] 1.1 Confirm `machine-activity-lanes` has archived so `openspec/specs/web-ui/spec.md` carries its version of `Day timeline with edit mode`; if it has not, rebase this change's web-ui delta against whatever version is live
- [x] 1.2 Re-read `CLAUDE.md`'s timeline-alignment pitfall before touching any track geometry — verification is by `getBoundingClientRect()` across tracks, never by eye

## 2. Visual language (CSS)

- [x] 2.1 Replace the six per-type period classes with five treatments on two channels — fill = counts (solid measured / hatched inferred / bare not-counted), accent outline = user-asserted (`manual_added`, `removed`); render `.seg.review` identically to `.seg.gap`
- [x] 2.2 Retire the three near-identical blues: one counted hue, with solid-vs-hatched separating measured from inferred at 14px in both themes; repurpose the freed `--review` amber as the user-assertion accent
- [x] 2.3 Add the office-hours band as a fourth `background-image` layer on `.track`, painted behind the three tick gradients, driven by `--ofs`/`--ofe` custom properties set inline per track; add explicit `background-size`/`repeat`/`position` entries so the existing three layers keep their geometry
- [x] 2.4 Verify the band inherits into `.mlane .track` (which overrides only `height`) and renders in both themes without obscuring segments, ticks, or selection; render it only in the work ledger
- [x] 2.5 Replace `.seg.sel`'s clipped `outline` with an indication that cannot be clipped at any track height: grow the selected segment to full track height plus an inward ring (`outline-offset:-2px`)
- [x] 2.6 Add styles for the receipt table, the uncounted-time footnote, and the three-position classifier segmented control
- [x] 2.7 Remove the `.legend`/`.swatch` rules made dead by the receipt
- [x] 2.8 Mobile (`max-width:640px`): period-list rows to ≥44px touch targets, classifier to a full-width segmented control, receipt table legible at 360px

## 3. Day receipt

- [x] 3.1 Sum the current ledger's partition into per-source component totals (measured, auto-bridged, manual additions) client-side
- [x] 3.2 Render the receipt table — swatch, name, amount per component, then gross, lunch, worked — with a placeholder row for any zero component so the shape is stable
- [x] 3.3 Reduce the receipt in personal mode to measured + manual additions + total, with no auto-bridging and no lunch row
- [x] 3.4 Render the uncounted in-hours footnote (duration, clock range, threshold) only when the day has such time — a statement, never a question, with no action of its own
- [x] 3.5 Link the threshold named in the footnote to the Settings control that governs it
- [x] 3.6 Delete the legend from `buildDetail`

## 4. Numbers and transcription

- [x] 4.1 Drop `round30` from the day lane so the lane shows exact worked time, reconciling with its balance
- [x] 4.2 Verify the day lanes now sum to the weekly summary's worked total
- [x] 4.3 Add the week transcription summary: per-day rounded half-hour values in decimal hours plus the week's rounded total, work ledger only
- [x] 4.4 Add its copy action emitting tab-separated rows plus a total row
- [x] 4.5 Confirm rounding feeds no balance, norm comparison, or stored value

## 5. Classifier replaces the verb set

- [x] 5.1 Implement the classifier's state table from `design.md` — mapping (current period state, target position) to create-or-delete correction calls — replacing `actionsFor`
- [x] 5.2 Keep the `manual_added` → other-ledger special case (delete its `add_work`, then `add_work` on the other ledger), since a plain `remove_work` loses to an `add_work` by specified precedence
- [x] 5.3 Implement `removed` → its own ledger as a deletion of the `remove_work`, not an overriding `add_work`
- [x] 5.4 Implement gap/review → other ledger as a plain `add_work` on that ledger (no spurious `remove_work` on a period that counts nothing)
- [x] 5.5 Mark the current position as selected and non-actionable
- [x] 5.6 Reuse the classifier for raw-lane and freehand selections, with positions gated by the existing overlap rule; never offer a position requiring correction identity for those selections
- [x] 5.7 Retire `renderStrip`/`renderRangeStrip`'s separate verbs and the `Exclude`/`Mark private` divergence between the strip and the Advanced control

## 6. Panel structure

- [x] 6.1 Reorder `buildDetail` to: receipt → footnote → day-scope actions + period list → collapsed raw lanes → collapsed exact-times control
- [x] 6.2 Move the action surface inline to the selected period's row; render nothing while no period is selected
- [x] 6.3 Make timeline selection reveal the classifier at the corresponding list row, so both selection sources converge on one presentation
- [x] 6.4 Move `Mark whole day as work` and the holiday marker together to the period-list header, holiday in an overflow beside the primary action
- [x] 6.5 Wrap the raw per-machine lanes in a disclosure closed by default, regardless of machine count
- [x] 6.6 Apply the terminology table from `design.md` across the timeline, period list, receipt, and exact-times control

## 7. Tests

- [x] 7.1 Confirm the unit suite still passes; `overlapsTypes` and its `client-helpers.test.ts` coverage survive unchanged, since the classifier reuses the same overlap gating
- [x] 7.2 Confirm the post-QA-deploy E2E smoke needs no change — it drives the JSON API (`/corrections`, `/corrections/move`) directly and asserts no rendered label, so the classifier is invisible to it. If any UI-level assertion is found, update it in the same commit; this is the only gate in front of PROD and must never be skipped or weakened
- [x] 7.3 Add unit coverage for the pure helpers this change introduces (receipt component sums, rounded decimal-hours formatting, the classifier's state-table transition mapping), following the existing source-string-plus-eval pattern in `client-helpers.ts`

## 8. Verification

- [x] 8.1 Run the synthetic-activity generator locally and walk every fixture scenario — normal day, auto-bridged gaps, manual add/remove, reviewable meeting, out-of-hours, weekend, multi-machine
- [x] 8.2 Verify the office band's `getBoundingClientRect()` against segment positions on both the merged and a raw lane
- [x] 8.3 Verify at laptop and 360px widths, in light and dark themes
- [x] 8.4 Verify each classifier transition end-to-end against the state table, including the newly-reachable gap → personal from the work ledger
- [x] 8.5 Confirm no badge, count, or prompt appears anywhere for reviewable time
- [x] 8.6 Push to `master`, confirm QA fixtures + E2E pass and the green e2e auto-promotes to PROD

## 9. Revision: reportable value on the lane, transcription pane removed

- [x] 9.1 Remove the week transcription pane (`transcription()`, its `.tsum` styles, and its call site in `renderWeek`)
- [x] 9.2 Replace the lane's `Lunch` figure with the reportable rounded value in decimal hours, labelled, shown only in the work ledger and only when the day has working time
- [x] 9.3 Keep the exact worked time as the lane's dominant figure and the sole basis of the balance
- [x] 9.4 Style the reportable value as subordinate to the exact figure, legible in both themes and at 360px
- [x] 9.5 Drop `transcriptionRows` from the client helpers; keep `round30`/`dec30` for the lane
- [x] 9.6 Update the unit tests: retire the transcription-pane coverage, add coverage that the lane's reportable value and lunch placement follow the revised rules
- [x] 9.7 Verify locally that the lane reconciles (exact − norm = balance), that no rounded weekly aggregate appears, and that lunch reads in the receipt
