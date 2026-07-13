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

  // Daemon-side thresholds (fetched by the daemon; not used in backend calc).
  minInactivitySec: number;
  minActivitySec: number;
  heartbeatSec: number;
}

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
  minInactivitySec: 10 * 60,
  minActivitySec: 30,
  heartbeatSec: 5 * 60,
};

/** Merge stored partial settings over defaults (fail-safe for missing fields). */
export function withDefaults(partial: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
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
