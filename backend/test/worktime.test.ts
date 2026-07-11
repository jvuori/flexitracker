import { describe, expect, it } from "vitest";
import type { Span } from "../src/worktime/interval";
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
