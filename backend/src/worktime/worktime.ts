// The heart of the system: turn raw transitions + corrections into per-day
// working time, with presence-based bridging and provenance-tagged composition.
// Pure and framework-free (worktime-calculation + manual-corrections specs).

import type { EventKind } from "../schema";
import { clamp, duration, gaps, mergeIntervals, subtract, totalDuration } from "./interval";
import type { Interval, Provenance, Span } from "./interval";
import type { Settings } from "./settings";
import { localDayStart, minuteOfDay, addLocalDays } from "./time";

const MIN = 60_000;

export interface RawEvent {
  machine_id: string;
  ts: number;
  kind: EventKind;
}

export type CorrectionKind = "add_work" | "remove_work";
export interface Correction {
  kind: CorrectionKind;
  start: number;
  end: number;
}

export interface DayResult {
  dayStart: number;
  /** Working intervals after composition, each tagged with why it counts. */
  spans: Span[];
  /** Raw sensor-active intervals in the day — shown even when auto-bridged. */
  rawActive: Interval[];
  /** In-hours gaps excluded as private leave and available to reclassify. */
  reviewableGaps: Interval[];
  /** Measured/bridged time excluded by a remove_work and not re-added. */
  removedSpans: Interval[];
  isWorkingDay: boolean;
  grossMs: number; // sum of spans before lunch
  lunchMs: number; // deduction applied
  workedMs: number; // gross - lunch
  normMs: number;
  balanceMs: number; // worked - norm
}

const PRESENCE: ReadonlySet<EventKind> = new Set<EventKind>([
  "active",
  "login",
  "unlock",
  "heartbeat",
]);
const ABSENCE: ReadonlySet<EventKind> = new Set<EventKind>([
  "idle",
  "lock",
  "logout",
]);

/**
 * Pair transitions into active intervals, per machine, then union across
 * machines (the person is working if any machine is active). Orphan open spans
 * are closed at `checkTime`.
 */
export function pairSpans(events: RawEvent[], checkTime: number): Interval[] {
  const byMachine = new Map<string, RawEvent[]>();
  for (const e of events) {
    const list = byMachine.get(e.machine_id) ?? [];
    list.push(e);
    byMachine.set(e.machine_id, list);
  }

  const all: Interval[] = [];
  for (const list of byMachine.values()) {
    list.sort((a, b) => a.ts - b.ts);
    let open: number | null = null;
    for (const e of list) {
      if (PRESENCE.has(e.kind)) {
        if (open === null) open = e.ts;
      } else if (ABSENCE.has(e.kind)) {
        if (open !== null) {
          if (e.ts > open) all.push({ start: open, end: e.ts });
          open = null;
        }
      }
    }
    if (open !== null && checkTime > open) all.push({ start: open, end: checkTime });
  }
  return mergeIntervals(all);
}

function inHours(gap: Interval, tz: string, startMin: number, endMin: number): boolean {
  // Fully within the working-hours window (a gap that touches outside is not
  // an in-hours break).
  const gs = minuteOfDay(gap.start, tz);
  const ge = minuteOfDay(gap.end, tz);
  return gs >= startMin && ge <= endMin && ge >= gs;
}

/** Compute one local day's result from merged active intervals + corrections. */
export function computeDay(
  activeMerged: Interval[],
  corrections: Correction[],
  dayStart: number,
  s: Settings,
  weekdayMon0: number,
): DayResult {
  const dayEnd = addLocalDays(dayStart, 1, s.timezone);
  const win: Interval = { start: dayStart, end: dayEnd };

  // Sensor active clamped to the day, dropping sub-threshold spans.
  const rawActive: Interval[] = [];
  for (const iv of activeMerged) {
    const c = clamp(iv, win);
    if (c) rawActive.push(c);
  }
  const sensor = rawActive.filter((i) => duration(i) >= s.minActiveSec * 1000);

  // Classify gaps between sensor spans.
  const bridged: Interval[] = [];
  const reviewable: Interval[] = [];
  for (const g of gaps(sensor)) {
    if (!inHours(g, s.timezone, s.workdayStartMin, s.workdayEndMin)) continue;
    if (duration(g) < s.privateLeaveThresholdSec * 1000) bridged.push(g);
    else reviewable.push(g);
  }

  const adds = clampAll(corrections.filter((c) => c.kind === "add_work"), win);
  const removes = clampAll(corrections.filter((c) => c.kind === "remove_work"), win);

  // Compose the day as distinct provenance layers that never merge:
  //  - a remove_work carves its span out of the sensor/auto-bridged layers;
  //  - an add_work covers whatever the *surviving* sensor/bridged does not, and
  //    is shown as a manual addition. Because a removed span no longer survives,
  //    an add_work over it re-includes that time as manual — so an explicit
  //    add_work overrides a remove_work, and the re-added period stays a distinct
  //    manual span (never merged back into the sensor it once was).
  const covered = mergeIntervals([...sensor, ...bridged]);
  const survivingCovered = subtract(covered, removes);
  const manualAdded = subtract(adds, survivingCovered);

  const spans: Span[] = [
    ...tag(subtract(sensor, removes), "sensor"),
    ...tag(subtract(bridged, removes), "auto_bridged"),
    ...tag(manualAdded, "manual_added"),
  ].sort((a, b) => a.start - b.start);

  // Activity a remove_work excluded (and that no add_work has re-included):
  // measured/bridged time that no longer counts, surfaced as an "excluded" band.
  const removedSpans = subtract(subtract(covered, survivingCovered), adds).sort(
    (a, b) => a.start - b.start,
  );

  // A reviewable gap the user included is no longer reviewable.
  const reviewableGaps = subtract(reviewable, adds);

  const grossMs = totalDuration(spans);
  const isWorkingDay = s.workingWeekdays.includes(weekdayMon0);
  const lunchMs =
    grossMs > s.lunchThresholdMin * MIN ? s.lunchDeductMin * MIN : 0;
  const workedMs = Math.max(0, grossMs - lunchMs);
  const normMs = isWorkingDay ? s.dailyNormMin * MIN : 0;

  return {
    dayStart,
    spans,
    rawActive,
    reviewableGaps,
    removedSpans,
    isWorkingDay,
    grossMs,
    lunchMs,
    workedMs,
    normMs,
    balanceMs: workedMs - normMs,
  };
}

function tag(intervals: Interval[], provenance: Provenance): Span[] {
  return intervals.map((i) => ({ ...i, provenance }));
}

function clampAll(intervals: Interval[], win: Interval): Interval[] {
  const out: Interval[] = [];
  for (const i of intervals) {
    const c = clamp(i, win);
    if (c) out.push(c);
  }
  return mergeIntervals(out);
}

/** Round a millisecond duration to the nearest `roundingMin` minutes. */
export function roundToStep(ms: number, roundingMin: number): number {
  const step = roundingMin * MIN;
  return Math.round(ms / step) * step;
}

export interface WeekResult {
  weekStart: number;
  days: DayResult[];
  weeklyWorkedMs: number;
  weeklyNormMs: number;
  weeklyBalanceMs: number;
}

/** Assemble a Mon–Sun week. `events`/`corrections` should cover the week. */
export function computeWeek(
  weekStart: number,
  events: RawEvent[],
  corrections: Correction[],
  s: Settings,
  checkTime: number,
): WeekResult {
  const active = pairSpans(events, checkTime);
  const days: DayResult[] = [];
  let cursor = localDayStart(weekStart, s.timezone);
  for (let i = 0; i < 7; i++) {
    days.push(computeDay(active, corrections, cursor, s, i));
    cursor = addLocalDays(cursor, 1, s.timezone);
  }
  const weeklyWorkedMs = days.reduce((sum, d) => sum + d.workedMs, 0);
  return {
    weekStart,
    days,
    weeklyWorkedMs,
    weeklyNormMs: s.weeklyNormMin * MIN,
    weeklyBalanceMs: weeklyWorkedMs - s.weeklyNormMin * MIN,
  };
}
