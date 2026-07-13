// Scenario fixtures for QA/local. Dates are RELATIVE (offset 0 = this week,
// -1 = last week, …) so the same data re-materializes every run. Each block is
// [machine, start, end]; expected values are hand-specified (minutes) and act as
// the regression oracle for the deployed calculation.
//
// Defaults in force after a reset: workday 08–16, daily norm 450m, weekly norm
// 2250m, lunch 30m when a day exceeds 360m, private-leave threshold 2h,
// working days Mon–Fri, timezone UTC.

export const MACHINES = ["Laptop", "Desktop"];

// wd: 0=Mon..6=Sun. m: machine index. s/e: [hour, minute].
// ed (optional): end weekday, for a single effort that runs past midnight — the
// calculation splits it at the day boundary (00:00) into two per-day periods.
export const WEEKS = [
  {
    offset: 0,
    label: "this week",
    weeklyWorked: 2010,
    weeklyBalance: -240,
    days: [
      {
        wd: 0,
        label: "normal 08–16, lunch gap bridged + deducted, two machines",
        blocks: [
          { m: 0, s: [8, 0], e: [11, 30] },
          { m: 1, s: [12, 0], e: [16, 0] },
        ],
        corrections: [],
        expect: { worked: 450, balance: 0, reviewable: 0 },
      },
      {
        wd: 1,
        label: "09:00–17:30 with coffee gaps auto-bridged",
        blocks: [
          { m: 0, s: [9, 0], e: [10, 45] },
          { m: 0, s: [11, 0], e: [13, 0] },
          { m: 0, s: [13, 30], e: [17, 30] },
        ],
        corrections: [],
        expect: { worked: 480, balance: 30, reviewable: 0 },
      },
      {
        wd: 2,
        label: "long midday meeting gap included manually (add_work)",
        blocks: [
          { m: 0, s: [8, 0], e: [10, 0] },
          { m: 1, s: [13, 0], e: [16, 0] },
        ],
        corrections: [{ kind: "add_work", s: [10, 0], e: [13, 0] }],
        expect: { worked: 450, balance: 0, reviewable: 0, manualAdded: true },
      },
      {
        wd: 3,
        label: "private usage removed (remove_work)",
        blocks: [{ m: 0, s: [8, 0], e: [16, 0] }],
        corrections: [{ kind: "remove_work", s: [14, 0], e: [15, 0] }],
        expect: { worked: 390, balance: -60, reviewable: 0 },
      },
      {
        wd: 4,
        label: "half day",
        blocks: [{ m: 0, s: [8, 0], e: [12, 0] }],
        corrections: [],
        expect: { worked: 240, balance: -210, reviewable: 0 },
      },
    ],
  },
  {
    offset: -1,
    label: "last week",
    weeklyWorked: 1590,
    weeklyBalance: -660,
    days: [
      {
        wd: 0,
        label: "standard 08–16",
        blocks: [{ m: 0, s: [8, 0], e: [16, 0] }],
        corrections: [],
        expect: { worked: 450, balance: 0, reviewable: 0 },
      },
      {
        wd: 1,
        label: "evening-only extra work (out-of-hours, counted)",
        blocks: [{ m: 0, s: [18, 0], e: [21, 0] }],
        corrections: [],
        expect: { worked: 180, balance: -270, reviewable: 0 },
      },
      {
        wd: 2,
        label: "uncorrected long gap stays reviewable, not counted",
        blocks: [
          { m: 0, s: [8, 0], e: [11, 0] },
          { m: 1, s: [13, 30], e: [16, 0] },
        ],
        corrections: [],
        expect: { worked: 330, balance: -120, reviewable: 1 },
      },
      {
        wd: 3,
        label: "several short gaps, all bridged",
        blocks: [
          { m: 0, s: [8, 0], e: [10, 0] },
          { m: 0, s: [10, 30], e: [12, 0] },
          { m: 0, s: [12, 30], e: [16, 0] },
        ],
        corrections: [],
        expect: { worked: 450, balance: 0, reviewable: 0 },
      },
      {
        wd: 4,
        label: "day off",
        blocks: [],
        corrections: [],
        expect: { worked: 0, balance: -450, reviewable: 0 },
      },
      {
        wd: 5,
        label: "weekend activity (counted, no norm)",
        blocks: [{ m: 0, s: [10, 0], e: [13, 0] }],
        corrections: [],
        expect: { worked: 180, balance: 180, reviewable: 0 },
      },
    ],
  },
  {
    offset: -2,
    label: "two weeks ago",
    weeklyWorked: 930,
    weeklyBalance: -1320,
    days: [
      {
        wd: 0,
        label: "standard 08–16",
        blocks: [{ m: 0, s: [8, 0], e: [16, 0] }],
        corrections: [],
        expect: { worked: 450, balance: 0, reviewable: 0 },
      },
      {
        wd: 1,
        label: "slightly long day 08:00–16:30",
        blocks: [{ m: 0, s: [8, 0], e: [16, 30] }],
        corrections: [],
        expect: { worked: 480, balance: 30, reviewable: 0 },
      },
    ],
  },
  {
    offset: -3,
    label: "three weeks ago — realistic variation, out-of-hours & cross-midnight",
    weeklyWorked: 2342,
    weeklyBalance: 92,
    days: [
      {
        wd: 0,
        // Natural arrival/breaks — nobody starts at 08:00:00. All in-hours gaps
        // are short and auto-bridged, so the whole day counts continuously.
        label: "realistic day 08:07–16:18, coffee + lunch gaps bridged",
        blocks: [
          { m: 0, s: [8, 7], e: [10, 12] },
          { m: 0, s: [10, 29], e: [12, 3] },
          { m: 0, s: [12, 41], e: [16, 18] },
        ],
        corrections: [],
        // gross 491 (08:07–16:18, gaps bridged) − 30 lunch = 461.
        expect: { worked: 461, balance: 11, reviewable: 0 },
      },
      {
        wd: 1,
        label: "early bird 07:48 + evening out-of-hours session",
        blocks: [
          { m: 0, s: [7, 48], e: [12, 15] },
          { m: 0, s: [12, 52], e: [15, 30] },
          { m: 0, s: [19, 40], e: [21, 5] },
        ],
        corrections: [],
        // day 07:48–15:30 bridged = 462, evening 85 (counted, not bridged); −30 lunch.
        expect: { worked: 517, balance: 67, reviewable: 0 },
      },
      {
        wd: 2,
        label: "normal day + late session running past midnight into Thu",
        blocks: [
          { m: 0, s: [8, 5], e: [16, 10] },
          { m: 0, s: [22, 40], e: [0, 50], ed: 3 }, // → Thu 00:50; Wed keeps 22:40–24:00
        ],
        corrections: [],
        // 485 (day) + 80 (22:40–24:00) = 565 gross; −30 lunch.
        expect: { worked: 535, balance: 85, reviewable: 0 },
      },
      {
        wd: 3,
        label: "midnight tail 00:00–00:50 (from Wed) + normal day",
        blocks: [{ m: 0, s: [8, 20], e: [16, 0] }],
        corrections: [],
        // 50 (tail) + 460 (day) = 510 gross; −30 lunch.
        expect: { worked: 480, balance: 30, reviewable: 0 },
      },
      {
        wd: 4,
        label: "short day + late session running past midnight into Sat",
        blocks: [
          { m: 0, s: [8, 33], e: [12, 7] },
          { m: 0, s: [23, 15], e: [1, 30], ed: 5 }, // → Sat 01:30; Fri keeps 23:15–24:00
        ],
        corrections: [],
        // 214 (morning) + 45 (23:15–24:00) = 259 gross; ≤ 360 so no lunch.
        expect: { worked: 259, balance: -191, reviewable: 0 },
      },
      {
        wd: 5,
        label: "weekend midnight tail 00:00–01:30 (from Fri), no norm",
        blocks: [],
        corrections: [],
        // 90 gross; Saturday is a non-working day so norm 0 → balance +90.
        expect: { worked: 90, balance: 90, reviewable: 0 },
      },
    ],
  },
];
