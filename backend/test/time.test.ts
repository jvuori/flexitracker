import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  localDayStart,
  localWeekStart,
  minuteOfDay,
  offsetMinutes,
  weekdayMon0,
} from "../src/worktime/time";

const utcMon = Date.UTC(2024, 5, 3); // Mon 2024-06-03 00:00 UTC

describe("UTC timezone", () => {
  it("has zero offset", () => {
    expect(offsetMinutes(utcMon, "UTC")).toBe(0);
  });
  it("localDayStart snaps to midnight", () => {
    expect(localDayStart(utcMon + 13 * 3600_000, "UTC")).toBe(utcMon);
  });
  it("minuteOfDay reads wall clock", () => {
    expect(minuteOfDay(utcMon + (8 * 60 + 15) * 60_000, "UTC")).toBe(8 * 60 + 15);
  });
  it("weekday and week start", () => {
    expect(weekdayMon0(utcMon, "UTC")).toBe(0);
    expect(localWeekStart(utcMon + 3 * 86400_000, "UTC")).toBe(utcMon); // Thu → Mon
  });
  it("addLocalDays advances by a day", () => {
    expect(addLocalDays(utcMon, 1, "UTC")).toBe(utcMon + 86400_000);
  });
});

describe("Europe/Helsinki (summer = UTC+3)", () => {
  const ts = Date.UTC(2024, 5, 3, 12); // June → EEST
  it("offset is +180 minutes", () => {
    expect(offsetMinutes(ts, "Europe/Helsinki")).toBe(180);
  });
  it("local midnight is 21:00 UTC previous day", () => {
    expect(localDayStart(ts, "Europe/Helsinki")).toBe(Date.UTC(2024, 5, 2, 21));
  });
  it("minuteOfDay reflects local wall clock (15:00)", () => {
    expect(minuteOfDay(ts, "Europe/Helsinki")).toBe(15 * 60);
  });
});
