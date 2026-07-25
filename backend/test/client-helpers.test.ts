import { describe, expect, it } from "vitest";
import { LANE_HELPERS_SRC, TIME_HELPERS_SRC } from "../src/ui/client-helpers";

// The browser client is a plain string, so these helpers are defined as source
// and inlined into it. Evaluating that same source here means the tests
// exercise exactly what ships — there is no second copy to drift.
const helpers = new Function(
  `${TIME_HELPERS_SRC}; return { minToHHMM, hhmmToMin, minToHM, hmToMin };`,
)() as {
  minToHHMM: (min: number) => string;
  hhmmToMin: (s: string) => number;
  minToHM: (min: number) => { h: number; m: number };
  hmToMin: (h: number | string, m: number | string) => number;
};

const { minToHHMM, hhmmToMin, minToHM, hmToMin } = helpers;

describe("minToHHMM / hhmmToMin", () => {
  it("formats the default office-hours bounds", () => {
    expect(minToHHMM(480)).toBe("08:00");
    expect(minToHHMM(960)).toBe("16:00");
  });

  it("zero-pads both fields", () => {
    expect(minToHHMM(0)).toBe("00:00");
    expect(minToHHMM(9 * 60 + 5)).toBe("09:05");
    expect(minToHHMM(61)).toBe("01:01");
  });

  it("formats the last representable minute of the day", () => {
    expect(minToHHMM(1439)).toBe("23:59");
  });

  it("parses back to minutes", () => {
    expect(hhmmToMin("08:00")).toBe(480);
    expect(hhmmToMin("00:00")).toBe(0);
    expect(hhmmToMin("23:59")).toBe(1439);
    expect(hhmmToMin("09:05")).toBe(545);
  });

  it("round-trips every minute of the day", () => {
    for (let m = 0; m <= 1439; m++) expect(hhmmToMin(minToHHMM(m))).toBe(m);
  });
});

describe("minToHM / hmToMin", () => {
  it("splits the default norms", () => {
    expect(minToHM(450)).toEqual({ h: 7, m: 30 }); // daily norm 7h30m
    expect(minToHM(2250)).toEqual({ h: 37, m: 30 }); // weekly norm 37h30m
  });

  it("handles zero and sub-hour durations", () => {
    expect(minToHM(0)).toEqual({ h: 0, m: 0 });
    expect(minToHM(30)).toEqual({ h: 0, m: 30 }); // lunch deduction
    expect(minToHM(59)).toEqual({ h: 0, m: 59 });
  });

  it("does not clamp hours to a day — a duration is not a time of day", () => {
    expect(minToHM(2250).h).toBe(37);
    expect(minToHM(60 * 30)).toEqual({ h: 30, m: 0 });
  });

  it("recombines to minutes", () => {
    expect(hmToMin(7, 30)).toBe(450);
    expect(hmToMin(37, 30)).toBe(2250);
    expect(hmToMin(0, 0)).toBe(0);
  });

  it("accepts the string values an input element yields", () => {
    expect(hmToMin("7", "30")).toBe(450);
    expect(hmToMin("0", "45")).toBe(45);
  });

  it("round-trips a range of durations", () => {
    for (const m of [0, 1, 30, 59, 60, 450, 720, 2250, 10080]) {
      const { h, m: mm } = minToHM(m);
      expect(hmToMin(h, mm)).toBe(m);
    }
  });

  it("round-trips the private-leave threshold through its seconds storage", () => {
    // Stored in seconds, entered in h+m: 7200s -> 2h 0m -> 7200s.
    const { h, m } = minToHM(7200 / 60);
    expect({ h, m }).toEqual({ h: 2, m: 0 });
    expect(hmToMin(h, m) * 60).toBe(7200);
  });
});

const laneHelpers = new Function(
  `${LANE_HELPERS_SRC}; return { overlapsTypes, rawTile, markRawProvisional };`,
)() as {
  overlapsTypes: (
    d: { periods: { start: number; end: number; type: string }[] },
    s: number,
    e: number,
    types: string[],
  ) => boolean;
  rawTile: (
    active: { start: number; end: number }[],
    dayStart: number,
  ) => { start: number; end: number; type: "active" | "gap" }[];
  markRawProvisional: (
    segs: { start: number; end: number; type: string; provisional?: boolean }[],
    provisional: { start: number; end: number; growing: boolean; lastAlive: number }[],
  ) => unknown;
};
const { overlapsTypes, rawTile, markRawProvisional } = laneHelpers;

const H = 3_600_000;
const DAY = Date.UTC(2024, 5, 3);
const at = (h: number) => DAY + h * H;
const period = (start: number, end: number, type: string) => ({ start, end, type });

describe("overlapsTypes — the shared enablement rule for a selection without correction identity", () => {
  const periods = [
    period(at(0), at(8), "gap"),
    period(at(8), at(12), "sensor"),
    period(at(12), at(13), "manual_added"),
    period(at(13), at(24), "gap"),
  ];
  const d = { periods };

  it("is true when the range overlaps a matching type", () => {
    expect(overlapsTypes(d, at(9), at(10), ["sensor", "auto_bridged"])).toBe(true);
    expect(overlapsTypes(d, at(1), at(2), ["gap", "review", "removed"])).toBe(true);
  });

  it("is false for a pure manual_added overlap — Exclude/Move are never offered on it alone", () => {
    expect(overlapsTypes(d, at(12), at(13), ["sensor", "auto_bridged"])).toBe(false);
  });

  it("is true for a mixed sensor + manual_added range — the movable portion is enough", () => {
    // 11:00-12:30 overlaps both the sensor period (08-12) and manual_added (12-13).
    expect(overlapsTypes(d, at(11), at(12.5), ["sensor", "auto_bridged"])).toBe(true);
  });

  it("is false for an inverted or empty range", () => {
    expect(overlapsTypes(d, at(10), at(10), ["sensor"])).toBe(false);
    expect(overlapsTypes(d, at(10), at(9), ["sensor"])).toBe(false);
  });
});

describe("rawTile — tiling one machine's raw active intervals into active/gap", () => {
  it("fills the whole day when there is no activity", () => {
    expect(rawTile([], DAY)).toEqual([{ start: DAY, end: DAY + 24 * H, type: "gap" }]);
  });

  it("tiles active spans with gaps on either side", () => {
    const segs = rawTile([{ start: at(9), end: at(12) }], DAY);
    expect(segs).toEqual([
      { start: DAY, end: at(9), type: "gap" },
      { start: at(9), end: at(12), type: "active" },
      { start: at(12), end: DAY + 24 * H, type: "gap" },
    ]);
  });

  it("tiles multiple spans regardless of input order", () => {
    const segs = rawTile(
      [
        { start: at(14), end: at(16) },
        { start: at(9), end: at(10) },
      ],
      DAY,
    );
    expect(segs.map((s) => s.type)).toEqual(["gap", "active", "gap", "active", "gap"]);
    expect(segs[1]).toEqual({ start: at(9), end: at(10), type: "active" });
    expect(segs[3]).toEqual({ start: at(14), end: at(16), type: "active" });
  });

  it("produces no gap segment when active spans cover the entire day exactly", () => {
    const segs = rawTile([{ start: DAY, end: DAY + 24 * H }], DAY);
    expect(segs).toEqual([{ start: DAY, end: DAY + 24 * H, type: "active" }]);
  });
});

describe("markRawProvisional", () => {
  it("marks only the active tile overlapping a provisional span, leaving others untouched", () => {
    const segs = rawTile([{ start: at(9), end: at(20) }], DAY);
    markRawProvisional(segs, [{ start: at(15), end: at(20), growing: true, lastAlive: at(19) }]);
    const active = segs.find((s) => s.type === "active") as { provisional?: boolean; growing?: boolean };
    expect(active.provisional).toBe(true);
    expect((active as { growing?: boolean }).growing).toBe(true);
  });

  it("leaves gap tiles untouched", () => {
    const segs = rawTile([{ start: at(9), end: at(10) }], DAY);
    markRawProvisional(segs, [{ start: at(9), end: at(10), growing: false, lastAlive: at(10) }]);
    const gaps = segs.filter((s) => s.type === "gap") as { provisional?: boolean }[];
    expect(gaps.every((g) => g.provisional === undefined)).toBe(true);
  });
});
