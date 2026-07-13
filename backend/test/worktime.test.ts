import { describe, expect, it } from "vitest";
import type { Period, PeriodType, Span } from "../src/worktime/interval";
import { duration } from "../src/worktime/interval";
import { DEFAULT_SETTINGS } from "../src/worktime/settings";
import type { Settings } from "../src/worktime/settings";
import { computeDay, computeWeek, pairSpans, roundToStep } from "../src/worktime/worktime";
import type { Correction, RawEvent } from "../src/worktime/worktime";

const H = 3600_000;
const MIN = 60_000;
const day = Date.UTC(2024, 5, 3); // Monday
const at = (h: number, m = 0) => day + h * H + m * MIN;
const S: Settings = { ...DEFAULT_SETTINGS, timezone: "UTC" };

const active = (h1: number, m1: number, h2: number, m2: number) => ({
  start: at(h1, m1),
  end: at(h2, m2),
});
function provMs(spans: Span[], p: Span["provenance"]): number {
  return spans.filter((s) => s.provenance === p).reduce((n, s) => n + (s.end - s.start), 0);
}

describe("pairSpans", () => {
  const ev = (machine_id: string, h: number, kind: RawEvent["kind"]): RawEvent => ({
    machine_id,
    ts: at(h),
    kind,
  });
  it("pairs active→idle transitions", () => {
    const spans = pairSpans(
      [ev("m1", 8, "active"), ev("m1", 10, "idle"), ev("m1", 11, "active"), ev("m1", 12, "idle")],
      at(23),
    );
    expect(spans).toEqual([active(8, 0, 10, 0), active(11, 0, 12, 0)]);
  });
  it("unions across machines", () => {
    const spans = pairSpans(
      [ev("m1", 8, "active"), ev("m1", 12, "idle"), ev("m2", 11, "active"), ev("m2", 13, "idle")],
      at(23),
    );
    expect(spans).toEqual([active(8, 0, 13, 0)]);
  });
  it("closes an orphan open span at checkTime", () => {
    expect(pairSpans([ev("m1", 8, "active")], at(12))).toEqual([active(8, 0, 12, 0)]);
  });
});

describe("computeDay bridging", () => {
  it("bridges a short in-hours gap and tags provenance", () => {
    const d = computeDay([active(8, 0, 10, 0), active(10, 20, 12, 0)], [], day, S, 0);
    expect(d.grossMs).toBe(4 * H);
    expect(provMs(d.spans, "auto_bridged")).toBe(20 * MIN);
    expect(provMs(d.spans, "sensor")).toBe(4 * H - 20 * MIN);
    expect(d.reviewableGaps).toHaveLength(0);
  });

  it("excludes a long in-hours gap as a reviewable candidate", () => {
    const d = computeDay([active(8, 0, 10, 0), active(13, 0, 16, 0)], [], day, S, 0);
    expect(d.grossMs).toBe(5 * H); // gap NOT counted
    expect(d.reviewableGaps).toEqual([active(10, 0, 13, 0)]);
  });

  it("does not bridge out-of-hours gaps but counts each burst", () => {
    const d = computeDay([active(19, 0, 19, 30), active(20, 15, 20, 45)], [], day, S, 0);
    expect(d.grossMs).toBe(1 * H);
    expect(d.reviewableGaps).toHaveLength(0);
  });

  it("drops sub-minimum active spans", () => {
    const tiny = { start: at(8), end: at(8, 0) + 30_000 }; // 30s
    const d = computeDay([tiny, active(9, 0, 10, 0)], [], day, S, 0);
    expect(d.grossMs).toBe(1 * H);
  });
});

describe("computeDay corrections", () => {
  it("add_work includes an excluded gap (manual_added) and clears the review flag", () => {
    const add: Correction = { kind: "add_work", start: at(10), end: at(13) };
    const d = computeDay([active(8, 0, 10, 0), active(13, 0, 16, 0)], [add], day, S, 0);
    expect(d.grossMs).toBe(8 * H);
    expect(provMs(d.spans, "manual_added")).toBe(3 * H);
    expect(d.reviewableGaps).toHaveLength(0);
    expect(d.lunchMs).toBe(30 * MIN); // 8h > 6h
    expect(d.workedMs).toBe(7.5 * H);
    expect(d.balanceMs).toBe(0); // 7.5h worked vs 7.5h norm
  });

  it("remove_work overrides an auto-bridged period", () => {
    const rm: Correction = { kind: "remove_work", start: at(10), end: at(10, 20) };
    const d = computeDay([active(8, 0, 10, 0), active(10, 20, 12, 0)], [rm], day, S, 0);
    expect(d.grossMs).toBe(4 * H - 20 * MIN);
    expect(provMs(d.spans, "auto_bridged")).toBe(0);
  });

  it("remove_work overrides sensor activity", () => {
    const rm: Correction = { kind: "remove_work", start: at(9), end: at(9, 30) };
    const d = computeDay([active(8, 0, 12, 0)], [rm], day, S, 0);
    expect(d.grossMs).toBe(4 * H - 30 * MIN);
  });

  it("add_work re-includes a removed period as a distinct manual span (add overrides remove, no merge)", () => {
    // Sensor covers 9–17; the user marks 15–16 private, then changes their mind
    // and adds it back. The explicit add wins over the removal, and the re-added
    // hour stays a distinct manual span — the two sensor periods never merge.
    const rm: Correction = { kind: "remove_work", start: at(15), end: at(16) };
    const add: Correction = { kind: "add_work", start: at(15), end: at(16) };
    const d = computeDay([active(9, 0, 17, 0)], [rm, add], day, S, 0);
    expect(d.grossMs).toBe(8 * H); // full 9–17 counts again
    expect(provMs(d.spans, "manual_added")).toBe(1 * H); // the re-added hour is manual (purple)
    expect(provMs(d.spans, "sensor")).toBe(7 * H); // surrounding measured time, unchanged
    expect(d.spans.filter((s) => s.provenance === "sensor")).toHaveLength(2); // still two separate spans
  });

  it("add_work overrides only the removed region it overlaps", () => {
    // remove 14–16, add back 15–16 → 14–15 stays excluded, 15–16 returns (manual).
    const rm: Correction = { kind: "remove_work", start: at(14), end: at(16) };
    const add: Correction = { kind: "add_work", start: at(15), end: at(16) };
    const d = computeDay([active(9, 0, 17, 0)], [rm, add], day, S, 0);
    expect(d.grossMs).toBe(7 * H); // 8h − 1h (14–15 still removed)
    expect(provMs(d.spans, "manual_added")).toBe(1 * H); // 15–16 re-added as manual
  });

  it("surfaces removed activity as removedSpans, cleared once re-added", () => {
    const rm: Correction = { kind: "remove_work", start: at(14), end: at(15) };
    const d = computeDay([active(8, 0, 16, 0)], [rm], day, S, 0);
    expect(d.removedSpans).toEqual([{ start: at(14), end: at(15) }]); // excluded, shown amber
    const d2 = computeDay(
      [active(8, 0, 16, 0)],
      [rm, { kind: "add_work", start: at(14), end: at(15) }],
      day,
      S,
      0,
    );
    expect(d2.removedSpans).toEqual([]); // re-added → no longer excluded
  });
});

function periodsOf(d: { periods: Period[] }, type: PeriodType) {
  return d.periods.filter((p) => p.type === type);
}
const COUNTED = new Set<PeriodType>(["sensor", "auto_bridged", "manual_added"]);

describe("computeDay partition", () => {
  it("tiles the whole day with no gaps or overlaps, counted sum == gross", () => {
    const d = computeDay([active(8, 0, 10, 0), active(10, 20, 12, 0)], [], day, S, 0);
    const ps = [...d.periods].sort((a, b) => a.start - b.start);
    expect(ps[0]!.start).toBe(day);
    for (let i = 1; i < ps.length; i++) expect(ps[i]!.start).toBe(ps[i - 1]!.end);
    expect(ps[ps.length - 1]!.end).toBe(day + 24 * H);
    const counted = ps.filter((p) => COUNTED.has(p.type)).reduce((n, p) => n + duration(p), 0);
    expect(counted).toBe(d.grossMs);
  });

  it("emits out-of-hours idle as explicit gap periods, not holes", () => {
    const d = computeDay([active(9, 0, 12, 0)], [], day, S, 0);
    const gaps = periodsOf(d, "gap");
    // Before 9 and after 12 are plain gaps.
    expect(gaps.some((g) => g.start === day && g.end === at(9))).toBe(true);
    expect(gaps.some((g) => g.start === at(12) && g.end === day + 24 * H)).toBe(true);
  });

  it("remove splits a straddling span and leaves uncounted sub-ranges as plain gaps", () => {
    // sensor 9–10 and 13–14; a 3h reviewable gap 10–13 between them.
    // remove_work 8–15 excludes only the counted 9–10 and 13–14; the empty
    // 8–9 and 14–15 sub-ranges stay plain gaps, and 10–13 stays reviewable.
    const rm: Correction = { kind: "remove_work", start: at(8), end: at(15) };
    const d = computeDay([active(9, 0, 10, 0), active(13, 0, 14, 0)], [rm], day, S, 0);
    expect(d.grossMs).toBe(0);
    expect(periodsOf(d, "removed").map((p) => [p.start, p.end])).toEqual([
      [at(9), at(10)],
      [at(13), at(14)],
    ]);
    expect(periodsOf(d, "review").map((p) => [p.start, p.end])).toEqual([[at(10), at(13)]]);
    // The empty sub-ranges of the remove (08–09, 14–15) are plain gaps, not
    // marked removed (they merge into the surrounding idle).
    const at830 = at(8, 30);
    const at1430 = at(14, 30);
    expect(d.periods.find((p) => p.start <= at830 && p.end > at830)!.type).toBe("gap");
    expect(d.periods.find((p) => p.start <= at1430 && p.end > at1430)!.type).toBe("gap");
  });

  it("add wrapping real activity yields manual periods that keep the sensor un-merged", () => {
    const add: Correction = { kind: "add_work", start: at(8), end: at(14), id: 42 };
    const d = computeDay([active(9, 0, 12, 0)], [add], day, S, 0);
    const manual = periodsOf(d, "manual_added");
    expect(manual.map((p) => [p.start, p.end])).toEqual([
      [at(8), at(9)],
      [at(12), at(14)],
    ]);
    // Each manual period is attributed to the add correction id.
    for (const p of manual) expect(p.correctionIds).toEqual([42]);
    // The real activity keeps its own provenance, un-merged.
    expect(periodsOf(d, "sensor").map((p) => [p.start, p.end])).toEqual([[at(9), at(12)]]);
  });

  it("removed periods carry the removing correction id", () => {
    const rm: Correction = { kind: "remove_work", start: at(9), end: at(10), id: 7 };
    const d = computeDay([active(8, 0, 12, 0)], [rm], day, S, 0);
    expect(periodsOf(d, "removed").map((p) => p.correctionIds)).toEqual([[7]]);
  });
});

describe("computeDay office envelope", () => {
  // Default office window is 08:00–16:00.
  it("uses natural boundaries of presence overlapping the window", () => {
    const d = computeDay(
      [
        active(6, 0, 6, 40), // pre-work: ends before 08:00 → does not belong
        active(7, 50, 8, 5), // overlaps 08:00 → belongs, natural start 07:50
        active(10, 0, 11, 0),
        active(15, 55, 16, 30), // overlaps 16:00 → belongs, natural end 16:30
        active(20, 0, 21, 0), // evening → does not belong
      ],
      [],
      day,
      S,
      0,
    );
    expect(d.officeEnvelope).toEqual({ start: at(7, 50), end: at(16, 30) });
  });

  it("is null when no presence overlaps the office window", () => {
    const d = computeDay([active(20, 0, 21, 0)], [], day, S, 0);
    expect(d.officeEnvelope).toBeNull();
  });
});

describe("lunch and norms", () => {
  it("applies lunch only when the day exceeds the threshold", () => {
    const short = computeDay([active(9, 0, 14, 0)], [], day, S, 0); // 5h ≤ 6h
    expect(short.lunchMs).toBe(0);
    const long = computeDay([active(8, 0, 16, 0)], [], day, S, 0); // 8h > 6h
    expect(long.lunchMs).toBe(30 * MIN);
    expect(long.workedMs).toBe(7.5 * H);
  });
  it("no norm on a non-working weekday (Sunday)", () => {
    const d = computeDay([active(10, 0, 12, 0)], [], day, S, 6);
    expect(d.normMs).toBe(0);
    expect(d.balanceMs).toBe(2 * H);
  });
});

describe("roundToStep", () => {
  it("rounds to the nearest half hour", () => {
    expect(roundToStep(7 * H + 37 * MIN, 30)).toBe(7.5 * H);
    expect(roundToStep(7 * H + 50 * MIN, 30)).toBe(8 * H);
  });
});

describe("computeWeek", () => {
  it("assembles Mon–Sun and sums the weekly total and balance", () => {
    const events: RawEvent[] = [
      { machine_id: "m", ts: at(8), kind: "active" },
      { machine_id: "m", ts: at(16), kind: "idle" },
    ];
    const w = computeWeek(day, events, [], S, at(23));
    expect(w.days).toHaveLength(7);
    expect(w.days[0]!.workedMs).toBe(7.5 * H); // Monday 8h - lunch
    expect(w.weeklyWorkedMs).toBe(7.5 * H); // only Monday has data
    expect(w.weeklyBalanceMs).toBe(7.5 * H - S.weeklyNormMin * MIN);
  });
});

describe("non-working days credit only", () => {
  const DAY = 24 * H;

  it("a non-working day with work credits exactly the worked time", () => {
    // Saturday (weekday 5) is not in the default Mon–Fri working set.
    const d = computeDay([active(9, 0, 12, 0)], [], day, S, 5);
    expect(d.isWorkingDay).toBe(false);
    expect(d.normMs).toBe(0);
    expect(d.workedMs).toBe(3 * H);
    expect(d.balanceMs).toBe(d.workedMs);
    expect(d.balanceMs).toBeGreaterThanOrEqual(0);
  });

  it("weekend work adds to the weekly balance", () => {
    const satStart = day + 5 * DAY; // Saturday of this week
    const events: RawEvent[] = [
      { machine_id: "m", ts: satStart + 9 * H, kind: "active" },
      { machine_id: "m", ts: satStart + 12 * H, kind: "idle" },
    ];
    const checkTime = day + 7 * DAY;
    const worked = computeWeek(day, events, [], S, checkTime);
    const empty = computeWeek(day, [], [], S, checkTime);
    expect(worked.days[5]!.isWorkingDay).toBe(false);
    expect(worked.days[5]!.balanceMs).toBe(3 * H);
    expect(worked.weeklyBalanceMs - empty.weeklyBalanceMs).toBe(3 * H);
  });

  it("flipping a weekday out of the working set zeroes its norm", () => {
    const noMonday: Settings = { ...S, workingWeekdays: [1, 2, 3, 4] };
    const off = computeDay([], [], day, noMonday, 0); // Monday, now non-working, no work
    expect(off.isWorkingDay).toBe(false);
    expect(off.normMs).toBe(0);
    expect(off.balanceMs).toBe(0);
    // Still a working day under the default set: a no-work day owes the norm.
    const on = computeDay([], [], day, S, 0);
    expect(on.normMs).toBe(S.dailyNormMin * MIN);
    expect(on.balanceMs).toBe(-S.dailyNormMin * MIN);
  });
});

describe("holiday days", () => {
  const DAY = 24 * H;
  const hol = (dayStart: number, id = 1): Correction => ({
    kind: "holiday",
    start: dayStart,
    end: dayStart + DAY,
    id,
  });

  it("zeroes the norm of a working day and credits any work", () => {
    // Monday (weekday 0) is a working day; marking it a holiday zeroes its norm.
    const off = computeDay([], [hol(day)], day, S, 0);
    expect(off.isHoliday).toBe(true);
    expect(off.isWorkingDay).toBe(true);
    expect(off.normMs).toBe(0);
    expect(off.balanceMs).toBe(0);
    // Work on a holiday still credits (worked − zero norm).
    const worked = computeDay([active(9, 0, 11, 0)], [hol(day)], day, S, 0);
    expect(worked.normMs).toBe(0);
    expect(worked.workedMs).toBe(2 * H);
    expect(worked.balanceMs).toBe(2 * H);
  });

  it("a holiday's worked time adds to the weekly balance", () => {
    const events: RawEvent[] = [
      { machine_id: "m", ts: day + 9 * H, kind: "active" },
      { machine_id: "m", ts: day + 11 * H, kind: "idle" },
    ];
    const checkTime = day + 7 * DAY;
    const worked = computeWeek(day, events, [hol(day)], S, checkTime);
    const idle = computeWeek(day, [], [hol(day)], S, checkTime);
    expect(worked.days[0]!.balanceMs).toBe(2 * H);
    expect(worked.weeklyBalanceMs - idle.weeklyBalanceMs).toBe(2 * H);
  });

  it("one holiday on a working day reduces the weekly norm by one daily norm", () => {
    const w = computeWeek(day, [], [hol(day)], S, day + 7 * DAY);
    expect(w.weeklyNormMs).toBe(S.weeklyNormMin * MIN - S.dailyNormMin * MIN);
  });

  it("a full week of holidays nets to zero", () => {
    // Holidays on all five working weekdays (Mon–Fri).
    const holidays = [0, 1, 2, 3, 4].map((i) => hol(day + i * DAY, i + 1));
    const w = computeWeek(day, [], holidays, S, day + 7 * DAY);
    expect(w.days.slice(0, 5).every((d) => d.isHoliday && d.balanceMs === 0)).toBe(true);
    expect(w.weeklyNormMs).toBe(0);
    expect(w.weeklyBalanceMs).toBe(0);
  });

  it("a holiday on a non-working day leaves the weekly norm unchanged", () => {
    const satStart = day + 5 * DAY; // Saturday is non-working by default
    const w = computeWeek(day, [], [hol(satStart)], S, day + 7 * DAY);
    expect(w.days[5]!.isHoliday).toBe(true);
    expect(w.days[5]!.isWorkingDay).toBe(false);
    expect(w.weeklyNormMs).toBe(S.weeklyNormMin * MIN);
  });
});
