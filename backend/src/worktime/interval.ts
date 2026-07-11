// Half-open interval algebra [start, end) over epoch-millisecond numbers.
// Pure and framework-free so it is exhaustively unit-testable.

export interface Interval {
  start: number;
  end: number;
}

/** A working interval tagged with why it counts (composition provenance). */
export type Provenance = "sensor" | "auto_bridged" | "manual_added";

export interface Span extends Interval {
  provenance: Provenance;
}

export function duration(i: Interval): number {
  return Math.max(0, i.end - i.start);
}

export function isEmpty(i: Interval): boolean {
  return i.end <= i.start;
}

/** Total covered time of a set (overlaps counted once). */
export function totalDuration(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + duration(i), 0);
}

/** Sort, drop empties, and coalesce touching/overlapping intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => !isEmpty(i))
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) {
      last.end = Math.max(last.end, i.end);
    } else {
      out.push({ start: i.start, end: i.end });
    }
  }
  return out;
}

/** Intersection of an interval with a clamp window, or null if disjoint. */
export function clamp(i: Interval, window: Interval): Interval | null {
  const start = Math.max(i.start, window.start);
  const end = Math.min(i.end, window.end);
  return end > start ? { start, end } : null;
}

/** subtract: everything in `base` not covered by any interval in `cut`. */
export function subtract(base: Interval[], cut: Interval[]): Interval[] {
  const cuts = mergeIntervals(cut);
  let pieces = mergeIntervals(base);
  for (const c of cuts) {
    const next: Interval[] = [];
    for (const p of pieces) {
      if (c.end <= p.start || c.start >= p.end) {
        next.push(p); // disjoint
        continue;
      }
      if (c.start > p.start) next.push({ start: p.start, end: c.start });
      if (c.end < p.end) next.push({ start: c.end, end: p.end });
    }
    pieces = next;
  }
  return pieces;
}

/** Gaps strictly between consecutive merged intervals. */
export function gaps(intervals: Interval[]): Interval[] {
  const merged = mergeIntervals(intervals);
  const out: Interval[] = [];
  for (let i = 1; i < merged.length; i++) {
    const prev = merged[i - 1]!;
    const cur = merged[i]!;
    if (cur.start > prev.end) out.push({ start: prev.end, end: cur.start });
  }
  return out;
}
