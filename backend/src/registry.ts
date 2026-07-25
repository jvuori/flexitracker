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

/** Whether a Machine's activity counts toward flextime balance (`work`) or is
 *  tracked for personal awareness only, never touching balance (`personal`). */
export type MachineRole = "work" | "personal";

/**
 * A durable Machine: `machine_id` is stable across key rotations and hardware
 * replacements, distinct from the (rotatable, revocable) key that currently
 * authorizes it. See `resolveOrCreateMachine`/`findMachine`.
 */
export interface Machine {
  machine_id: string;
  account_id: string;
  label: string;
  role: MachineRole;
  created_at: number;
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
-- Deliberately no UNIQUE(account_id, label): choosing "create a separate
-- machine" for a label that already resolves to a Machine is a supported
-- outcome (frictionless-machine-onboarding D6) and yields two Machine rows
-- sharing a label on purpose.
CREATE TABLE IF NOT EXISTS machine (
  machine_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  label      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'work' CHECK(role IN ('work','personal')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS machine_account_label ON machine (account_id, label);
-- Short-lived, single-use device-authorization codes (the /device/authorize ->
-- /device/token handshake). Lives in D1 (strongly consistent), never KV, so an
-- exchange immediately following approval can never read stale.
CREATE TABLE IF NOT EXISTS device_auth (
  code        TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  access_key  TEXT NOT NULL,
  machine_id  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  redeemed_at INTEGER
);
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
  await migrateMachineRole(db);
  await backfillKeylessMachines(db);
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

/**
 * Add `role` to a pre-existing `machine` table (SQLite has no ADD COLUMN IF NOT
 * EXISTS). Runs once: every pre-existing Machine grandfathers to `work` — the
 * common case, and the one that changes nothing about an account's balance
 * until a human explicitly reclassifies a machine as personal.
 */
async function migrateMachineRole(db: D1Database): Promise<void> {
  const cols = await db.prepare("PRAGMA table_info(machine)").all<{ name: string }>();
  if (cols.results.some((c) => c.name === "role")) return;
  await db
    .prepare("ALTER TABLE machine ADD COLUMN role TEXT NOT NULL DEFAULT 'work'")
    .run();
}

/**
 * Backfill a `machine` row (role `work`, matching the frozen default at the
 * time this migration was introduced) for every `machine_key` that predates
 * the Machine entity — closing the legacy gap where a key could exist with no
 * backing Machine row at all (see `findMachine`'s legacy fallback). Idempotent
 * and cheap once caught up: the `NOT EXISTS` guard matches nothing on
 * subsequent runs.
 */
async function backfillKeylessMachines(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO machine (machine_id, account_id, label, role, created_at)
       SELECT mk.machine_id, mk.account_id, COALESCE(MIN(mk.label), ''), 'work', MIN(mk.created_at)
         FROM machine_key mk
        WHERE NOT EXISTS (SELECT 1 FROM machine m WHERE m.machine_id = mk.machine_id)
        GROUP BY mk.machine_id, mk.account_id`,
    )
    .run();
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

/** Return an existing non-revoked key for (account,label) or issue a new one,
 *  backed by a proper Machine entity either way. */
export async function ensureKey(
  db: D1Database,
  accountId: string,
  label: string,
  role: MachineRole = "work",
): Promise<MachineKey> {
  const existing = (await listKeys(db, accountId)).find(
    (k) => k.label === label && k.revoked_at === null,
  );
  if (existing) {
    await setMachineRole(db, accountId, existing.machine_id, role);
    return existing;
  }
  const machine = await createMachine(db, accountId, label, role);
  return issueKeyForMachine(db, accountId, machine.machine_id, label);
}

/** Wipe the entire global registry (QA reset). Durable Object data is cleared
 *  separately per account via TenantDO.reset(). */
export async function wipeRegistry(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM machine_key").run();
  // `machine` was missed here before every key was guaranteed a backing
  // Machine row — harmless while `machine` rows were rare, but once
  // `createMachine` runs on every bootstrap this would accumulate stale rows
  // (and stale roles) across repeated wipes/loads, defeating "wipes ALL data".
  await db.prepare("DELETE FROM machine").run();
  await db.prepare("DELETE FROM device_auth").run();
  await db.prepare("DELETE FROM admin_audit").run();
  await db.prepare("DELETE FROM account").run();
}

/** Read-only identity echo for a key: account email + this machine's label +
 *  account status. Unlike resolveKey it does NOT filter revoked keys, so a
 *  disabled account's daemon can be told "not active" rather than a bare 401. */
export interface WhoAmI {
  email: string;
  status: AccountStatus;
  machine_id: string;
  machine_label: string | null;
  revoked_at: number | null;
}
export async function whoamiForKey(db: D1Database, accessKey: string): Promise<WhoAmI | null> {
  const row = await db
    .prepare(
      `SELECT a.email AS email, a.status AS status, k.machine_id AS machine_id,
              k.label AS machine_label, k.revoked_at AS revoked_at
         FROM machine_key k JOIN account a ON a.account_id = k.account_id
        WHERE k.access_key = ?`,
    )
    .bind(accessKey)
    .first<WhoAmI>();
  return row ?? null;
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

/**
 * Find the Machine a label currently resolves to, without creating one.
 * Read-only — used to render the approval page's conflict state before any
 * mutation happens.
 *
 * Falls back to a pre-existing `machine_key` row sharing that label when no
 * `machine` row matches: a key minted before this Machine entity existed (via
 * the web "Add machine" flow) is, in effect, its own single-key Machine, so a
 * later `login --name` with the same label continues it instead of forking a
 * new identity.
 */
export async function findMachine(
  db: D1Database,
  accountId: string,
  label: string,
): Promise<Machine | null> {
  const row = await db
    .prepare("SELECT * FROM machine WHERE account_id = ? AND label = ? ORDER BY created_at DESC LIMIT 1")
    .bind(accountId, label)
    .first<Machine>();
  if (row) return row;

  const legacy = await db
    .prepare(
      "SELECT machine_id, account_id, label, created_at FROM machine_key WHERE account_id = ? AND label = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(accountId, label)
    .first<{ machine_id: string; account_id: string; label: string | null; created_at: number }>();
  if (!legacy) return null;
  // A pre-backfill legacy key with no `machine` row yet: role defaults to
  // `work`, matching `backfillKeylessMachines` — this branch should be
  // unreachable once that migration has run, kept only as a defensive no-op.
  return {
    machine_id: legacy.machine_id,
    account_id: legacy.account_id,
    label,
    role: "work",
    created_at: legacy.created_at,
  };
}

/**
 * Resolve a label to its existing Machine, or create one. Label resolution is
 * how a replacement laptop keeps the same logical Machine ("Work laptop") so
 * its event stream and history continue under one `machine_id`. `role` is
 * used only when a new Machine is actually created — an existing Machine's
 * role is never re-asked or overwritten by re-registration.
 */
export async function resolveOrCreateMachine(
  db: D1Database,
  accountId: string,
  label: string,
  role: MachineRole = "work",
): Promise<Machine> {
  const existing = await findMachine(db, accountId, label);
  if (existing) {
    // Backfill the `machine` row for a legacy label match so future lookups
    // hit it directly; idempotent (INSERT OR IGNORE) and harmless if the row
    // was created by a concurrent resolve or already existed.
    await db
      .prepare(
        "INSERT OR IGNORE INTO machine (machine_id, account_id, label, role, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(existing.machine_id, accountId, label, existing.role, existing.created_at)
      .run();
    return existing;
  }
  return createMachine(db, accountId, label, role);
}

/** Always create a fresh Machine, even if the label matches an existing one
 *  (the explicit "create a separate machine" choice). Role defaults to `work`
 *  — the common case — and is otherwise whatever the creation surface's
 *  (pre-selected, changeable) radio chose. */
export async function createMachine(
  db: D1Database,
  accountId: string,
  label: string,
  role: MachineRole = "work",
): Promise<Machine> {
  const machine: Machine = {
    machine_id: crypto.randomUUID(),
    account_id: accountId,
    label,
    role,
    created_at: Date.now(),
  };
  await db
    .prepare("INSERT INTO machine (machine_id, account_id, label, role, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(machine.machine_id, machine.account_id, machine.label, machine.role, machine.created_at)
    .run();
  return machine;
}

/** All Machines the registry knows about for an account (Machines tab list). */
export async function listMachinesForAccount(db: D1Database, accountId: string): Promise<Machine[]> {
  const res = await db
    .prepare("SELECT * FROM machine WHERE account_id = ? ORDER BY created_at DESC")
    .bind(accountId)
    .all<Machine>();
  return res.results;
}

/** True if `machineId` is unclaimed, or already belongs to `accountId` — the
 *  ownership check `renameMachine` uses before writing, since `machine_id` is
 *  otherwise just a client-supplied path param. */
async function machineIsAccessibleTo(db: D1Database, accountId: string, machineId: string): Promise<boolean> {
  const inMachine = await db.prepare("SELECT account_id FROM machine WHERE machine_id = ?").bind(machineId).first<{ account_id: string }>();
  if (inMachine) return inMachine.account_id === accountId;
  const inKey = await db
    .prepare("SELECT account_id FROM machine_key WHERE machine_id = ? LIMIT 1")
    .bind(machineId)
    .first<{ account_id: string }>();
  if (inKey) return inKey.account_id === accountId;
  return false; // unknown machine_id — nothing to claim or rename
}

/**
 * Rename a Machine's label without touching its key (identity is the
 * `machine_id`, not the label). Works for a Machine that predates this
 * entity too (a legacy key with no `machine` row) by backfilling one.
 * Returns false if the machine_id is unknown or belongs to another account.
 */
export async function renameMachine(
  db: D1Database,
  accountId: string,
  machineId: string,
  label: string,
): Promise<boolean> {
  if (!(await machineIsAccessibleTo(db, accountId, machineId))) return false;
  await db.batch([
    db
      .prepare(
        `INSERT INTO machine (machine_id, account_id, label, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(machine_id) DO UPDATE SET label = excluded.label`,
      )
      .bind(machineId, accountId, label, Date.now()),
    db
      .prepare("UPDATE machine_key SET label = ? WHERE account_id = ? AND machine_id = ?")
      .bind(label, accountId, machineId),
  ]);
  return true;
}

/**
 * Change a Machine's role. Works for a Machine that predates this entity too
 * (a legacy key with no `machine` row) by backfilling one, mirroring
 * `renameMachine`. Returns false if the machine_id is unknown or belongs to
 * another account.
 */
export async function setMachineRole(
  db: D1Database,
  accountId: string,
  machineId: string,
  role: MachineRole,
): Promise<boolean> {
  if (!(await machineIsAccessibleTo(db, accountId, machineId))) return false;
  const existing = await db
    .prepare("SELECT label FROM machine WHERE machine_id = ?")
    .bind(machineId)
    .first<{ label: string }>();
  if (existing) {
    await db.prepare("UPDATE machine SET role = ? WHERE machine_id = ?").bind(role, machineId).run();
    return true;
  }
  const legacyKey = await db
    .prepare(
      "SELECT label FROM machine_key WHERE account_id = ? AND machine_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(accountId, machineId)
    .first<{ label: string | null }>();
  await db
    .prepare("INSERT INTO machine (machine_id, account_id, label, role, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(machineId, accountId, legacyKey?.label ?? "", role, Date.now())
    .run();
  return true;
}

/** The Machine's current non-revoked key, or null if it has none. */
export async function activeKeyForMachine(
  db: D1Database,
  accountId: string,
  machineId: string,
): Promise<MachineKey | null> {
  const row = await db
    .prepare(
      "SELECT * FROM machine_key WHERE account_id = ? AND machine_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .bind(accountId, machineId)
    .first<MachineKey>();
  return row ?? null;
}

/**
 * Issue a new key bound to an EXISTING Machine's `machine_id` — always paired
 * with a prior `createMachine`/`resolveOrCreateMachine` call, so a key never
 * exists without a backing Machine row. Revokes the Machine's prior key in the
 * same batch — at most one active key per Machine, so two daemons can never
 * write interleaved events under one `machine_id`.
 */
export async function issueKeyForMachine(
  db: D1Database,
  accountId: string,
  machineId: string,
  label: string,
): Promise<MachineKey> {
  const key: MachineKey = {
    access_key: token(),
    account_id: accountId,
    machine_id: machineId,
    label,
    created_at: Date.now(),
    revoked_at: null,
  };
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        "UPDATE machine_key SET revoked_at = ? WHERE account_id = ? AND machine_id = ? AND revoked_at IS NULL",
      )
      .bind(now, accountId, machineId),
    db
      .prepare(
        "INSERT INTO machine_key (access_key, account_id, machine_id, label, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(key.access_key, key.account_id, key.machine_id, key.label, key.created_at),
  ]);
  return key;
}

const DEVICE_AUTH_CODE_TTL_MS = 120_000;

/**
 * Mint a short-lived, single-use authorization code bound to an already-issued
 * key, for the loopback redirect to carry instead of the key itself (D2: the
 * key never appears in a URL). Opportunistically prunes expired codes on
 * write, so no separate cleanup job is needed for this small, short-lived
 * table.
 */
export async function createDeviceAuthCode(
  db: D1Database,
  accountId: string,
  accessKey: string,
  machineId: string,
): Promise<string> {
  const now = Date.now();
  await db.prepare("DELETE FROM device_auth WHERE expires_at < ?").bind(now).run();
  const code = token();
  await db
    .prepare(
      "INSERT INTO device_auth (code, account_id, access_key, machine_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(code, accountId, accessKey, machineId, now, now + DEVICE_AUTH_CODE_TTL_MS)
    .run();
  return code;
}

/**
 * Redeem a device-authorization code: valid, unexpired, and not already
 * redeemed. Single-use — marks it redeemed in the same call so a replayed
 * code is rejected.
 */
export async function redeemDeviceAuthCode(
  db: D1Database,
  code: string,
): Promise<{ access_key: string; machine_id: string; account_id: string } | null> {
  const now = Date.now();
  await db.prepare("DELETE FROM device_auth WHERE expires_at < ?").bind(now).run();
  const row = await db
    .prepare("SELECT access_key, machine_id, account_id, redeemed_at FROM device_auth WHERE code = ?")
    .bind(code)
    .first<{ access_key: string; machine_id: string; account_id: string; redeemed_at: number | null }>();
  if (!row || row.redeemed_at !== null) return null;
  await db.prepare("UPDATE device_auth SET redeemed_at = ? WHERE code = ?").bind(now, code).run();
  return { access_key: row.access_key, machine_id: row.machine_id, account_id: row.account_id };
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
