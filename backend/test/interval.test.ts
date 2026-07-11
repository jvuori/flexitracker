import { describe, expect, it } from "vitest";
import { gaps, mergeIntervals, subtract, totalDuration } from "../src/worktime/interval";

const I = (start: number, end: number) => ({ start, end });

describe("mergeIntervals", () => {
  it("coalesces overlapping and touching intervals", () => {
    expect(mergeIntervals([I(0, 10), I(10, 20), I(5, 8)])).toEqual([I(0, 20)]);
  });
  it("drops empty intervals and sorts", () => {
    expect(mergeIntervals([I(30, 40), I(5, 5), I(0, 10)])).toEqual([I(0, 10), I(30, 40)]);
  });
});

describe("subtract", () => {
  it("removes cut regions, splitting where needed", () => {
    expect(subtract([I(0, 100)], [I(20, 30), I(50, 60)])).toEqual([
      I(0, 20),
      I(30, 50),
      I(60, 100),
    ]);
  });
  it("returns base untouched when disjoint", () => {
    expect(subtract([I(0, 10)], [I(20, 30)])).toEqual([I(0, 10)]);
  });
});

describe("gaps", () => {
  it("returns the holes between intervals", () => {
    expect(gaps([I(0, 10), I(15, 20)])).toEqual([I(10, 15)]);
  });
});

describe("totalDuration", () => {
  it("counts overlapping time once", () => {
    expect(totalDuration([I(0, 10), I(5, 20)])).toBe(20);
  });
});
