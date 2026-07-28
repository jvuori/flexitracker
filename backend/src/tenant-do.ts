import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import type { EventBatch, EventKind } from "./schema";
import { partitionByLedgerRole, type MachineRole } from "./registry";
import { clamp, duration, type Interval } from "./worktime/interval";
import { withDefaults, normalizeSettingsPatch } from "./worktime/settings";
import type { Settings } from "./worktime/settings";
import { localDayStart, localWeekStart, addLocalDays, weekdayMon0 } from "./worktime/time";
import {
  computeDay,
  computeWeek,
  graceMs,
  isPresence,
  pairSpans,
  type Correction,
  type CorrectionKind,
  type Ledger,
  type ProvisionalSpan,
  type RawEvent,
  type WeekResult,
} from "./worktime/worktime";

/**
 * One machine's own raw activity for a day — display-only. Never fed back
 * into `computeDay`/corrections, so machine identity never leaks into the
 * composed partition (see machine-activity-lanes design.md D2).
 */
export interface MachineActivity {
  machineId: string;
  label: string | null;
  active: Interval[];
  provisional: ProvisionalSpan[];
}

export type DayWithActivity = WeekResult["days"][number] & { machineActivity: MachineActivity[] };
export type WeekResultWithActivity = Omit<WeekResult, "days"> & { days: DayWithActivity[] };

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
        ledger     TEXT    NOT NULL DEFAULT 'work' CHECK(ledger IN ('work','personal')),
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_rollup (
        day_start          INTEGER PRIMARY KEY,
        worked_ms          INTEGER NOT NULL,
        gross_ms           INTEGER NOT NULL,
        lunch_ms           INTEGER NOT NULL,
        norm_ms            INTEGER NOT NULL,
        balance_ms         INTEGER NOT NULL,
        is_working_day     INTEGER NOT NULL,
        personal_worked_ms INTEGER NOT NULL DEFAULT 0,
        personal_gross_ms  INTEGER NOT NULL DEFAULT 0
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
    this.migrateCorrectionLedger();
    this.migrateDailyRollupPersonal();
  }

  /** Add `ledger` to a pre-existing `correction` table (SQLite has no ADD
   *  COLUMN IF NOT EXISTS). Every pre-existing correction predates ledgers and
   *  meant exactly what a work-ledger correction means now. */
  private migrateCorrectionLedger(): void {
    const cols = this.sql.exec("PRAGMA table_info(correction)").toArray() as { name: string }[];
    if (cols.some((c) => c.name === "ledger")) return;
    this.sql.exec("ALTER TABLE correction ADD COLUMN ledger TEXT NOT NULL DEFAULT 'work'");
  }

  /** Add the personal-ledger rollup columns to a pre-existing `daily_rollup`
   *  table. Pre-existing sealed days simply have no personal-ledger figures
   *  (defaulting to 0) — there was no personal ledger to seal at the time. */
  private migrateDailyRollupPersonal(): void {
    const cols = this.sql.exec("PRAGMA table_info(daily_rollup)").toArray() as { name: string }[];
    if (cols.some((c) => c.name === "personal_worked_ms")) return;
    this.sql.exec("ALTER TABLE daily_rollup ADD COLUMN personal_worked_ms INTEGER NOT NULL DEFAULT 0");
    this.sql.exec("ALTER TABLE daily_rollup ADD COLUMN personal_gross_ms INTEGER NOT NULL DEFAULT 0");
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
    const s = this.getSettings();
    const tz = s.timezone;
    this.upsertMachine(machineId, batch, now);

    // How far this machine's open span was assumed to reach BEFORE this batch.
    // A late-arriving event changes that extent, and because the bound can push
    // an assumed end past midnight, the days needing recomputation are not
    // always the days the batch itself mentions. Read it before inserting.
    const priorEnd = this.assumedOpenEnd(machineId);

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

    // Widen to every day the span covered under either interpretation. Marking
    // only each event's own day would re-seal the day the idle landed on and
    // leave the inflated days beyond it sealed and wrong — the correction would
    // be invisible exactly where the error was.
    const newEnd = this.assumedOpenEnd(machineId);
    const spanEnd = Math.max(priorEnd ?? 0, newEnd ?? 0);
    if (spanEnd > 0 && dirtyDays.size > 0) {
      const from = Math.min(...dirtyDays);
      for (let d = from; d <= localDayStart(spanEnd, tz); d = addLocalDays(d, 1, tz)) {
        dirtyDays.add(d);
      }
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

  /**
   * How far this machine's open span is assumed to reach, or null when its span
   * is closed. Only the machine's most recent event matters: if it is a
   * presence event the span is open, and that event is by definition its latest
   * liveness evidence, so the assumed end is that timestamp plus the grace.
   *
   * Deliberately not capped at `now` — the wider value is what dirty-marking
   * needs, and one indexed lookup keeps this cheap enough to run per ingest.
   */
  private assumedOpenEnd(machineId: string): number | null {
    const last = this.sql
      .exec(
        "SELECT ts, kind FROM event WHERE machine_id = ? ORDER BY ts DESC LIMIT 1",
        machineId,
      )
      .toArray()[0] as { ts: number; kind: EventKind } | undefined;
    if (!last || !isPresence(last.kind)) return null;
    return last.ts + graceMs();
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

  addCorrection(
    kind: CorrectionKind,
    start: number,
    end: number,
    note: string | null,
    ledger: Ledger = "work",
  ): number {
    // A holiday is a full-day marker: anchor it to the local day containing
    // `start` regardless of the span the client sent, so it is unambiguously
    // day-scoped and covers exactly one account-timezone day. It is also a
    // work-ledger-only concept (it zeroes a norm that only the work ledger
    // has), so it forces its ledger regardless of what was passed.
    if (kind === "holiday") {
      ledger = "work";
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
      "INSERT INTO correction (kind, start_ts, end_ts, note, ledger, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      kind,
      start,
      end,
      note,
      ledger,
      Date.now(),
    );
    const id = Number(
      (this.sql.exec("SELECT last_insert_rowid() AS id").one() as { id: number }).id,
    );
    this.markDaysInRangeDirty(start, end);
    this.ensureAlarm();
    return id;
  }

  /**
   * "Move to other side": exclude a span from the ledger currently being
   * viewed and include it in the other, as one atomic user gesture. Not a new
   * correction kind — it composes the same `remove_work`/`add_work` primitives
   * `addCorrection` already provides, now ledger-scoped, so the destination
   * ledger's precedence/provenance math is entirely unchanged.
   */
  moveToOtherLedger(start: number, end: number, fromLedger: Ledger): { removedId: number; addedId: number } {
    const toLedger: Ledger = fromLedger === "work" ? "personal" : "work";
    const removedId = this.addCorrection("remove_work", start, end, null, fromLedger);
    const addedId = this.addCorrection("add_work", start, end, null, toLedger);
    return { removedId, addedId };
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

  private loadCorrections(from: number, to: number, ledger: Ledger): Correction[] {
    return (
      this.sql
        .exec(
          "SELECT id, kind, start_ts, end_ts, ledger FROM correction WHERE end_ts > ? AND start_ts < ? AND ledger = ?",
          from,
          to,
          ledger,
        )
        .toArray() as { id: number; kind: CorrectionKind; start_ts: number; end_ts: number; ledger: Ledger }[]
    ).map((r) => ({ id: r.id, kind: r.kind, start: r.start_ts, end: r.end_ts, ledger: r.ledger }));
  }

  // ---- role resolution -----------------------------------------------------

  /**
   * Machine role is registry-owned identity data (like `label`), not DO-local
   * ingest telemetry — but the nightly alarm has no caller to hand it a
   * pre-fetched role map (an alarm fires with no request behind it), and this
   * DO's own `env` already carries the same `REGISTRY` D1 binding the Worker
   * uses. So the DO resolves roles itself, by `machine_id` — which needs no
   * `account_id` (machine_id is already globally unique), keeping both the
   * live-read and the seal-time path self-sufficient and identical.
   */
  private async machineRoles(machineIds: string[]): Promise<Map<string, MachineRole>> {
    if (machineIds.length === 0) return new Map();
    const placeholders = machineIds.map(() => "?").join(",");
    const rows = await this.env.REGISTRY.prepare(
      `SELECT machine_id, role FROM machine WHERE machine_id IN (${placeholders})`,
    )
      .bind(...machineIds)
      .all<{ machine_id: string; role: MachineRole }>();
    return new Map(rows.results.map((r) => [r.machine_id, r.role]));
  }

  /** Restrict `events` to the machines currently classified as `ledger`. An
   *  unknown machine_id (should not happen once every machine has a registry
   *  row) defaults to `work` — the safe default that cannot silently inflate
   *  a personal total. */
  private async filterByLedgerRole(events: RawEvent[], ledger: Ledger): Promise<RawEvent[]> {
    const machineIds = [...new Set(events.map((e) => e.machine_id))];
    const roles = await this.machineRoles(machineIds);
    return events.filter((e) => (roles.get(e.machine_id) ?? "work") === ledger);
  }

  /** Labels for a set of machine ids, for the per-machine raw activity lanes.
   *  Mirrors `machineRoles` — same registry table, same machine_id-only
   *  lookup, no account_id needed. */
  private async machineLabels(machineIds: string[]): Promise<Map<string, string | null>> {
    if (machineIds.length === 0) return new Map();
    const placeholders = machineIds.map(() => "?").join(",");
    const rows = await this.env.REGISTRY.prepare(
      `SELECT machine_id, label FROM machine WHERE machine_id IN (${placeholders})`,
    )
      .bind(...machineIds)
      .all<{ machine_id: string; label: string | null }>();
    return new Map(rows.results.map((r) => [r.machine_id, r.label]));
  }

  // ---- reads -------------------------------------------------------------

  async getWeek(weekStart: number, ledger: Ledger = "work", checkTime = Date.now()): Promise<WeekResultWithActivity> {
    const s = this.getSettings();
    const start = localDayStart(weekStart, s.timezone);
    const end = addLocalDays(start, 7, s.timezone);
    const allEvents = this.loadEvents(start, end);
    const events = await this.filterByLedgerRole(allEvents, ledger);
    const corrections = this.loadCorrections(start, end, ledger);
    const week = computeWeek(start, events, corrections, s, checkTime, ledger) as WeekResultWithActivity;

    // Per-machine raw activity, for the raw lanes shown on day-expand — purely
    // additive, display-only. Recomputed via a second pairSpans pass over the
    // same (already role-filtered) events rather than threading it through
    // computeWeek, so composition stays exactly as it was and machine
    // identity never reaches corrections (design.md D2).
    const { byMachine } = pairSpans(events, checkTime, graceMs());
    const labels = await this.machineLabels([...byMachine.keys()]);
    for (const day of week.days) {
      const win: Interval = { start: day.dayStart, end: addLocalDays(day.dayStart, 1, s.timezone) };
      const activity: MachineActivity[] = [];
      for (const [machineId, ma] of byMachine) {
        const active: Interval[] = [];
        for (const iv of ma.active) {
          const c = clamp(iv, win);
          if (c && duration(c) >= s.minActiveSec * 1000) active.push(c);
        }
        if (active.length === 0) continue;
        const provisional = ma.provisional.filter((p) => p.start < win.end && p.end > win.start);
        activity.push({ machineId, label: labels.get(machineId) ?? null, active, provisional });
      }
      day.machineActivity = activity;
    }

    // For days whose raw events were pruned but that have a sealed rollup, use
    // the rollup numbers (tiered retention). Pruning is day-scoped, not
    // ledger-scoped, so "does raw data exist for this day" is checked against
    // every event regardless of role.
    //
    // A day can have zero raw events for a reason that has nothing to do with
    // pruning: it was simply a day off, with nothing ever ingested. Such a day
    // is indistinguishable from "pruned" by the raw-presence check alone, so a
    // sealed rollup that predates a later correction (a holiday marker, or any
    // settings change wide enough to call markAllDaysDirty) would otherwise be
    // served as if it were current. `dirty_day` already tracks exactly this:
    // a day is inserted there the moment a correction or ingest could have
    // changed its outcome, and removed only once `sealDay` has re-derived the
    // rollup from the live correction set. So a dirty day's rollup — if one
    // exists at all — is stale by definition, and the live `computeWeek`
    // result above (which already reflects every current correction) must be
    // trusted instead, exactly as it already is for a day with fresh raw data.
    const dirtyDays = new Set(
      (
        this.sql
          .exec("SELECT day_start FROM dirty_day WHERE day_start >= ? AND day_start < ?", start, end)
          .toArray() as { day_start: number }[]
      ).map((r) => r.day_start),
    );
    const daysWithRaw = new Set(allEvents.map((e) => localDayStart(e.ts, s.timezone)));
    for (const day of week.days) {
      if (daysWithRaw.has(day.dayStart) || dirtyDays.has(day.dayStart)) continue;
      const roll = this.sql
        .exec("SELECT * FROM daily_rollup WHERE day_start = ?", day.dayStart)
        .toArray()[0] as
        | {
            worked_ms: number;
            gross_ms: number;
            lunch_ms: number;
            norm_ms: number;
            balance_ms: number;
            personal_worked_ms: number;
            personal_gross_ms: number;
          }
        | undefined;
      if (roll) {
        if (ledger === "work") {
          day.workedMs = roll.worked_ms;
          day.grossMs = roll.gross_ms;
          day.lunchMs = roll.lunch_ms;
          day.normMs = roll.norm_ms;
          day.balanceMs = roll.balance_ms;
        } else {
          day.workedMs = roll.personal_worked_ms;
          day.grossMs = roll.personal_gross_ms;
          day.balanceMs = roll.personal_worked_ms; // no norm — balance is just worked time
        }
      }
    }
    week.weeklyWorkedMs = week.days.reduce((n, d) => n + d.workedMs, 0);
    week.weeklyBalanceMs = week.weeklyWorkedMs - week.weeklyNormMs;
    return week;
  }

  /** Week relative to the current one (0 = this week, -1 = last week, …). */
  weekView(offset: number, ledger: Ledger = "work", now = Date.now()): Promise<WeekResultWithActivity> {
    const s = this.getSettings();
    const start = addLocalDays(localWeekStart(now, s.timezone), offset * 7, s.timezone);
    return this.getWeek(start, ledger, now);
  }

  /** Week containing an absolute calendar date (`YYYY-MM-DD`), for deep-linked
   *  week URLs — unlike `weekView`'s offset, this identifies the same week
   *  regardless of when it's resolved. Anchored at UTC noon of that date
   *  (not midnight) before resolving, the same nudge-to-noon technique
   *  `addLocalDays` uses via its internal `offsetCorrection`, so the
   *  timezone conversion cannot roll the date into a neighboring calendar
   *  day. */
  weekViewForDate(dateYMD: string, ledger: Ledger = "work", now = Date.now()): Promise<WeekResultWithActivity> {
    const s = this.getSettings();
    const parts = dateYMD.split("-").map(Number);
    const anchor = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!, 12);
    return this.getWeek(localWeekStart(anchor, s.timezone), ledger, now);
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

  /** Most recent event among a given set of machines, or none if that set
   *  has no events at all. Scoping this by machine_id (rather than the
   *  account-wide latest event) is what lets getStatus() answer "active on
   *  a machine that counts toward THIS ledger" instead of "active on any
   *  machine at all." */
  private lastEventFor(
    machineIds: Set<string>,
  ): { machine_id: string; ts: number; kind: string } | undefined {
    if (machineIds.size === 0) return undefined;
    const ids = [...machineIds];
    const placeholders = ids.map(() => "?").join(",");
    return this.sql
      .exec(
        `SELECT machine_id, ts, kind FROM event WHERE machine_id IN (${placeholders}) ORDER BY ts DESC LIMIT 1`,
        ...ids,
      )
      .toArray()[0] as { machine_id: string; ts: number; kind: string } | undefined;
  }

  /**
   * Status per ledger: "am I active on a machine currently assigned to THIS
   * ledger," reusing the same machine-role filtering getWeek() applies via
   * filterByLedgerRole(). A ledger with no machine currently assigned to it
   * returns null rather than a fabricated idle/unknown value — the frontend
   * uses that null to decide whether the Work/Personal toggle is shown at
   * all.
   */
  async getStatus(now = Date.now()): Promise<Record<Ledger, StatusView | null>> {
    const machines = this.listMachines();
    const roles = await this.machineRoles(machines.map((m) => m.machine_id));
    const byLedger = partitionByLedgerRole(
      machines.map((m) => m.machine_id),
      roles,
    );
    const hostnames = new Map(machines.map((m) => [m.machine_id, m.hostname]));
    const recent = this.loadEvents(now - 2 * DAY_MS, now + DAY_MS);

    const statusFor = (ledger: Ledger): StatusView | null => {
      const ids = new Set(byLedger[ledger]);
      if (ids.size === 0) return null;
      const last = this.lastEventFor(ids);
      if (!last) return { state: "unknown", since: null, machineId: null, hostname: null };

      const { active: spans, provisional } = pairSpans(
        recent.filter((e) => ids.has(e.machine_id)),
        now,
        graceMs(),
      );
      const openStart = spans.length > 0 ? spans[spans.length - 1]! : null;
      // "Active now" is exactly "the open span is still growing" — the machine
      // has been seen within the liveness window. pairSpans already computes that
      // from the same grace, so this no longer re-derives it from heartbeatSec.
      const active = provisional.some((p) => p.growing);

      return {
        state: active ? "active" : "idle",
        since: active ? openStart!.start : last.ts,
        machineId: last.machine_id,
        hostname: hostnames.get(last.machine_id) ?? null,
      };
    };

    return { work: statusFor("work"), personal: statusFor("personal") };
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
    await this.runMaintenance(Date.now());
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
  async runMaintenanceNow(): Promise<{ rollups: number; sessions: number }> {
    await this.runMaintenance(Date.now());
    const rollups = Number(
      (this.sql.exec("SELECT count(*) AS n FROM daily_rollup").one() as { n: number }).n,
    );
    const sessions = Number(
      (this.sql.exec("SELECT count(*) AS n FROM session").one() as { n: number }).n,
    );
    return { rollups, sessions };
  }

  /** Seal elapsed dirty days into rollups/sessions, then prune old raw. */
  async runMaintenance(now: number): Promise<void> {
    const s = this.getSettings();
    const dirty = this.sql.exec("SELECT day_start FROM dirty_day").toArray() as {
      day_start: number;
    }[];
    for (const { day_start } of dirty) {
      const dayEnd = addLocalDays(day_start, 1, s.timezone);
      if (dayEnd > now) continue; // not fully elapsed yet — seal later
      await this.sealDay(day_start, s, now);
      this.sql.exec("DELETE FROM dirty_day WHERE day_start = ?", day_start);
    }
    const cutoff = now - EDIT_WINDOW_DAYS * DAY_MS;
    this.sql.exec("DELETE FROM event WHERE ts < ?", cutoff);
  }

  /** Seal both ledgers for one day in the same pass: role-partition the raw
   *  events once, run each ledger's own composition, and persist both sets of
   *  rollup totals together (see design.md D5 — the sealed rollup, not raw
   *  retention, is what carries personal-ledger history past the edit window). */
  private async sealDay(dayStart: number, s: Settings, now: number): Promise<void> {
    const dayEnd = addLocalDays(dayStart, 1, s.timezone);
    const allEvents = this.loadEvents(dayStart - DAY_MS, dayEnd + DAY_MS);
    const workEvents = await this.filterByLedgerRole(allEvents, "work");
    const personalEvents = await this.filterByLedgerRole(allEvents, "personal");
    const weekday = weekdayMon0(dayStart, s.timezone);

    const workPaired = pairSpans(workEvents, now, graceMs());
    const work = computeDay(
      workPaired.active,
      this.loadCorrections(dayStart, dayEnd, "work"),
      dayStart,
      s,
      weekday,
      workPaired.provisional,
      "work",
    );
    const personalPaired = pairSpans(personalEvents, now, graceMs());
    const personal = computeDay(
      personalPaired.active,
      this.loadCorrections(dayStart, dayEnd, "personal"),
      dayStart,
      s,
      weekday,
      personalPaired.provisional,
      "personal",
    );

    this.sql.exec(
      `INSERT INTO daily_rollup (day_start, worked_ms, gross_ms, lunch_ms, norm_ms, balance_ms, is_working_day, personal_worked_ms, personal_gross_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day_start) DO UPDATE SET
         worked_ms = excluded.worked_ms, gross_ms = excluded.gross_ms,
         lunch_ms = excluded.lunch_ms, norm_ms = excluded.norm_ms,
         balance_ms = excluded.balance_ms, is_working_day = excluded.is_working_day,
         personal_worked_ms = excluded.personal_worked_ms, personal_gross_ms = excluded.personal_gross_ms`,
      dayStart,
      work.workedMs,
      work.grossMs,
      work.lunchMs,
      work.normMs,
      work.balanceMs,
      work.isWorkingDay ? 1 : 0,
      personal.workedMs,
      personal.grossMs,
    );
    // `session` stays work-ledger-only, matching its existing (pre-existing,
    // out of scope here) write-only status — nothing reads it back for either
    // ledger today, so there is nothing to extend yet.
    this.sql.exec("DELETE FROM session WHERE day_start = ?", dayStart);
    for (const span of work.spans) {
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
