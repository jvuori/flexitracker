// Global registry (D1): maps identities and access keys to a stable internal
// account_id — stored outside the per-tenant Durable Objects. Small and
// queryable (also powers the admin console).

/** Account lifecycle: register → admin approves → use; disable kicks out. */
export type AccountStatus = "pending" | "active" | "rejected" | "disabled";

export interface Account {
  account_id: string;
  google_sub: string;
  email: string;
  created_at: number;
  status: AccountStatus;
  requested_at: number | null;
  note: string | null;
  decided_at: number | null;
  decided_by: string | null;
}

/** An account row plus its non-revoked machine-key count, for the admin console. */
export interface AccountWithStats extends Account {
  machine_count: number;
}

export interface KeyResolution {
  account_id: string;
  machine_id: string;
}

export interface MachineKey {
  access_key: string;
  account_id: string;
  machine_id: string;
  label: string | null;
  created_at: number;
  revoked_at: number | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS account (
  account_id   TEXT PRIMARY KEY,
  google_sub   TEXT UNIQUE NOT NULL,
  email        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  requested_at INTEGER,
  note         TEXT,
  decided_at   INTEGER,
  decided_by   TEXT
);
CREATE TABLE IF NOT EXISTS machine_key (
  access_key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  label      TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS machine_key_account ON machine_key (account_id);
CREATE TABLE IF NOT EXISTS admin_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  admin_email TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT
);
`;

export interface AuditEntry {
  id: number;
  at: number;
  admin_email: string;
  action: string;
  target: string | null;
}

/** Record an administrative mutation with who did it and when. */
export async function recordAudit(
  db: D1Database,
  adminEmail: string,
  action: string,
  target: string | null,
): Promise<void> {
  await db
    .prepare("INSERT INTO admin_audit (at, admin_email, action, target) VALUES (?, ?, ?, ?)")
    .bind(Date.now(), adminEmail, action, target)
    .run();
}

export async function listAudit(db: D1Database, limit = 100): Promise<AuditEntry[]> {
  const res = await db
    .prepare("SELECT * FROM admin_audit ORDER BY at DESC LIMIT ?")
    .bind(limit)
    .all<AuditEntry>();
  return res.results;
}

export async function ensureRegistrySchema(db: D1Database): Promise<void> {
  // D1 batch of DDL statements.
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
  await migrateAccountStatus(db);
}

/**
 * Add the account-lifecycle columns to a pre-existing `account` table (SQLite has
 * no ADD COLUMN IF NOT EXISTS). Runs once: when `status` is missing we add the
 * columns and **grandfather every existing row to `active`** — those accounts
 * predate approval and must not lock themselves out. Fresh DBs already have the
 * columns (with default `pending`), so this is a no-op there.
 */
async function migrateAccountStatus(db: D1Database): Promise<void> {
  const cols = await db.prepare("PRAGMA table_info(account)").all<{ name: string }>();
  if (cols.results.some((c) => c.name === "status")) return;
  await db.prepare("ALTER TABLE account ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'").run();
  await db.prepare("ALTER TABLE account ADD COLUMN requested_at INTEGER").run();
  await db.prepare("ALTER TABLE account ADD COLUMN note TEXT").run();
  await db.prepare("ALTER TABLE account ADD COLUMN decided_at INTEGER").run();
  await db.prepare("ALTER TABLE account ADD COLUMN decided_by TEXT").run();
  await db.prepare("UPDATE account SET status = 'active' WHERE status = 'pending'").run();
}

/** URL-safe random token. */
function token(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += b.toString(16).padStart(2, "0");
  return s;
}

/**
 * Resolve an identity to a stable account_id, minting on first login. The
 * account_id is DERIVED from the subject (deterministic), so re-creating an
 * account after a registry wipe maps back to the same Durable Object rather than
 * orphaning it.
 */
export async function getOrCreateAccount(
  db: D1Database,
  sub: string,
  email: string,
  isAdmin = false,
): Promise<Account> {
  const existing = await db
    .prepare("SELECT * FROM account WHERE account_id = ?")
    .bind(sub)
    .first<Account>();
  if (existing) {
    // Repair: an admin (allowlist) is always active, even if an earlier login
    // created a pending row before the email was on the allowlist.
    if (isAdmin && existing.status !== "active") {
      await db
        .prepare("UPDATE account SET status = 'active' WHERE account_id = ?")
        .bind(sub)
        .run();
      existing.status = "active";
    }
    return existing;
  }

  // New account: admins bootstrap themselves active; everyone else is pending
  // until an admin approves (no capability meanwhile).
  const status: AccountStatus = isAdmin ? "active" : "pending";
  const now = Date.now();
  await db
    .prepare(
      "INSERT OR IGNORE INTO account (account_id, google_sub, email, created_at, status) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(sub, sub, email, now, status)
    .run();
  return {
    account_id: sub,
    google_sub: sub,
    email,
    created_at: now,
    status,
    requested_at: null,
    note: null,
    decided_at: null,
    decided_by: null,
  };
}

/** Read an account row (for the capability gate), or null if unknown. */
export async function getAccount(db: D1Database, accountId: string): Promise<Account | null> {
  const row = await db
    .prepare("SELECT * FROM account WHERE account_id = ?")
    .bind(accountId)
    .first<Account>();
  return row ?? null;
}

/**
 * Idempotently ensure an account row with a fixed id exists. Used by the QA
 * bootstrap and fixtures, so it creates **active** — the lab account must be
 * immediately usable without an approval step.
 */
export async function ensureAccountRow(
  db: D1Database,
  accountId: string,
  email: string,
  status: AccountStatus = "active",
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO account (account_id, google_sub, email, created_at, status) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(accountId, accountId, email, Date.now(), status)
    .run();
}

/** Record a pending account's access request (idempotent; keeps first note). */
export async function setRequested(
  db: D1Database,
  accountId: string,
  note: string | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE account SET requested_at = COALESCE(requested_at, ?), note = COALESCE(note, ?) WHERE account_id = ?",
    )
    .bind(Date.now(), note, accountId)
    .run();
}

/** Approve (or re-enable) an account → active. */
export async function approve(
  db: D1Database,
  accountId: string,
  adminEmail: string,
): Promise<void> {
  await db
    .prepare("UPDATE account SET status = 'active', decided_at = ?, decided_by = ? WHERE account_id = ?")
    .bind(Date.now(), adminEmail, accountId)
    .run();
}

/** Reject a pending registration → rejected. */
export async function reject(
  db: D1Database,
  accountId: string,
  adminEmail: string,
): Promise<void> {
  await db
    .prepare("UPDATE account SET status = 'rejected', decided_at = ?, decided_by = ? WHERE account_id = ?")
    .bind(Date.now(), adminEmail, accountId)
    .run();
}

/**
 * Kick out an account → disabled, revoking all its machine keys in the same
 * batch so its daemons stop being accepted at /ingest immediately, not just the
 * human UI.
 */
export async function disable(
  db: D1Database,
  accountId: string,
  adminEmail: string,
): Promise<void> {
  const now = Date.now();
  await db.batch([
    db
      .prepare("UPDATE account SET status = 'disabled', decided_at = ?, decided_by = ? WHERE account_id = ?")
      .bind(now, adminEmail, accountId),
    db
      .prepare("UPDATE machine_key SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL")
      .bind(now, accountId),
  ]);
}

/**
 * The admin approval queue: pending accounts that have **explicitly requested**
 * access (requested_at set), oldest first. A visitor who merely signed in but
 * never submitted the request form is not in the queue (they still show in the
 * users overview) — registration is an explicit act.
 */
export async function listRegistrations(db: D1Database): Promise<Account[]> {
  const res = await db
    .prepare(
      "SELECT * FROM account WHERE status = 'pending' AND requested_at IS NOT NULL ORDER BY requested_at ASC",
    )
    .all<Account>();
  return res.results;
}

/** All accounts with their non-revoked machine-key count, for the admin console. */
export async function listAccountsWithStats(db: D1Database): Promise<AccountWithStats[]> {
  const res = await db
    .prepare(
      `SELECT a.*, COUNT(k.access_key) AS machine_count
         FROM account a
         LEFT JOIN machine_key k ON k.account_id = a.account_id AND k.revoked_at IS NULL
        GROUP BY a.account_id
        ORDER BY a.created_at DESC`,
    )
    .all<AccountWithStats>();
  return res.results;
}

/** Return an existing non-revoked key for (account,label) or issue a new one. */
export async function ensureKey(
  db: D1Database,
  accountId: string,
  label: string,
): Promise<MachineKey> {
  const existing = (await listKeys(db, accountId)).find(
    (k) => k.label === label && k.revoked_at === null,
  );
  return existing ?? issueKey(db, accountId, label);
}

/** Wipe the entire global registry (QA reset). Durable Object data is cleared
 *  separately per account via TenantDO.reset(). */
export async function wipeRegistry(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM machine_key").run();
  await db.prepare("DELETE FROM admin_audit").run();
  await db.prepare("DELETE FROM account").run();
}

/** Resolve an access key to its account+machine, or null if unknown/revoked. */
export async function resolveKey(
  db: D1Database,
  accessKey: string,
): Promise<KeyResolution | null> {
  const row = await db
    .prepare(
      "SELECT account_id, machine_id FROM machine_key WHERE access_key = ? AND revoked_at IS NULL",
    )
    .bind(accessKey)
    .first<KeyResolution>();
  return row ?? null;
}

/** Issue a fresh per-machine key. Returns the key + generated machine_id. */
export async function issueKey(
  db: D1Database,
  accountId: string,
  label: string | null,
): Promise<MachineKey> {
  const key: MachineKey = {
    access_key: token(),
    account_id: accountId,
    machine_id: crypto.randomUUID(),
    label,
    created_at: Date.now(),
    revoked_at: null,
  };
  await db
    .prepare(
      "INSERT INTO machine_key (access_key, account_id, machine_id, label, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(key.access_key, key.account_id, key.machine_id, key.label, key.created_at)
    .run();
  return key;
}

/** Revoke a key, scoped to the owning account (no cross-account revocation). */
export async function revokeKey(
  db: D1Database,
  accountId: string,
  accessKey: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE machine_key SET revoked_at = ? WHERE access_key = ? AND account_id = ? AND revoked_at IS NULL",
    )
    .bind(Date.now(), accessKey, accountId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function listKeys(db: D1Database, accountId: string): Promise<MachineKey[]> {
  const res = await db
    .prepare("SELECT * FROM machine_key WHERE account_id = ? ORDER BY created_at DESC")
    .bind(accountId)
    .all<MachineKey>();
  return res.results;
}

export async function listAccounts(db: D1Database): Promise<Account[]> {
  const res = await db
    .prepare("SELECT * FROM account ORDER BY created_at DESC")
    .all<Account>();
  return res.results;
}
