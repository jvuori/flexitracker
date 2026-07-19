// Per-account settings. Authoritative for all boundary and rule calculations,
// and (the daemon-facing subset) fetched by the daemon on startup.

export interface Settings {
  timezone: string;

  // Working-hours window, local minutes since midnight.
  workdayStartMin: number;
  workdayEndMin: number;
  /** Weekdays that count toward the norm; 0=Mon .. 6=Sun. */
  workingWeekdays: number[];

  // Norms (minutes).
  dailyNormMin: number;
  weeklyNormMin: number;

  // Rules.
  /** Active spans shorter than this are dropped (seconds). */
  minActiveSec: number;
  /** In-hours gaps at/above this are private leave, not auto-bridged (seconds). */
  privateLeaveThresholdSec: number;
  /** Lunch deduction and the day length above which it applies (minutes). */
  lunchDeductMin: number;
  lunchThresholdMin: number;
  /** Half-hour transcription rounding (minutes). */
  roundingMin: number;

  /**
   * How much sustained input confirms a return to work (seconds). The one
   * daemon threshold that is a genuine preference — it separates a mouse
   * brushed in passing from someone actually sitting down. Safe to expose
   * because DAEMON_PROTOCOL.minInactivitySec caps how often transitions can
   * occur, so this cannot drive write volume on its own.
   */
  minActivitySec: number;
}

/**
 * Daemon timing that is NOT per-account. These are protocol and cost
 * parameters, not preferences, and are served to daemons over `/config` so both
 * sides read one source of truth.
 *
 * They are constants rather than validated settings because a value that cannot
 * be set cannot be misconfigured. Ingest write volume scales with both — the
 * heartbeat interval directly, the inactivity threshold through how often
 * transitions occur — so a per-account value could take the deployment outside
 * the free tier. At the 5-minute heartbeat an account uses roughly 1% of the
 * daily row-write allowance; a 1-second value would be ~350,000 writes/day and
 * breach it.
 *
 * `minInactivitySec` additionally defines the boundary between downtime that is
 * absorbed and downtime that is reconciled, which must not vary by account.
 */
export const DAEMON_PROTOCOL = {
  minInactivitySec: 10 * 60,
  heartbeatSec: 5 * 60,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  timezone: "UTC",
  workdayStartMin: 8 * 60,
  workdayEndMin: 16 * 60,
  workingWeekdays: [0, 1, 2, 3, 4],
  dailyNormMin: 7 * 60 + 30,
  weeklyNormMin: 37 * 60 + 30,
  minActiveSec: 60,
  privateLeaveThresholdSec: 2 * 60 * 60,
  lunchDeductMin: 30,
  lunchThresholdMin: 6 * 60,
  roundingMin: 30,
  minActivitySec: 30,
};

/** Keys that were once per-account settings and are now backend constants.
 *  Stripped on read so a value stored before the change cannot resurrect. */
const RETIRED_KEYS = ["heartbeatSec", "minInactivitySec"] as const;

/**
 * Merge stored partial settings over defaults (fail-safe for missing fields).
 *
 * Retired keys are dropped rather than merged: accounts written before those
 * became constants still carry them in stored JSON, and spreading that over the
 * defaults would reinstate a per-account value for a field that is no longer
 * supposed to have one.
 */
export function withDefaults(partial: Partial<Settings> | null | undefined): Settings {
  const stored = { ...(partial ?? {}) } as Record<string, unknown>;
  for (const k of RETIRED_KEYS) delete stored[k];
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
}

/** Inclusive integer range permitted for a numeric setting. */
interface NumericDomain {
  min: number;
  max: number;
  label: string;
}

/**
 * Per-field domains for the settings the UI exposes. Wide enough to admit every
 * value reachable from the UI, tight enough to catch a slipped digit or a value
 * entered in the wrong unit.
 */
const NUMERIC_DOMAINS: Partial<Record<keyof Settings, NumericDomain>> = {
  // Capped at 1439, not 1440: these are times of day, and 24:00 is not one.
  // A `<input type="time">` spans 00:00–23:59, so 1440 could not round-trip
  // through the UI — it would render blank and save back as something else.
  // The two are equivalent to `inHours()` anyway (minuteOfDay yields 0..1439),
  // so nothing expressible is lost.
  workdayStartMin: { min: 0, max: 1439, label: "office hours start" },
  workdayEndMin: { min: 0, max: 1439, label: "office hours end" },
  dailyNormMin: { min: 0, max: 1440, label: "daily norm" },
  weeklyNormMin: { min: 0, max: 10080, label: "weekly norm" },
  lunchDeductMin: { min: 0, max: 1440, label: "lunch deduction" },
  lunchThresholdMin: { min: 0, max: 1440, label: "lunch threshold" },
  privateLeaveThresholdSec: { min: 0, max: 86400, label: "private-leave threshold" },
  // Floor of 5 s so a return to work still requires deliberate input; ceiling of
  // an hour because beyond that a genuine return would never be confirmed.
  minActivitySec: { min: 5, max: 3600, label: "activity confirmation threshold" },
};

/**
 * Validate a settings patch at the write boundary and return it normalised.
 * Fail-fast: throws on the first violation.
 *
 * Persisting settings marks every day dirty for recomputation, so a value that
 * is accepted here silently reshapes the account's whole history — rejection
 * must happen before the write, not on read.
 *
 * Cross-field rules are checked against the settings as they would stand AFTER
 * the write (`current` merged with `patch`), never against the patch alone: a
 * patch may carry only one side of a pair, and checking it in isolation would
 * admit exactly the incoherent combinations these rules exist to reject.
 */
export function normalizeSettingsPatch(
  patch: Partial<Settings>,
  current: Settings,
): Partial<Settings> {
  const out: Partial<Settings> = { ...patch };

  // Protocol timing is a backend constant. Silently dropping an attempt to set
  // it keeps the write itself valid — the caller simply cannot move the value.
  for (const k of RETIRED_KEYS) delete (out as Record<string, unknown>)[k];

  if (out.timezone !== undefined) {
    if (typeof out.timezone !== "string" || out.timezone === "") {
      throw new Error("timezone must be a non-empty string");
    }
    try {
      new Intl.DateTimeFormat("en", { timeZone: out.timezone });
    } catch {
      throw new Error(`timezone is not a known timezone identifier: ${out.timezone}`);
    }
  }

  for (const [key, domain] of Object.entries(NUMERIC_DOMAINS) as [
    keyof Settings,
    NumericDomain,
  ][]) {
    const v = out[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isInteger(v)) {
      throw new Error(`${domain.label} must be an integer, got ${JSON.stringify(v)}`);
    }
    if (v < domain.min || v > domain.max) {
      throw new Error(`${domain.label} must be between ${domain.min} and ${domain.max}, got ${v}`);
    }
  }

  if (out.workingWeekdays !== undefined) {
    out.workingWeekdays = normalizeWorkingWeekdays(out.workingWeekdays);
  }

  // Cross-field coherence, against the post-write settings. Each message names
  // both operands and their effective values, so a partial patch rejected
  // against a stored counterpart is diagnosable from the message alone.
  const merged = { ...current, ...out };
  if (merged.workdayStartMin >= merged.workdayEndMin) {
    throw new Error(
      `office hours start (${merged.workdayStartMin}) must be earlier than office hours end (${merged.workdayEndMin})`,
    );
  }
  if (merged.dailyNormMin > merged.weeklyNormMin) {
    throw new Error(
      `daily norm (${merged.dailyNormMin}) must not exceed weekly norm (${merged.weeklyNormMin})`,
    );
  }
  if (merged.lunchDeductMin > merged.lunchThresholdMin) {
    throw new Error(
      `lunch deduction (${merged.lunchDeductMin}) must not exceed lunch threshold (${merged.lunchThresholdMin})`,
    );
  }

  return out;
}

/**
 * Validate and normalise a `workingWeekdays` value at the ingest boundary.
 * Fail-fast: throws on anything that is not an array of integers in 0..6.
 * Returns the values deduplicated and sorted. An empty array is permitted
 * (an account with no fixed working days — every day is then credit-only).
 */
export function normalizeWorkingWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("workingWeekdays must be an array");
  }
  for (const d of value) {
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) {
      throw new Error("workingWeekdays entries must be integers in 0..6");
    }
  }
  return [...new Set(value as number[])].sort((a, b) => a - b);
}
