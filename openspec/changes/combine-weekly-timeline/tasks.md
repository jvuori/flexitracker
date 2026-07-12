## 1. Timeline lane styling

- [x] 1.1 Add CSS tokens for the ruler (`--tick`, `--tick-strong`, `--tick-faint`, `--idle`) in both light and dark blocks of `CSS` in `render.ts`.
- [x] 1.2 Add a `.track` style that draws the hour/half-hour/quarter-hour ruler via three layered `repeating-linear-gradient`s sized to different heights, plus a `.hours` row style for the 0–24 labels.
- [x] 1.3 Add `.lane` / `.lane-head` grid styles (label | timeline | numbers) that collapse to a stacked `grid-template-areas` layout under a mobile breakpoint (verify ~360px).
- [x] 1.4 Add segment styles reusing the existing provenance colours, a faint `.envelope` (raw-idle) band, a minimum-width rule so brief spans/point markers stay visible, and `.detail` expand/collapse styles.

## 2. Combined week rendering

- [x] 2.1 In `renderWeek`, render the weekly summary strip (worked / weekly norm / lunch deducted / weekly balance) above the lanes.
- [x] 2.2 Render one lane per day: day label, a 0–24h `.track` with the ruler, the day's `spans` (by `provenance`), `reviewableGaps` (review layer), the raw-idle envelope, and the `.hours` label row.
- [x] 2.3 Render each lane's numbers (rounded worked, gross − lunch, daily balance) mirroring the current per-day figures; show "—" balance for non-working days.
- [x] 2.4 Map segment `left`/`width` as percentages of the 24h span; enforce the minimum-width rule from 1.4.

## 3. Inline editing (retire the day route)

- [x] 3.1 Move the `renderDay` content (legend, reviewable-gap "include as work" actions, add-work / mark-private form) into a per-lane `.detail` panel toggled by clicking the lane.
- [x] 3.2 Wire the correction actions to POST `/api/corrections` as today, then re-fetch `/api/week` and re-render lanes, preserving which day is expanded.
- [x] 3.3 Remove the standalone `renderDay` / `renderReload` route and any navigation into it.

## 4. Tests and verification

- [x] 4.1 Update any Worker/DO unit tests and the post-deploy E2E smoke that navigated to the separate day view to instead expand a lane inline for the correction round-trip. (No change needed — the smoke/fixtures drive the JSON `/api` directly and were never coupled to the day route; `/api/corrections` is unchanged.)
- [x] 4.2 Verify locally with the synthetic-activity generator: bridging + corrections in a browser across laptop and mobile widths, light and dark themes (real ingest pipeline, no injected rollups). (Seeded via `tools/seed.mjs`; verified in Playwright — combined lanes, ruler, bridged/reviewable segments, and a full "Include as work" correction round-trip that cleared the gap and updated the numbers in place.)
- [x] 4.3 Confirm out-of-hours, weekend, and cross-midnight fixture days render correctly on the 0–24h scale (nothing clipped). (Thu 20:00–21:15 out-of-hours block renders; Sat/Sun empty lanes render; segment mapping clamps to 0–100% so cross-midnight is not clipped.)
- [x] 4.4 Push to `main`; confirm QA auto-deploy + E2E suite pass before considering PROD (PROD stays manual-only). (Commit `0951bb6` → Deploy QA run `29206172075`: backend + daemon tests, deploy, and e2e all green.)
