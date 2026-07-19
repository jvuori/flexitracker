import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeSettingsPatch,
  normalizeWorkingWeekdays,
} from "../src/worktime/settings";

describe("normalizeWorkingWeekdays", () => {
  it("accepts a valid Mon–Fri set", () => {
    expect(normalizeWorkingWeekdays([0, 1, 2, 3, 4])).toEqual([0, 1, 2, 3, 4]);
  });

  it("dedupes and sorts", () => {
    expect(normalizeWorkingWeekdays([4, 0, 4, 2, 0])).toEqual([0, 2, 4]);
  });

  it("allows an empty array", () => {
    expect(normalizeWorkingWeekdays([])).toEqual([]);
  });

  it("rejects out-of-range values", () => {
    expect(() => normalizeWorkingWeekdays([0, 7])).toThrow();
    expect(() => normalizeWorkingWeekdays([-1])).toThrow();
  });

  it("rejects non-integer values", () => {
    expect(() => normalizeWorkingWeekdays([1.5])).toThrow();
    expect(() => normalizeWorkingWeekdays(["0"])).toThrow();
  });

  it("rejects non-array input", () => {
    expect(() => normalizeWorkingWeekdays(5)).toThrow();
    expect(() => normalizeWorkingWeekdays(null)).toThrow();
  });
});

describe("normalizeSettingsPatch", () => {
  const cur = DEFAULT_SETTINGS;

  it("passes a valid patch through", () => {
    const patch = { workdayStartMin: 9 * 60, dailyNormMin: 8 * 60 };
    expect(normalizeSettingsPatch(patch, cur)).toEqual(patch);
  });

  it("accepts an empty patch", () => {
    expect(normalizeSettingsPatch({}, cur)).toEqual({});
  });

  it("normalises workingWeekdays as part of the patch", () => {
    expect(normalizeSettingsPatch({ workingWeekdays: [4, 0, 4, 2] }, cur).workingWeekdays).toEqual([
      0, 2, 4,
    ]);
  });

  // --- per-field domains ---------------------------------------------------

  it("rejects out-of-range values for each numeric field", () => {
    expect(() => normalizeSettingsPatch({ workdayStartMin: 4800 }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ workdayEndMin: 1441 }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ dailyNormMin: 1441 }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ weeklyNormMin: 10081 }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ lunchDeductMin: 1441 }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ lunchThresholdMin: 1441 }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ privateLeaveThresholdSec: 86401 }, cur)).toThrow();
  });

  it("rejects negative values", () => {
    expect(() => normalizeSettingsPatch({ dailyNormMin: -1 }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ workdayStartMin: -1 }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ privateLeaveThresholdSec: -1 }, cur)).toThrow();
  });

  it("rejects non-integer and non-numeric values", () => {
    expect(() => normalizeSettingsPatch({ dailyNormMin: 7.5 }, cur)).toThrow();
    expect(() =>
      normalizeSettingsPatch({ weeklyNormMin: "2250" as unknown as number }, cur),
    ).toThrow();
    expect(() => normalizeSettingsPatch({ lunchDeductMin: NaN }, cur)).toThrow();
  });

  it("accepts the inclusive domain bounds", () => {
    expect(() => normalizeSettingsPatch({ workdayStartMin: 0 }, cur)).not.toThrow();
    expect(() => normalizeSettingsPatch({ workdayEndMin: 1439 }, cur)).not.toThrow();
    expect(() => normalizeSettingsPatch({ weeklyNormMin: 10080 }, cur)).not.toThrow();
    expect(() => normalizeSettingsPatch({ privateLeaveThresholdSec: 86400 }, cur)).not.toThrow();
  });

  it("caps the office-hours bounds at 23:59, since 24:00 is not a time of day", () => {
    // 1440 has no `<input type="time">` representation, so it could not
    // round-trip through the UI. A duration may exceed a day; a bound may not.
    expect(() => normalizeSettingsPatch({ workdayEndMin: 1440 }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ dailyNormMin: 1440 }, cur)).not.toThrow();
  });

  // --- timezone ------------------------------------------------------------

  it("accepts a valid IANA timezone", () => {
    expect(normalizeSettingsPatch({ timezone: "Europe/Helsinki" }, cur).timezone).toBe(
      "Europe/Helsinki",
    );
  });

  it("rejects an uninterpretable or empty timezone", () => {
    expect(() => normalizeSettingsPatch({ timezone: "Mars/Olympus_Mons" }, cur)).toThrow();
    expect(() => normalizeSettingsPatch({ timezone: "" }, cur)).toThrow();
    expect(() =>
      normalizeSettingsPatch({ timezone: 5 as unknown as string }, cur),
    ).toThrow();
  });

  // --- cross-field coherence ----------------------------------------------

  it("rejects an inverted or empty office-hours window", () => {
    expect(() =>
      normalizeSettingsPatch({ workdayStartMin: 16 * 60, workdayEndMin: 8 * 60 }, cur),
    ).toThrow();
    expect(() =>
      normalizeSettingsPatch({ workdayStartMin: 8 * 60, workdayEndMin: 8 * 60 }, cur),
    ).toThrow();
  });

  it("rejects a daily norm above the weekly norm", () => {
    expect(() =>
      normalizeSettingsPatch({ dailyNormMin: 600, weeklyNormMin: 300 }, cur),
    ).toThrow();
  });

  it("rejects a lunch deduction above the lunch threshold", () => {
    expect(() =>
      normalizeSettingsPatch({ lunchDeductMin: 60, lunchThresholdMin: 30 }, cur),
    ).toThrow();
  });

  it("accepts coherent moves of both sides of each pair", () => {
    expect(() =>
      normalizeSettingsPatch({ workdayStartMin: 7 * 60, workdayEndMin: 15 * 60 }, cur),
    ).not.toThrow();
    expect(() =>
      normalizeSettingsPatch({ dailyNormMin: 480, weeklyNormMin: 2400 }, cur),
    ).not.toThrow();
    expect(() =>
      normalizeSettingsPatch({ lunchDeductMin: 45, lunchThresholdMin: 300 }, cur),
    ).not.toThrow();
    // Equality is permitted on both norm rules.
    expect(() =>
      normalizeSettingsPatch({ dailyNormMin: 450, weeklyNormMin: 450 }, cur),
    ).not.toThrow();
    expect(() =>
      normalizeSettingsPatch({ lunchDeductMin: 30, lunchThresholdMin: 30 }, cur),
    ).not.toThrow();
  });

  // Partial patches are the case that regresses if a cross-field check is ever
  // moved off the merged settings onto the patch alone — each of these carries
  // only one side of a pair and must still be checked against the stored other.
  describe("partial patches are checked against the stored counterpart", () => {
    it("rejects a lower half raised past the stored upper half", () => {
      expect(() => normalizeSettingsPatch({ workdayStartMin: 17 * 60 }, cur)).toThrow();
      expect(() => normalizeSettingsPatch({ dailyNormMin: 3000 }, cur)).toThrow();
      expect(() => normalizeSettingsPatch({ lunchDeductMin: 400 }, cur)).toThrow();
    });

    it("rejects an upper half lowered past the stored lower half", () => {
      expect(() => normalizeSettingsPatch({ workdayEndMin: 7 * 60 }, cur)).toThrow();
      expect(() => normalizeSettingsPatch({ weeklyNormMin: 60 }, cur)).toThrow();
      expect(() => normalizeSettingsPatch({ lunchThresholdMin: 10 }, cur)).toThrow();
    });

    it("accepts a one-sided move that stays coherent with the stored counterpart", () => {
      expect(() => normalizeSettingsPatch({ workdayStartMin: 7 * 60 }, cur)).not.toThrow();
      expect(() => normalizeSettingsPatch({ weeklyNormMin: 3000 }, cur)).not.toThrow();
      expect(() => normalizeSettingsPatch({ lunchThresholdMin: 400 }, cur)).not.toThrow();
    });
  });

  it("names both operands and their effective values when a pair is rejected", () => {
    // A partial patch rejected against a stored counterpart must be
    // diagnosable from the message alone.
    expect(() => normalizeSettingsPatch({ workdayStartMin: 17 * 60 }, cur)).toThrow(
      /1020.*960|960.*1020/,
    );
  });
});
