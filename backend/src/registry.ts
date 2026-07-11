// Global registry (D1): maps identities and access keys to a stable internal
// account_id — stored outside the per-tenant Durable Objects. Small and
// queryable (also powers the admin console).

export interface Account {
  account_id: string;
  google_sub: string;
  email: string;
  created_at: number;
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
  account_id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL
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
}

/** URL-safe random token. */
function token(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += b.toString(16).padStart(2, "0");
  return s;
}

/** Resolve a Google subject to a stable account_id, minting on first login. */
export async function getOrCreateAccount(
  db: D1Database,
  sub: string,
  email: string,
): Promise<Account> {
  const existing = await db
    .prepare("SELECT * FROM account WHERE google_sub = ?")
    .bind(sub)
    .first<Account>();
  if (existing) return existing;

  const account: Account = {
    account_id: crypto.randomUUID(),
    google_sub: sub,
    email,
    created_at: Date.now(),
  };
  await db
    .prepare(
      "INSERT INTO account (account_id, google_sub, email, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(account.account_id, account.google_sub, account.email, account.created_at)
    .run();
  return account;
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
