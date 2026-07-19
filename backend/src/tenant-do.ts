import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import type { EventBatch } from "./schema";
import { withDefaults, normalizeSettingsPatch } from "./worktime/settings";
import type { Settings } from "./worktime/settings";
import { localDayStart, localWeekStart, addLocalDays, weekdayMon0 } from "./worktime/time";
import {
  computeDay,
  computeWeek,
  pairSpans,
  type Correction,
  type CorrectionKind,
  type RawEvent,
  type WeekResult,
} from "./worktime/worktime";

/** Raw events are kept for this window (= the edit window); then pruned. */
const EDIT_WINDOW_DAYS = 120;
const DAY_MS = 86_400_000;

export interface StatusView {
  state: "active" | "idle" | "unknown";
  since: number | null;
  machineId: string | null;
  hostname: string | null;
}

/**
 * One TenantDO per account (addressed by internal account_id). Its embedded
 * SQLite database is the tenant boundary. Public methods are the RPC surface the
 * Worker calls after resolving identity.
 */
export class TenantDO extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.bootstrapSchema();
  }

  private bootstrapSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS event (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id  TEXT    NOT NULL,
        ts          INTEGER NOT NULL,
        kind        TEXT    NOT NULL,
        received_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS event_ts ON event (ts);

      CREATE TABLE IF NOT EXISTS batch_seen (
        machine_id TEXT NOT NULL,
        batch_seq  INTEGER NOT NULL,
        PRIMARY KEY (machine_id, batch_seq)
      );

      CREATE TABLE IF NOT EXISTS machine (
        machine_id     TEXT PRIMARY KEY,
        hostname       TEXT,
        os             TEXT,
        first_seen     INTEGER,
        last_seen      INTEGER,
        last_batch_seq INTEGER NOT NULL DEFAULT -1
      );

      CREATE TABLE IF NOT EXISTS correction (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        kind       TEXT    NOT NULL,
        start_ts   INTEGER NOT NULL,
        end_ts     INTEGER NOT NULL,
        note       TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_rollup (
        day_start      INTEGER PRIMARY KEY,
        worked_ms      INTEGER NOT NULL,
        gross_ms       INTEGER NOT NULL,
        lunch_ms       INTEGER NOT NULL,
        norm_ms        INTEGER NOT NULL,
        balance_ms     INTEGER NOT NULL,
        is_working_day INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        day_start  INTEGER NOT NULL,
        start_ts   INTEGER NOT NULL,
        end_ts     INTEGER NOT NULL,
        provenance TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS session_day ON session (day_start);

      CREATE TABLE IF NOT EXISTS dirty_day (day_start INTEGER PRIMARY KEY);

      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `);
  }

  // ---- settings ----------------------------------------------------------

  getSettings(): Settings {
    const row = this.sql.exec("SELECT v FROM meta WHERE k = 'settings'").toArray()[0] as
      | { v: string }
      | undefined;
    return withDefaults(row ? (JSON.parse(row.v) as Partial<Settings>) : null);
  }

  putSettings(patch: Partial<Settings>): Settings {
    const current = this.getSettings();
    // Validate before the merge and before markAllDaysDirty(): a rejected write
    // must leave settings untouched and mark nothing dirty.
    const clean = normalizeSettingsPatch(patch, current);
    const merged = { ...current, ...clean };
    this.sql.exec(
      "INSERT INTO meta (k, v) VALUES ('settings', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      JSON.stringify(merged),
    );
    // A timezone or rule change can reshape every day.
    this.markAllDaysDirty();
    return merged;
  }

  // ---- ingest ------------------------------------------------------------

  /** Idempotent on (machine_id, batch_seq). Returns whether it was a duplicate. */
  ingest(machineId: string, batch: EventBatch): { duplicate: boolean } {
    const seen = this.sql
      .exec(
        "SELECT 1 FROM batch_seen WHERE machine_id = ? AND batch_seq = ?",
        machineId,
        batch.batch_seq,
      )
      .toArray();
    if (seen.length > 0) return { duplicate: true };

    const now = Date.now();
    const tz = this.getSettings().timezone;
    this.upsertMachine(machineId, batch, now);

    const dirtyDays = new Set<number>();
    for (const e of batch.events) {
      this.sql.exec(
        "INSERT INTO event (machine_id, ts, kind, received_at) VALUES (?, ?, ?, ?)",
        machineId,
        e.ts,
        e.kind,
        now,
      );
      dirtyDays.add(localDayStart(e.ts, tz));
    }
    for (const d of dirtyDays) this.markDirty(d);

    this.sql.exec(
      "INSERT INTO batch_seen (machine_id, batch_seq) VALUES (?, ?)",
      machineId,
      batch.batch_seq,
    );
    this.ensureAlarm();
    return { duplicate: false };
  }

  private upsertMachine(machineId: string, batch: EventBatch, now: number): void {
    const host = batch.machine?.hostname ?? null;
    const os = batch.machine?.os ?? null;
    this.sql.exec(
      `INSERT INTO machine (machine_id, hostname, os, first_seen, last_seen, last_batch_seq)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(machine_id) DO UPDATE SET
         hostname = COALESCE(excluded.hostname, machine.hostname),
         os       = COALESCE(excluded.os, machine.os),
         last_seen = excluded.last_seen,
         last_batch_seq = MAX(machine.last_batch_seq, excluded.last_batch_seq)`,
      machineId,
      host,
      os,
      now,
      now,
      batch.batch_seq,
    );
  }

  // ---- corrections -------------------------------------------------------

  addCorrection(kind: CorrectionKind, start: number, end: number, note: string | null): number {
    // A holiday is a full-day marker: anchor it to the local day containing
    // `start` regardless of the span the client sent, so it is unambiguously
    // day-scoped and covers exactly one account-timezone day.
    if (kind === "holiday") {
      const settings = this.getSettings();
      const tz = settings.timezone;
      const dayStart = localDayStart(start, tz);
      // A non-working day is already off; marking it a holiday is meaningless, so
      // reject it rather than store a no-op holiday.
      if (!settings.workingWeekdays.includes(weekdayMon0(dayStart, tz))) {
        throw new Error("cannot mark a non-working day as a holiday");
      }
      start = dayStart;
      end = addLocalDays(dayStart, 1, tz);
    }
    if (end <= start) throw new Error("correction end must be after start");
    this.sql.exec(
      "INSERT INTO correction (kind, start_ts, end_ts, note, created_at) VALUES (?, ?, ?, ?, ?)",
      kind,
      start,
      end,
      note,
      Date.now(),
    );
    const id = Number(
      (this.sql.exec("SELECT last_insert_rowid() AS id").one() as { id: number }).id,
    );
    this.markDaysInRangeDirty(start, end);
    this.ensureAlarm();
    return id;
  }

  deleteCorrection(id: number): void {
    const row = this.sql
      .exec("SELECT start_ts, end_ts FROM correction WHERE id = ?", id)
      .toArray()[0] as { start_ts: number; end_ts: number } | undefined;
    if (!row) return;
    this.sql.exec("DELETE FROM correction WHERE id = ?", id);
    this.markDaysInRangeDirty(row.start_ts, row.end_ts);
    this.ensureAlarm();
  }

  private loadCorrections(from: number, to: number): Correction[] {
    return (
      this.sql
        .exec(
          "SELECT id, kind, start_ts, end_ts FROM correction WHERE end_ts > ? AND start_ts < ?",
          from,
          to,
        )
        .toArray() as { id: number; kind: CorrectionKind; start_ts: number; end_ts: number }[]
    ).map((r) => ({ id: r.id, kind: r.kind, start: r.start_ts, end: r.end_ts }));
  }

  // ---- reads -------------------------------------------------------------

  getWeek(weekStart: number, checkTime = Date.now()): WeekResult {
    const s = this.getSettings();
    const start = localDayStart(weekStart, s.timezone);
    const end = addLocalDays(start, 7, s.timezone);
    const events = this.loadEvents(start, end);
    const corrections = this.loadCorrections(start, end);
    const week = computeWeek(start, events, corrections, s, checkTime);

    // For days whose raw events were pruned but that have a sealed rollup, use
    // the rollup numbers (tiered retention).
    const daysWithRaw = new Set(events.map((e) => localDayStart(e.ts, s.timezone)));
    for (const day of week.days) {
      if (daysWithRaw.has(day.dayStart)) continue;
      const roll = this.sql
        .exec("SELECT * FROM daily_rollup WHERE day_start = ?", day.dayStart)
        .toArray()[0] as
        | {
            worked_ms: number;
            gross_ms: number;
            lunch_ms: number;
            norm_ms: number;
            balance_ms: number;
          }
        | undefined;
      if (roll) {
        day.workedMs = roll.worked_ms;
        day.grossMs = roll.gross_ms;
        day.lunchMs = roll.lunch_ms;
        day.normMs = roll.norm_ms;
        day.balanceMs = roll.balance_ms;
      }
    }
    week.weeklyWorkedMs = week.days.reduce((n, d) => n + d.workedMs, 0);
    week.weeklyBalanceMs = week.weeklyWorkedMs - week.weeklyNormMs;
    return week;
  }

  /** Week relative to the current one (0 = this week, -1 = last week, …). */
  weekView(offset: number, now = Date.now()): WeekResult {
    const s = this.getSettings();
    const start = addLocalDays(localWeekStart(now, s.timezone), offset * 7, s.timezone);
    return this.getWeek(start, now);
  }

  listMachines(): {
    machine_id: string;
    hostname: string | null;
    os: string | null;
    first_seen: number;
    last_seen: number;
  }[] {
    return this.sql
      .exec(
        "SELECT machine_id, hostname, os, first_seen, last_seen FROM machine ORDER BY last_seen DESC",
      )
      .toArray() as unknown as {
      machine_id: string;
      hostname: string | null;
      os: string | null;
      first_seen: number;
      last_seen: number;
    }[];
  }

  getStatus(now = Date.now()): StatusView {
    const last = this.sql
      .exec("SELECT machine_id, ts, kind FROM event ORDER BY ts DESC LIMIT 1")
      .toArray()[0] as { machine_id: string; ts: number; kind: string } | undefined;
    if (!last) return { state: "unknown", since: null, machineId: null, hostname: null };

    const s = this.getSettings();
    const recent = this.loadEvents(now - 2 * DAY_MS, now + DAY_MS);
    const spans = pairSpans(recent, now);
    const openStart = spans.length > 0 ? spans[spans.length - 1]! : null;
    const active = openStart !== null && openStart.end >= now - s.heartbeatSec * 1000 * 3;

    const host = this.sql
      .exec("SELECT hostname FROM machine WHERE machine_id = ?", last.machine_id)
      .toArray()[0] as { hostname: string | null } | undefined;

    return {
      state: active ? "active" : "idle",
      since: active ? openStart!.start : last.ts,
      machineId: last.machine_id,
      hostname: host?.hostname ?? null,
    };
  }

  private loadEvents(from: number, to: number): RawEvent[] {
    return this.sql
      .exec(
        "SELECT machine_id, ts, kind FROM event WHERE ts >= ? AND ts < ? ORDER BY ts ASC",
        from,
        to,
      )
      .toArray() as unknown as RawEvent[];
  }

  // ---- maintenance (alarm) ----------------------------------------------

  override async alarm(): Promise<void> {
    this.runMaintenance(Date.now());
    // Re-arm for the next day; ensureAlarm sets a sooner one if work appears.
    this.ctx.storage.setAlarm(Date.now() + DAY_MS);
  }

  /** Test hook (QA only): wipe ALL of this tenant's data back to empty. */
  reset(): void {
    for (const t of [
      "event",
      "batch_seen",
      "machine",
      "correction",
      "daily_rollup",
      "session",
      "dirty_day",
      "meta",
    ]) {
      this.sql.exec(`DELETE FROM ${t}`);
    }
  }

  /** Dev/test hook: run maintenance now and report what was materialized. */
  runMaintenanceNow(): { rollups: number; sessions: number } {
    this.runMaintenance(Date.now());
    const rollups = Number(
      (this.sql.exec("SELECT count(*) AS n FROM daily_rollup").one() as { n: number }).n,
    );
    const sessions = Number(
      (this.sql.exec("SELECT count(*) AS n FROM session").one() as { n: number }).n,
    );
    return { rollups, sessions };
  }

  /** Seal elapsed dirty days into rollups/sessions, then prune old raw. */
  runMaintenance(now: number): void {
    const s = this.getSettings();
    const dirty = this.sql.exec("SELECT day_start FROM dirty_day").toArray() as {
      day_start: number;
    }[];
    for (const { day_start } of dirty) {
      const dayEnd = addLocalDays(day_start, 1, s.timezone);
      if (dayEnd > now) continue; // not fully elapsed yet — seal later
      this.sealDay(day_start, s, now);
      this.sql.exec("DELETE FROM dirty_day WHERE day_start = ?", day_start);
    }
    const cutoff = now - EDIT_WINDOW_DAYS * DAY_MS;
    this.sql.exec("DELETE FROM event WHERE ts < ?", cutoff);
  }

  private sealDay(dayStart: number, s: Settings, now: number): void {
    const dayEnd = addLocalDays(dayStart, 1, s.timezone);
    const events = this.loadEvents(dayStart - DAY_MS, dayEnd + DAY_MS);
    const active = pairSpans(events, now);
    const day = computeDay(
      active,
      this.loadCorrections(dayStart, dayEnd),
      dayStart,
      s,
      weekdayMon0(dayStart, s.timezone),
    );

    this.sql.exec(
      `INSERT INTO daily_rollup (day_start, worked_ms, gross_ms, lunch_ms, norm_ms, balance_ms, is_working_day)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day_start) DO UPDATE SET
         worked_ms = excluded.worked_ms, gross_ms = excluded.gross_ms,
         lunch_ms = excluded.lunch_ms, norm_ms = excluded.norm_ms,
         balance_ms = excluded.balance_ms, is_working_day = excluded.is_working_day`,
      dayStart,
      day.workedMs,
      day.grossMs,
      day.lunchMs,
      day.normMs,
      day.balanceMs,
      day.isWorkingDay ? 1 : 0,
    );
    this.sql.exec("DELETE FROM session WHERE day_start = ?", dayStart);
    for (const span of day.spans) {
      this.sql.exec(
        "INSERT INTO session (day_start, start_ts, end_ts, provenance) VALUES (?, ?, ?, ?)",
        dayStart,
        span.start,
        span.end,
        span.provenance,
      );
    }
  }

  // ---- dirty tracking ----------------------------------------------------

  private markDirty(dayStart: number): void {
    this.sql.exec("INSERT OR IGNORE INTO dirty_day (day_start) VALUES (?)", dayStart);
  }

  private markDaysInRangeDirty(from: number, to: number): void {
    const tz = this.getSettings().timezone;
    let d = localDayStart(from, tz);
    while (d < to) {
      this.markDirty(d);
      d = addLocalDays(d, 1, tz);
    }
  }

  private markAllDaysDirty(): void {
    const range = this.sql
      .exec("SELECT MIN(ts) AS lo, MAX(ts) AS hi FROM event")
      .toArray()[0] as { lo: number | null; hi: number | null };
    if (range.lo === null || range.hi === null) return;
    this.markDaysInRangeDirty(range.lo, range.hi + DAY_MS);
  }

  private ensureAlarm(): void {
    void this.ctx.storage.getAlarm().then((existing) => {
      if (existing === null) this.ctx.storage.setAlarm(Date.now() + 60_000);
    });
  }
}
