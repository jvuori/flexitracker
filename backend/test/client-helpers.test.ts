import { describe, expect, it } from "vitest";
import { AUTOSTART_HELPERS_SRC, DATE_HELPERS_SRC, LANE_HELPERS_SRC, TIME_HELPERS_SRC } from "../src/ui/client-helpers";

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

const dateHelpers = new Function(
  `${DATE_HELPERS_SRC}; return { localYMD, isoWeekNumber, addDaysYMD, isValidYMD };`,
)() as {
  localYMD: (tz: string, ts: number) => string;
  isoWeekNumber: (y: number, m: number, d: number) => number;
  addDaysYMD: (ymd: string, n: number) => string;
  isValidYMD: (s: unknown) => boolean;
};
const { localYMD, isoWeekNumber, addDaysYMD, isValidYMD } = dateHelpers;

describe("localYMD — same-calendar-day comparison key", () => {
  it("keys by the timezone's calendar day, not UTC's", () => {
    // 22:00 UTC on Jan 1 2026 is already Jan 2 in Helsinki (UTC+2 in January).
    const ts = Date.UTC(2026, 0, 1, 22, 0);
    expect(localYMD("UTC", ts)).toBe("2026-01-01");
    expect(localYMD("Europe/Helsinki", ts)).toBe("2026-01-02");
  });

  it("treats an idle span crossing midnight as a different day despite <1h elapsed", () => {
    // The exact scenario a multi-day idle status needs to disambiguate:
    // idle since 23:50, now 00:10 — 20 minutes apart, but a different day.
    const since = Date.UTC(2026, 0, 1, 23, 50);
    const now = Date.UTC(2026, 0, 2, 0, 10);
    expect(localYMD("UTC", since)).not.toBe(localYMD("UTC", now));
  });

  it("treats same-day timestamps hours apart as the same day", () => {
    const morning = Date.UTC(2026, 0, 1, 8, 0);
    const evening = Date.UTC(2026, 0, 1, 20, 0);
    expect(localYMD("UTC", morning)).toBe(localYMD("UTC", evening));
  });
});

describe("isoWeekNumber", () => {
  it("puts January 4th in week 1 of every year (the ISO 8601 definition)", () => {
    for (let y = 2015; y <= 2030; y++) expect(isoWeekNumber(y, 1, 4)).toBe(1);
  });

  it("puts December 28th in the year's last week (52 or 53, per ISO 8601)", () => {
    for (let y = 2015; y <= 2030; y++) expect([52, 53]).toContain(isoWeekNumber(y, 12, 28));
  });

  it("gives 2020 (a 53-week ISO year) week 53 for its last Monday", () => {
    // 2020-12-28 is a Monday; 2020 is one of the rare 53-ISO-week years.
    expect(isoWeekNumber(2020, 12, 28)).toBe(53);
  });

  it("crosses the year boundary forward: a December Monday can belong to next year's week 1", () => {
    // 2024-12-30 is a Monday whose Thursday (2025-01-02) falls in 2025.
    expect(isoWeekNumber(2024, 12, 30)).toBe(1);
  });

  it("crosses the year boundary backward: early January can belong to the previous year's last week", () => {
    // 2021-01-01 is a Friday; its week's Thursday (2020-12-31) falls in 2020,
    // so it belongs to 2020's week 53, not week 1 of 2021.
    expect(isoWeekNumber(2021, 1, 1)).toBe(53);
  });
});

describe("addDaysYMD — pure calendar-date arithmetic for the week=/day= URL params", () => {
  it("steps within a month", () => {
    expect(addDaysYMD("2026-07-20", 1)).toBe("2026-07-21");
    expect(addDaysYMD("2026-07-20", -1)).toBe("2026-07-19");
  });

  it("shifts a full week, the prev/next navigation case", () => {
    expect(addDaysYMD("2026-07-20", 7)).toBe("2026-07-27");
    expect(addDaysYMD("2026-07-20", -7)).toBe("2026-07-13");
  });

  it("rolls over a month boundary", () => {
    expect(addDaysYMD("2026-07-28", 7)).toBe("2026-08-04");
  });

  it("rolls over a year boundary", () => {
    expect(addDaysYMD("2026-12-29", 7)).toBe("2027-01-05");
  });

  it("is a no-op at n=0", () => {
    expect(addDaysYMD("2026-07-20", 0)).toBe("2026-07-20");
  });
});

describe("isValidYMD — the week=/day= URL param validator", () => {
  it("accepts a well-formed calendar date", () => {
    expect(isValidYMD("2026-07-20")).toBe(true);
    expect(isValidYMD("2026-01-01")).toBe(true);
    expect(isValidYMD("2026-12-31")).toBe(true);
  });

  it("rejects malformed strings outright", () => {
    expect(isValidYMD("")).toBe(false);
    expect(isValidYMD("not-a-date")).toBe(false);
    expect(isValidYMD("2026-7-20")).toBe(false); // not zero-padded
    expect(isValidYMD("2026/07/20")).toBe(false);
  });

  it("rejects out-of-range components Date would otherwise silently roll over", () => {
    expect(isValidYMD("2026-02-30")).toBe(false); // February never has a 30th
    expect(isValidYMD("2026-13-01")).toBe(false); // no month 13
    expect(isValidYMD("2026-00-10")).toBe(false); // no month 0
  });

  it("rejects non-string input from a URLSearchParams miss", () => {
    expect(isValidYMD(null)).toBe(false);
    expect(isValidYMD(undefined)).toBe(false);
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

const { autostartCommand } = new Function(`${AUTOSTART_HELPERS_SRC}; return { autostartCommand };`)() as {
  autostartCommand: (os: string) => string | null;
};

describe("autostartCommand — the Machines tab's per-OS auto-start command", () => {
  it("gives Windows a single-line HKCU Run-key command pointed at the windowless launcher", () => {
    const cmd = autostartCommand("windows");
    expect(cmd).toContain('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"');
    expect(cmd).toContain("flexitracker-daemon.exe");
    expect(cmd).not.toContain("\n"); // one line, safe to paste into cmd.exe as-is
  });

  it("gives Linux the systemd user-service enable sequence, one command per line", () => {
    const cmd = autostartCommand("linux");
    expect(cmd).toContain("systemctl --user enable --now flexitracker.service");
    expect(cmd?.split("\n")).toEqual([
      "mkdir -p ~/.config/systemd/user",
      "cp flexitracker.service ~/.config/systemd/user/",
      "systemctl --user daemon-reload",
      "systemctl --user enable --now flexitracker.service",
    ]);
  });

  it("returns null for an OS with no daemon build (mac) or an undetected one", () => {
    expect(autostartCommand("mac")).toBeNull();
    expect(autostartCommand("other")).toBeNull();
  });

  it("never returns an installer script — no .ps1/.vbs/.sh reference in either command", () => {
    for (const os of ["windows", "linux"]) {
      const cmd = autostartCommand(os) ?? "";
      expect(cmd).not.toMatch(/\.(ps1|vbs|sh)\b/);
    }
  });
});
