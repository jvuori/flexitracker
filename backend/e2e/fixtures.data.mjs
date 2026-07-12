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
];
