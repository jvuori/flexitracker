## Context

The web UI is a single self-contained page rendered by the Worker (`backend/src/ui/render.ts`): inline CSS plus a vanilla-JS client that drives the JSON `/api`. It is deliberately node-free (no build step) and must stay responsive and legible on laptop and mobile, per the `web-ui` spec and CLAUDE.md quality bars.

Currently `renderWeek` draws a list of day cards and `renderDay` is a separate route with the only timeline (windowed 6:00–22:00, no ruler). This change fuses them: the week becomes one page of inline day lanes, each with a full 0–24h timeline, a tick ruler, per-day numbers, and an in-place edit expansion. A live mockup of the target look-and-feel was reviewed and approved before this proposal.

No backend change is needed: `/api/week` already returns, per day, `spans` (with `provenance`), `reviewableGaps`, and `workedMs`/`grossMs`/`lunchMs`/`balanceMs`.

## Goals / Non-Goals

**Goals:**
- One combined weekly page: timeline + numbers per day, weekly summary on top.
- A CSS-drawn ruler (hour / half-hour / quarter-hour ticks + 0–24 hour numbers), no JS geometry, no webfont.
- Fixed 0–24h scale so out-of-hours/weekend activity is never clipped.
- Keep the existing provenance palette and add a faint raw-idle underlay so bridged/excluded minutes still show the gap.
- Editing (reviewable-gap include, add-work / mark-private) happens by expanding a day lane in place; retire the standalone day route.

**Non-Goals:**
- No changes to worktime calculation, the correction model, `/api` payloads, or the DO schema.
- No drag-to-select on the timeline; the existing time-input correction form is retained (a drag interaction can be a later change).
- No new charting/UI dependency — stays vanilla JS + inline CSS.

## Decisions

### Ruler via layered CSS gradients, not SVG or JS
Draw three `repeating-linear-gradient` layers on the timeline track background — periods `100%/24`, `100%/48`, `100%/96` — sized to different heights (tall/medium/short) and anchored to the bottom, so hour ticks read strongest. Hour numbers are a separate flex row of 25 labels (`justify-content:space-between`).
- *Why:* zero DOM overhead per tick (96 quarter ticks would be 96 nodes otherwise), no webfont, scales fluidly with the responsive width, trivially theme-aware through CSS variables.
- *Alternatives:* an inline SVG ruler (more markup, must recompute on resize) or JS-generated tick divs (heavier DOM, same visual result). Rejected for weight.

### Fixed 0–24h window (approved)
The lane always maps `dayStart..dayStart+24h` to `0..100%`. Segment `left`/`width` are simple percentages of the 24h span.
- *Why:* the current 6–22 clip hides fixture scenarios (out-of-hours, weekend, cross-midnight). CLAUDE.md: never hide why a minute counts.
- *Trade-off:* the 9–17 workday is visually denser than in a 6–22 view. Accepted; the ruler keeps it readable, and this matches the predecessor the user wants back.

### Inline accordion, day route removed (approved)
The per-day content from `renderDay` (legend, reviewable-gap actions, correction form) moves into a `.detail` panel inside each lane, toggled by clicking the lane. `renderDay`/`renderReload` as a separate view are removed; a reload after a correction re-fetches `/api/week` and re-renders the lanes, preserving the open day.
- *Why:* this is the core "combine the two views" goal; one page, one data fetch.
- *Alternatives:* keep the separate route (rejected — defeats the goal); a modal dialog (rejected — worse on mobile, hides the week context).

### Keep the provenance palette + raw-idle envelope
Reuse existing tokens (`--sensor`, `--bridged`, `--manual`, `--review`) for segments; draw a faint `--idle` band spanning each work envelope behind the segments so auto-bridged/excluded gaps remain visible. Auto-bridged uses a hatched fill so it reads as "filled in" even at a glance.
- *Why:* strictly more honest than the old red/green, and already satisfies the "raw idle as a distinct layer" spec requirement.

## Risks / Trade-offs

- **Dense 0–24h lane on small screens** → on narrow widths the lane stacks below the label/numbers (grid `grid-template-areas`) and spans full width; quarter ticks may visually merge but hour ticks + numbers stay legible. Verify at ~360px.
- **Segment/tick visual collision** → segments sit in the upper band of the track (top-aligned, fixed height) while ticks rise from the bottom, so they occupy different bands and don't overlap ambiguously.
- **E2E depends on the day route** → the post-deploy smoke navigates to a day to exercise the correction round-trip. It must be updated to expand a lane inline instead. Caught by the QA E2E gate before PROD.
- **Very short spans/point markers invisible** → sub-pixel spans on a 24h scale can vanish; render a minimum-width segment (and point markers as small dots) so brief activity is still perceptible.

## Migration Plan

1. Land the renderer change (CSS + `renderWeek`/lane markup + inline expansion; remove `renderDay` route) in `backend/src/ui/render.ts`.
2. Update any Worker/DO unit tests and the E2E smoke that referenced the separate day view to drive the inline expansion.
3. Verify locally via the synthetic-activity generator (bridging + corrections in a browser, laptop + mobile widths, light + dark).
4. Push to `main` → QA auto-deploys and the E2E suite runs; PROD is gated on it and remains manual-only.
- *Rollback:* revert the single renderer commit; there is no data or schema change, so rollback is code-only.

## Open Questions

- **Point-marker semantics:** what a small dot on the lane represents in real data (e.g. sub-threshold blips vs. heartbeats). To confirm against actual `/api/week` output during implementation; if there is no distinct marker concept yet, omit markers rather than invent one.
- **Sticky weekly summary:** whether the top summary strip should stick on scroll for long weeks. Default: non-sticky for now; revisit if the page feels long on mobile.
