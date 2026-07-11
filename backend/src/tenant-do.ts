import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/**
 * One TenantDO instance per account (addressed by internal account_id via
 * idFromName). Its embedded SQLite database is the tenant boundary.
 *
 * SCAFFOLD: schema bootstrap and a health probe only. Ingestion, the
 * seal/recompute/prune alarm, corrections, and read APIs are implemented in
 * the tenant-storage / event-ingestion / worktime-calculation tasks.
 */
export class TenantDO extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.bootstrapSchema();
  }

  private bootstrapSchema(): void {
    // Minimal initial schema. Extended by tenant-storage tasks (sessions,
    // daily_rollup, corrections, machine key registry, etc.).
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS event (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id  TEXT    NOT NULL,
        ts          INTEGER NOT NULL,   -- daemon back-dated time (epoch ms)
        kind        TEXT    NOT NULL,
        received_at INTEGER NOT NULL    -- server clock (epoch ms)
      );
      CREATE INDEX IF NOT EXISTS event_ts ON event (ts);

      CREATE TABLE IF NOT EXISTS machine (
        machine_id   TEXT PRIMARY KEY,
        hostname     TEXT,
        os           TEXT,
        first_seen   INTEGER,
        last_seen    INTEGER,
        last_batch_seq INTEGER NOT NULL DEFAULT -1
      );
    `);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/do/health") {
      return Response.json({ ok: true, tables: this.tableCount() });
    }
    // Fail-fast: unrouted internal calls are a bug, not something to paper over.
    return new Response("not implemented", { status: 501 });
  }

  private tableCount(): number {
    const row = this.sql
      .exec("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'")
      .one();
    return Number(row.n);
  }
}
