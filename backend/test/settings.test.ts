import { describe, expect, it } from "vitest";
import { normalizeWorkingWeekdays } from "../src/worktime/settings";

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
