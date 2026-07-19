// The heart of the system: turn raw transitions + corrections into per-day
// working time, with presence-based bridging and provenance-tagged composition.
// Pure and framework-free (worktime-calculation + manual-corrections specs).

import type { EventKind } from "../schema";
import { clamp, duration, gaps, mergeIntervals, subtract, totalDuration } from "./interval";
import type { Interval, Period, PeriodType, Provenance, Span } from "./interval";
import { DAEMON_PROTOCOL } from "./settings";
import type { Settings } from "./settings";
import { localDayStart, minuteOfDay, addLocalDays } from "./time";

const MIN = 60_000;

export interface RawEvent {
  machine_id: string;
  ts: number;
  kind: EventKind;
}

export type CorrectionKind = "add_work" | "remove_work" | "holiday";
export interface Correction {
  kind: CorrectionKind;
  start: number;
  end: number;
  /** Row id, when the correction was loaded from storage (enables undo). */
  id?: number;
}

export interface DayResult {
  dayStart: number;
  /** Working intervals after composition, each tagged with why it counts. */
  spans: Span[];
  /**
   * Complete, gap-free partition of the day: every instant belongs to exactly
   * one typed period (counted or not, plain idle gaps included). This is the
   * selectable surface the UI acts on — every action targets one period.
   */
  periods: Period[];
  /**
   * Envelope of the office day: from the natural start of the first presence
   * period overlapping the configured office window to the natural end of the
   * last. `null` when no presence overlaps the window. Drives "mark whole day
   * as work"; the office-window boundary times are never used as endpoints.
   */
  officeEnvelope: Interval | null;
  /** Raw sensor-active intervals in the day — shown even when auto-bridged. */
  rawActive: Interval[];
  /** In-hours gaps excluded as private leave and available to reclassify. */
  reviewableGaps: Interval[];
  /** Measured/bridged time excluded by a remove_work and not re-added. */
  removedSpans: Interval[];
  isWorkingDay: boolean;
  /** Day is marked a holiday: its norm is zeroed (credit-only), like a day off. */
  isHoliday: boolean;
  /** Ids of the holiday correction(s) covering the day, for clearing it. */
  holidayCorrectionIds: number[];
  grossMs: number; // sum of spans before lunch
  lunchMs: number; // deduction applied
  workedMs: number; // gross - lunch
  normMs: number;
  balanceMs: number; // worked - norm
}

/**
 * How far past a machine's last liveness evidence an open span may still run.
 *
 * Three heartbeat intervals: enough to ride out jitter and a dropped batch
 * without truncating live work, small enough that a machine which never returns
 * cannot accumulate meaningful phantom time. It deliberately does not try to
 * cover a network outage — no finite grace can, since outages are unbounded —
 * that case is handled by recompute when the buffered events arrive.
 */
export function graceMs(): number {
  return 3 * DAEMON_PROTOCOL.heartbeatSec * 1000;
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

/** Does this event kind prove the machine was alive (and open a span)? */
export function isPresence(kind: EventKind): boolean {
  return PRESENCE.has(kind);
}

/** A span whose end was inferred from the bound rather than observed. */
export interface ProvisionalSpan extends Interval {
  /** Last time this machine proved it was alive (any presence event). */
  lastAlive: number;
  /**
   * The machine is still being seen, so this span's end is still advancing.
   * The UI gates edit actions on this rather than on provisionality itself: a
   * machine that never returns leaves a permanently provisional span, and
   * withholding corrections from it would make it impossible to fix.
   */
  growing: boolean;
}

export interface PairedSpans {
  active: Interval[];
  provisional: ProvisionalSpan[];
}

/**
 * Pair transitions into active intervals, per machine, then union across
 * machines (the person is working if any machine is active).
 *
 * An orphan open span is NOT counted to `checkTime` — that is what let a
 * machine shut down on Friday fill Saturday and Sunday as well. It ends at
 * `min(checkTime, lastAlive + graceMs)`, where `lastAlive` is the last presence
 * event (heartbeats included) from that machine.
 *
 * The bound is deliberately provisional and derived at read time, never written
 * back: absence of heartbeats cannot distinguish "machine is off" from "machine
 * is working behind a broken network", so when buffered events arrive later,
 * recomputation simply supersedes it. An explicit closing event always wins.
 */
export function pairSpans(
  events: RawEvent[],
  checkTime: number,
  graceMs: number,
): PairedSpans {
  const byMachine = new Map<string, RawEvent[]>();
  for (const e of events) {
    const list = byMachine.get(e.machine_id) ?? [];
    list.push(e);
    byMachine.set(e.machine_id, list);
  }

  const all: Interval[] = [];
  const provisional: ProvisionalSpan[] = [];
  for (const list of byMachine.values()) {
    list.sort((a, b) => a.ts - b.ts);
    let open: number | null = null;
    let lastAlive = 0;
    for (const e of list) {
      if (PRESENCE.has(e.kind)) {
        if (open === null) open = e.ts;
        // Any presence event proves the machine was running at that moment;
        // heartbeats exist precisely to keep this advancing during a long span.
        lastAlive = Math.max(lastAlive, e.ts);
      } else if (ABSENCE.has(e.kind)) {
        if (open !== null) {
          if (e.ts > open) all.push({ start: open, end: e.ts });
          open = null;
        }
      }
    }
    if (open !== null) {
      // A live machine's lastAlive is at most one heartbeat old, so its bound
      // lands in the future and checkTime governs — an active session in
      // progress is untouched. Only a machine that has gone quiet is truncated.
      const bound = lastAlive + graceMs;
      const end = Math.min(checkTime, bound);
      if (end > open) {
        all.push({ start: open, end });
        provisional.push({ start: open, end, lastAlive, growing: bound >= checkTime });
      }
    }
  }
  return { active: mergeIntervals(all), provisional };
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
  provisionalSpans: ProvisionalSpan[] = [],
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

  // Raw corrections (with ids) drive provenance attribution; the merged
  // interval sets below drive the interval math.
  const addCorr = corrections.filter((c) => c.kind === "add_work");
  const removeCorr = corrections.filter((c) => c.kind === "remove_work");
  const adds = clampAll(addCorr, win);
  const removes = clampAll(removeCorr, win);

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

  // The complete partition: the counted/excluded/review layers above (pairwise
  // disjoint by construction), plus every remaining instant as a plain gap.
  const parts: Period[] = [
    ...toPeriods(subtract(sensor, removes), "sensor"),
    ...toPeriods(subtract(bridged, removes), "auto_bridged"),
    ...toPeriods(manualAdded, "manual_added", addCorr),
    ...toPeriods(reviewableGaps, "review"),
    ...toPeriods(removedSpans, "removed", removeCorr),
  ];
  const partitionCovered = mergeIntervals(parts.map((p) => ({ start: p.start, end: p.end })));
  parts.push(...toPeriods(subtract([win], partitionCovered), "gap"));

  // Mark the sensor periods whose end was inferred rather than observed. The
  // uncertainty belongs to the whole period, not just its tail: without a
  // closing event the period has no confirmed end at all, and its extent moves
  // as evidence arrives.
  for (const p of parts) {
    if (p.type !== "sensor") continue;
    const prov = provisionalSpans.find((v) => p.start < v.end && p.end > v.start);
    if (prov) {
      p.provisional = true;
      p.lastAlive = prov.lastAlive;
      p.growing = prov.growing;
    }
  }
  const periods = parts.sort((a, b) => a.start - b.start);

  // Office-day envelope: presence spans overlapping the configured window
  // define belonging; the envelope spans their natural boundaries (never the
  // window times themselves). Drives the "mark whole day as work" fill.
  const officeStart = dayStart + s.workdayStartMin * MIN;
  const officeEnd = dayStart + s.workdayEndMin * MIN;
  const belonging = sensor.filter((sp) => sp.end > officeStart && sp.start < officeEnd);
  const officeEnvelope: Interval | null = belonging.length
    ? {
        start: Math.min(...belonging.map((b) => b.start)),
        end: Math.max(...belonging.map((b) => b.end)),
      }
    : null;

  const grossMs = totalDuration(spans);
  const isWorkingDay = s.workingWeekdays.includes(weekdayMon0);
  // Holiday markers are full-day corrections; they carry no interval math (they
  // never enter the add/remove filters above) and only zero the day's norm.
  const holidayCorr = corrections.filter(
    (c) => c.kind === "holiday" && c.end > win.start && c.start < win.end,
  );
  const isHoliday = holidayCorr.length > 0;
  const holidayCorrectionIds = holidayCorr
    .filter((c) => c.id !== undefined)
    .map((c) => c.id as number);
  const lunchMs =
    grossMs > s.lunchThresholdMin * MIN ? s.lunchDeductMin * MIN : 0;
  const workedMs = Math.max(0, grossMs - lunchMs);
  const normMs = isWorkingDay && !isHoliday ? s.dailyNormMin * MIN : 0;

  return {
    dayStart,
    spans,
    periods,
    officeEnvelope,
    rawActive,
    reviewableGaps,
    removedSpans,
    isWorkingDay,
    isHoliday,
    holidayCorrectionIds,
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

/**
 * Tag intervals as partition periods. For manual/removed periods, attribute the
 * ids of the corrections (with ids) whose original span overlaps each piece, so
 * a single correction can be undone precisely.
 */
function toPeriods(intervals: Interval[], type: PeriodType, source?: Correction[]): Period[] {
  return intervals.map((i) => {
    if (!source) return { ...i, type };
    const correctionIds = source
      .filter((c) => c.id !== undefined && c.end > i.start && c.start < i.end)
      .map((c) => c.id as number);
    return { ...i, type, correctionIds };
  });
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
  const { active, provisional } = pairSpans(events, checkTime, graceMs());
  const days: DayResult[] = [];
  let cursor = localDayStart(weekStart, s.timezone);
  for (let i = 0; i < 7; i++) {
    days.push(computeDay(active, corrections, cursor, s, i, provisional));
    cursor = addLocalDays(cursor, 1, s.timezone);
  }
  const weeklyWorkedMs = days.reduce((sum, d) => sum + d.workedMs, 0);
  // Each holiday on an otherwise-working weekday gives back one daily norm, so a
  // week of holidays nets to zero instead of showing a full-week deficit. A
  // holiday on an already-non-working day carried no norm, so it changes nothing.
  const holidayReliefDays = days.filter((d) => d.isHoliday && d.isWorkingDay).length;
  const weeklyNormMs = Math.max(
    0,
    s.weeklyNormMin * MIN - holidayReliefDays * s.dailyNormMin * MIN,
  );
  return {
    weekStart,
    days,
    weeklyWorkedMs,
    weeklyNormMs,
    weeklyBalanceMs: weeklyWorkedMs - weeklyNormMs,
  };
}
