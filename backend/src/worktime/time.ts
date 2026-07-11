// Timezone helpers. The account timezone is authoritative for all day/week
// boundaries and rule evaluation (worktime-calculation spec). We store UTC epoch
// ms and compute local wall-clock via the IANA tz.
//
// DST note: offset is sampled at the relevant instant; the twice-yearly
// transition instants may be off by the DST delta. Acceptable for a work-time
// tracker and documented here rather than pulling in a tz library.

const MINUTE = 60_000;
const DAY_MIN = 24 * 60;

/** Offset in minutes to add to UTC to get local wall time, at instant `ts`. */
export function offsetMinutes(ts: number, tz: string): number {
  // Format the instant in the target tz, read it back as if it were UTC, and
  // diff against the real instant.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(ts)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    p.year!,
    p.month! - 1,
    p.day!,
    p.hour! === 24 ? 0 : p.hour!,
    p.minute!,
    p.second!,
  );
  return Math.round((asUtc - ts) / MINUTE);
}

/** Local wall-clock minutes since local midnight (0..1439) for `ts`. */
export function minuteOfDay(ts: number, tz: string): number {
  const localMs = ts + offsetMinutes(ts, tz) * MINUTE;
  const d = new Date(localMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Epoch ms of local midnight (00:00) of the day containing `ts`. */
export function localDayStart(ts: number, tz: string): number {
  const off = offsetMinutes(ts, tz);
  const localMs = ts + off * MINUTE;
  const d = new Date(localMs);
  const midnightLocalMs = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  );
  return midnightLocalMs - off * MINUTE;
}

/** Epoch ms of the next local midnight after the day containing `ts`. */
export function localDayEnd(ts: number, tz: string): number {
  return addLocalDays(localDayStart(ts, tz), 1, tz);
}

/** Add `n` local days to a local-midnight epoch, correcting for DST drift. */
export function addLocalDays(dayStart: number, n: number, tz: string): number {
  const approx = dayStart + n * DAY_MIN * MINUTE;
  // Re-anchor to exact local midnight in case the offset changed across a DST
  // boundary within the span.
  return localDayStart(approx + offsetCorrection(approx, tz), tz);
}

function offsetCorrection(ts: number, tz: string): number {
  // Nudge toward local noon to avoid landing exactly on a midnight that a DST
  // transition shifted, then localDayStart snaps back.
  return (12 * 60 - minuteOfDay(ts, tz)) * MINUTE;
}

/** ISO week start (Monday 00:00 local) of the week containing `ts`. */
export function localWeekStart(ts: number, tz: string): number {
  const dayStart = localDayStart(ts, tz);
  const localMs = dayStart + offsetMinutes(dayStart, tz) * MINUTE;
  const dow = new Date(localMs).getUTCDay(); // 0=Sun..6=Sat
  const backToMonday = (dow + 6) % 7; // 0 if Monday
  return addLocalDays(dayStart, -backToMonday, tz);
}

/** Weekday index 0=Mon..6=Sun for `ts` in `tz`. */
export function weekdayMon0(ts: number, tz: string): number {
  const localMs = ts + offsetMinutes(ts, tz) * MINUTE;
  return (new Date(localMs).getUTCDay() + 6) % 7;
}
