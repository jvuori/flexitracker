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
        label: "normal day 08:04–16:11, lunch gap bridged + deducted, two machines",
        blocks: [
          { m: 0, s: [8, 4], e: [11, 28] },
          { m: 1, s: [12, 6], e: [16, 11] },
        ],
        corrections: [],
        // gap 11:28–12:06 (38m, in-hours) bridged → gross 08:04–16:11 = 487; −30 lunch.
        expect: { worked: 457, balance: 7, reviewable: 0 },
      },
      {
        wd: 1,
        label: "09:03–17:33 with coffee gaps auto-bridged",
        blocks: [
          { m: 0, s: [9, 3], e: [10, 49] },
          { m: 0, s: [11, 4], e: [13, 2] },
          { m: 0, s: [13, 37], e: [17, 33] },
        ],
        corrections: [],
        // two short in-hours gaps (15m, 35m) bridged → gross 09:03–17:33 = 510; −30 lunch.
        expect: { worked: 480, balance: 30, reviewable: 0 },
      },
      {
        wd: 2,
        label: "long midday meeting gap included manually (add_work)",
        blocks: [
          { m: 0, s: [8, 6], e: [10, 3] },
          { m: 1, s: [13, 4], e: [16, 8] },
        ],
        corrections: [{ kind: "add_work", s: [10, 3], e: [13, 4] }],
        // add_work fills the 10:03–13:04 gap → gross 08:06–16:08 = 482; −30 lunch.
        expect: { worked: 452, balance: 2, reviewable: 0, manualAdded: true },
      },
      {
        wd: 3,
        label: "private usage removed (remove_work)",
        blocks: [{ m: 0, s: [8, 2], e: [16, 4] }],
        corrections: [{ kind: "remove_work", s: [14, 6], e: [15, 9] }],
        // 08:02–16:04 = 482 minus removed 14:06–15:09 (63m) = 419; −30 lunch.
        expect: { worked: 389, balance: -61, reviewable: 0 },
      },
      {
        wd: 4,
        label: "half day 08:11–12:03",
        blocks: [{ m: 0, s: [8, 11], e: [12, 3] }],
        corrections: [],
        // 232m gross, ≤ 360 so no lunch.
        expect: { worked: 232, balance: -218, reviewable: 0 },
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
        label: "standard day 08:03–16:07",
        blocks: [{ m: 0, s: [8, 3], e: [16, 7] }],
        corrections: [],
        // 484m gross; −30 lunch.
        expect: { worked: 454, balance: 4, reviewable: 0 },
      },
      {
        wd: 1,
        label: "evening-only extra work 18:09–21:04 (out-of-hours, counted)",
        blocks: [{ m: 0, s: [18, 9], e: [21, 4] }],
        corrections: [],
        // 175m out-of-hours, counted as-is; ≤ 360 so no lunch.
        expect: { worked: 175, balance: -275, reviewable: 0 },
      },
      {
        wd: 2,
        label: "uncorrected long gap stays reviewable, not counted",
        blocks: [
          { m: 0, s: [8, 6], e: [11, 4] },
          { m: 1, s: [13, 26], e: [16, 2] },
        ],
        corrections: [],
        // gap 11:04–13:26 (142m ≥ 2h, in-hours) reviewable, not counted:
        // 178 + 156 = 334m; ≤ 360 so no lunch.
        expect: { worked: 334, balance: -116, reviewable: 1 },
      },
      {
        wd: 3,
        label: "several short gaps 08:04–16:06, all bridged",
        blocks: [
          { m: 0, s: [8, 4], e: [10, 7] },
          { m: 0, s: [10, 33], e: [12, 4] },
          { m: 0, s: [12, 29], e: [16, 6] },
        ],
        corrections: [],
        // two short in-hours gaps (26m, 25m) bridged → gross 08:04–16:06 = 482; −30 lunch.
        expect: { worked: 452, balance: 2, reviewable: 0 },
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
        label: "weekend activity 10:12–13:07 (counted, no norm)",
        blocks: [{ m: 0, s: [10, 12], e: [13, 7] }],
        corrections: [],
        // 175m; Saturday is a non-working day so norm 0 → balance +175.
        expect: { worked: 175, balance: 175, reviewable: 0 },
      },
    ],
  },
  {
    offset: -2,
    label: "two weeks ago",
    weeklyWorked: 1345,
    weeklyBalance: -905,
    days: [
      {
        wd: 0,
        label: "standard day 08:05–16:09",
        blocks: [{ m: 0, s: [8, 5], e: [16, 9] }],
        corrections: [],
        // 484m gross; −30 lunch.
        expect: { worked: 454, balance: 4, reviewable: 0 },
      },
      {
        wd: 1,
        label: "slightly long day 08:06–16:42",
        blocks: [{ m: 0, s: [8, 6], e: [16, 42] }],
        corrections: [],
        // 516m gross; −30 lunch.
        expect: { worked: 486, balance: 36, reviewable: 0 },
      },
      {
        wd: 2,
        label: "machine went quiet mid-span (abrupt shutdown, no idle ever sent)",
        // `hb`: active + heartbeats to 16:00, then nothing. The span has no
        // closing event, so its end is INFERRED at the last heartbeat plus the
        // grace (3 × 5 min) rather than running to whenever the week is viewed.
        blocks: [{ m: 0, s: [9, 0], e: [16, 0], hb: true }],
        corrections: [],
        // 09:00 → 16:15 = 435m gross; > 6h so −30 lunch → 405 worked; norm 450.
        expect: { worked: 405, balance: -45, reviewable: 0 },
      },
      {
        wd: 3,
        label: "day after the quiet machine — must be empty, not filled by the open span",
        // The regression that would hurt most if it returned: before the bound,
        // Wednesday's unclosed span ran to `now`, filling Thursday completely
        // (and every day after it). Asserting zero here is the whole point.
        blocks: [],
        corrections: [],
        expect: { worked: 0, balance: -450, reviewable: 0 },
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
