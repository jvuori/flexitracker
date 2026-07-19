import { describe, expect, it } from "vitest";
import { TIME_HELPERS_SRC } from "../src/ui/client-helpers";

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
