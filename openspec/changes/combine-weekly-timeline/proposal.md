## Why

Today the week view and the day timeline are two separate screens: the week is a list of day cards (name + rounded worked + balance), and the only timeline lives behind a click on a dedicated day-detail route, windowed to 6:00–22:00 with no time ruler. The predecessor system showed everything on one page — each day as a full 0–24h lane with an hour/half-hour/quarter ruler and its numbers alongside — which made the week scannable at a glance. We want that combined, at-a-glance view back, modernized to keep our richer provenance colouring and correction workflow.

## What Changes

- **Combine the week list and the day timeline into one page.** Each day becomes an inline "lane": day label, a full-width timeline, and the day's numbers (rounded hours, gross − lunch, daily balance) on the same row.
- **Add a time ruler to every lane:** tall hour ticks, medium half-hour ticks, short quarter-hour ticks, and hour numbers 0–24 — the elements carried over from the old system.
- **Use a full 0–24h window** for the lane instead of the current 6:00–22:00 clip, so out-of-hours, weekend, and midnight-adjacent activity is never hidden.
- **Keep our provenance palette** (measured / auto-bridged / manual / excluded-for-review) plus a faint raw-idle envelope behind segments, instead of the old red/green blocks — so a bridged or excluded minute still visibly shows the underlying gap.
- **Move day editing inline.** Selecting a day expands its lane in place to reveal the legend, reviewable-gap "include as work" actions, and the add-work / mark-private correction form. The standalone day-detail route is **removed**.
- **Enrich the weekly summary** shown above the lanes with the lunch total, alongside worked / norm / balance.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `web-ui`: The "Week view as default" and "Day timeline with edit mode" requirements change — the week view now renders each day's full 0–24h timeline inline with a time ruler and per-day numbers, and day editing happens by expanding the lane in place rather than navigating to a separate day view.

## Impact

- **Code:** `backend/src/ui/render.ts` — `renderWeek` gains inline per-day lanes with the ruler and numbers; `renderDay`'s content becomes an inline expandable panel and the separate day route is retired. Inline CSS gains ruler/lane/expansion styles.
- **Data/APIs:** no backend, schema, or `/api` changes — the existing `/api/week` payload (per-day `spans`, `reviewableGaps`, worked/gross/lunch/balance) already carries everything the combined view needs.
- **Tests:** E2E smoke assertions that navigate to the separate day view must target the inline expansion instead; no worktime-calculation changes.
- **Spec:** `openspec/specs/web-ui/spec.md` requirements updated via the delta in this change.
