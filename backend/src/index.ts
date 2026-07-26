import { Hono } from "hono";
import type { Env } from "./env";
import { parseEventBatch } from "./schema";
import {
  activeKeyForMachine,
  approve,
  createDeviceAuthCode,
  createMachine,
  disable,
  ensureAccountRow,
  ensureKey,
  ensureRegistrySchema,
  findMachine,
  getAccount,
  getOrCreateAccount,
  issueKeyForMachine,
  listAccounts,
  listAccountsWithStats,
  listAudit,
  listKeys,
  listMachinesForAccount,
  listRegistrations,
  recordAudit,
  redeemDeviceAuthCode,
  reject,
  renameMachine,
  resolveKey,
  resolveOrCreateMachine,
  revokeKey,
  setMachineRole,
  setRequested,
  whoamiForKey,
  wipeRegistry,
  type AccountStatus,
  type MachineRole,
} from "./registry";
import { isAdmin, requireIdentity, UnauthorizedError, type Identity } from "./identity";
import { DAEMON_PROTOCOL } from "./worktime/settings";
import type { Settings } from "./worktime/settings";
import { graceMs, type Ledger } from "./worktime/worktime";
import { notifyAdmin } from "./mail";
import { renderApp, renderDeviceApproval, renderDeviceNotActive } from "./ui/render";

export { TenantDO } from "./tenant-do";
export type { Env } from "./env";

// Run the registry DDL once per isolate (D1 in dev has no migrations applied).
let schemaReady: Promise<void> | null = null;
function ready(env: Env): Promise<void> {
  if (!schemaReady) schemaReady = ensureRegistrySchema(env.REGISTRY);
  return schemaReady;
}

function tenant(env: Env, accountId: string) {
  return env.TENANT.get(env.TENANT.idFromName(accountId));
}

/** Fixed account the QA fixtures load into (and that QA_FIXTURE_EMAIL maps to). */
const FIXTURE_ACCOUNT_ID = "qa-fixtures";

/** Resolve a human identity to its account id, with the QA fixtures override. */
async function accountFor(env: Env, identity: Identity): Promise<string> {
  if (env.QA_TEST_MODE === "1" && env.QA_FIXTURE_EMAIL && identity.email === env.QA_FIXTURE_EMAIL) {
    // The fixtures/lab account is always active — it must be immediately usable
    // (locally and in QA) without a bootstrap or an approval step.
    await ensureAccountRow(env.REGISTRY, FIXTURE_ACCOUNT_ID, identity.email, "active");
    return FIXTURE_ACCOUNT_ID;
  }
  // Admins (allowlist) are provisioned active; everyone else starts pending.
  return (await getOrCreateAccount(env.REGISTRY, identity.sub, identity.email, isAdmin(identity, env)))
    .account_id;
}

const app = new Hono<{
  Bindings: Env;
  Variables: { identity: Identity; accountId: string; status: AccountStatus };
}>();

app.get("/health", (c) => c.json({ ok: true, service: "flexitracker" }));

// ---- ingest (daemon write path, access-key auth) -----------------------
app.post("/ingest", async (c) => {
  await ready(c.env);
  const auth = c.req.header("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const resolved = key ? await resolveKey(c.env.REGISTRY, key) : null;
  if (!resolved) return c.json({ error: "invalid access key" }, 401);

  let batch;
  try {
    batch = parseEventBatch(await c.req.json());
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const { duplicate } = await tenant(c.env, resolved.account_id).ingest(resolved.machine_id, batch);
  return c.json({ ok: true, batch_seq: batch.batch_seq, duplicate });
});

// ---- daemon connectivity self-test (access-key auth) — READ-ONLY, no data --
// The daemon's `test` command calls this to prove the key works and is bound to
// the right account, WITHOUT emitting any activity event. Reports the account
// status too, so a disabled account's daemon is told "not active" rather than a
// bare 401. Non-browser path ⇒ must be Access-bypassed like /ingest.
app.get("/whoami", async (c) => {
  await ready(c.env);
  const auth = c.req.header("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const w = key ? await whoamiForKey(c.env.REGISTRY, key) : null;
  if (!w) return c.json({ error: "invalid access key" }, 401);
  return c.json({
    email: w.email,
    machineId: w.machine_id,
    machineLabel: w.machine_label,
    status: w.status,
    active: w.status === "active" && w.revoked_at === null,
  });
});

// ---- daemon config (access-key auth) — thresholds pushed from settings --
app.get("/config", async (c) => {
  await ready(c.env);
  const auth = c.req.header("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const resolved = key ? await resolveKey(c.env.REGISTRY, key) : null;
  if (!resolved) return c.json({ error: "invalid access key" }, 401);
  const s = await tenant(c.env, resolved.account_id).getSettings();
  // Two of the three are backend constants, not account state: they drive
  // ingest write volume and (for the inactivity threshold) the boundary between
  // downtime that is absorbed and downtime that is reconciled. They are still
  // served here so the daemon reads one source of truth and cannot drift.
  return c.json({
    minInactivitySec: DAEMON_PROTOCOL.minInactivitySec,
    minActivitySec: s.minActivitySec,
    heartbeatSec: DAEMON_PROTOCOL.heartbeatSec,
  });
});

// ---- authenticated user API --------------------------------------------
const api = new Hono<{
  Bindings: Env;
  Variables: { identity: Identity; accountId: string; status: AccountStatus };
}>();

api.use("*", async (c, next) => {
  await ready(c.env);
  let identity: Identity;
  try {
    identity = await requireIdentity(c.req.raw, c.env);
  } catch (e) {
    if (e instanceof UnauthorizedError) return c.json({ error: e.message }, 401);
    throw e;
  }
  c.set("identity", identity);
  const accountId = await accountFor(c.env, identity);
  c.set("accountId", accountId);
  // Capability gate: nothing but the self-view and a pending user's own
  // registration is reachable until an admin has approved the account.
  const status = (await getAccount(c.env.REGISTRY, accountId))?.status ?? "pending";
  c.set("status", status);
  if (status !== "active") {
    const path = c.req.path;
    const selfView = c.req.method === "GET" && path === "/api/me";
    const register = c.req.method === "POST" && path === "/api/register" && status === "pending";
    if (!selfView && !register) return c.json({ error: "account not active", status }, 403);
  }
  await next();
});

// Self-view: readable in any status so the UI can render the right screen.
api.get("/me", async (c) => {
  const acct = await getAccount(c.env.REGISTRY, c.get("accountId"));
  return c.json({
    email: c.get("identity").email,
    accountId: c.get("accountId"),
    admin: isAdmin(c.get("identity"), c.env),
    status: c.get("status"),
    requested: !!acct?.requested_at,
    note: acct?.note ?? null,
  });
});

// A pending user asks for access (idempotent); best-effort notifies the admin.
api.post("/register", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { note?: string };
  await setRequested(c.env.REGISTRY, c.get("accountId"), body.note?.slice(0, 500) ?? null);
  await notifyAdmin(c.env, c.get("identity").email, body.note ?? null);
  return c.json({ ok: true, status: "pending" });
});

api.get("/status", async (c) => c.json(await tenant(c.env, c.get("accountId")).getStatus()));

// Dev-only: trigger the seal/recompute/prune maintenance the alarm runs nightly.
api.post("/dev/maintenance", async (c) => {
  if (c.env.DEV_MODE !== "1") return c.json({ error: "not found" }, 404);
  return c.json(await tenant(c.env, c.get("accountId")).runMaintenanceNow());
});

api.get("/week", async (c) => {
  const offset = Number(c.req.query("offset") ?? "0");
  const ledger: Ledger = c.req.query("ledger") === "personal" ? "personal" : "work";
  return c.json(await tenant(c.env, c.get("accountId")).weekView(offset, ledger));
});

api.get("/settings", async (c) => c.json(await tenant(c.env, c.get("accountId")).getSettings()));

api.put("/settings", async (c) => {
  const patch = (await c.req.json()) as Partial<Settings>;
  try {
    return c.json(await tenant(c.env, c.get("accountId")).putSettings(patch));
  } catch (e) {
    // Settings validation rejects the write fail-fast; that is a client error.
    return c.json({ error: (e as Error).message }, 400);
  }
});

api.post("/corrections", async (c) => {
  const body = (await c.req.json()) as {
    kind: "add_work" | "remove_work" | "holiday";
    start: number;
    end: number;
    note?: string;
    ledger?: string;
  };
  if (body.kind !== "add_work" && body.kind !== "remove_work" && body.kind !== "holiday") {
    return c.json({ error: "invalid correction kind" }, 400);
  }
  const ledger: Ledger = body.ledger === "personal" ? "personal" : "work";
  const id = await tenant(c.env, c.get("accountId")).addCorrection(
    body.kind,
    body.start,
    body.end,
    body.note ?? null,
    ledger,
  );
  return c.json({ ok: true, id });
});

// "Move to other side": one atomic gesture that excludes a span from the
// ledger the user is viewing and includes it in the other — see
// manual-corrections' "Move a period to the other ledger" requirement.
api.post("/corrections/move", async (c) => {
  const body = (await c.req.json()) as { start?: number; end?: number; fromLedger?: string };
  if (typeof body.start !== "number" || typeof body.end !== "number") {
    return c.json({ error: "start and end required" }, 400);
  }
  const fromLedger: Ledger = body.fromLedger === "personal" ? "personal" : "work";
  const result = await tenant(c.env, c.get("accountId")).moveToOtherLedger(body.start, body.end, fromLedger);
  return c.json({ ok: true, ...result });
});

api.delete("/corrections/:id", async (c) => {
  await tenant(c.env, c.get("accountId")).deleteCorrection(Number(c.req.param("id")));
  return c.json({ ok: true });
});

api.get("/machines", async (c) => {
  const accountId = c.get("accountId");
  // `machines` is the DO's per-machine hostname/last-seen (ingest-derived);
  // `registryMachines` is the durable Machine entity (label, survives key
  // rotation) — the client merges both with `keys` into one row per machine.
  const [keys, machines, registryMachines] = await Promise.all([
    listKeys(c.env.REGISTRY, accountId),
    tenant(c.env, accountId).listMachines(),
    listMachinesForAccount(c.env.REGISTRY, accountId),
  ]);
  return c.json({ keys, machines, registryMachines });
});

api.post("/machines", async (c) => {
  // Secondary guard: key issuance requires an active account even if a future
  // route were mounted outside the gate above.
  if (c.get("status") !== "active") return c.json({ error: "account not active" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { label?: string; role?: string };
  const accountId = c.get("accountId");
  const label = body.label?.trim() || "Unnamed machine";
  const role: MachineRole = body.role === "personal" ? "personal" : "work";
  // Headless key issuance: always a fresh Machine (never label-resolved, same
  // as before), but now with a backing `machine` row from the start rather
  // than the old bare-key legacy path.
  const machine = await createMachine(c.env.REGISTRY, accountId, label, role);
  const key = await issueKeyForMachine(c.env.REGISTRY, accountId, machine.machine_id, label);
  return c.json(key);
});

api.post("/machines/:key/revoke", async (c) => {
  const ok = await revokeKey(c.env.REGISTRY, c.get("accountId"), c.req.param("key"));
  return c.json({ ok });
});

api.post("/machines/:machineId/rename", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { label?: string };
  const label = (body.label ?? "").trim();
  if (!label) return c.json({ error: "label required" }, 400);
  const ok = await renameMachine(c.env.REGISTRY, c.get("accountId"), c.req.param("machineId"), label);
  if (!ok) return c.json({ error: "unknown machine" }, 404);
  return c.json({ ok: true });
});

api.post("/machines/:machineId/role", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { role?: string };
  if (body.role !== "work" && body.role !== "personal") {
    return c.json({ error: "role must be 'work' or 'personal'" }, 400);
  }
  const ok = await setMachineRole(c.env.REGISTRY, c.get("accountId"), c.req.param("machineId"), body.role);
  if (!ok) return c.json({ error: "unknown machine" }, 404);
  return c.json({ ok: true });
});

// ---- admin (allowlist re-check) ----------------------------------------
api.use("/admin/*", async (c, next) => {
  if (!isAdmin(c.get("identity"), c.env)) return c.json({ error: "forbidden" }, 403);
  await next();
});
api.get("/admin/accounts", async (c) => c.json(await listAccounts(c.env.REGISTRY)));

// Registration approval queue.
api.get("/admin/registrations", async (c) => c.json(await listRegistrations(c.env.REGISTRY)));
api.post("/admin/registrations/:id/approve", async (c) => {
  const id = c.req.param("id");
  await approve(c.env.REGISTRY, id, c.get("identity").email);
  await recordAudit(c.env.REGISTRY, c.get("identity").email, "approve_account", id);
  return c.json({ ok: true });
});
api.post("/admin/registrations/:id/reject", async (c) => {
  const id = c.req.param("id");
  await reject(c.env.REGISTRY, id, c.get("identity").email);
  await recordAudit(c.env.REGISTRY, c.get("identity").email, "reject_account", id);
  return c.json({ ok: true });
});

// Users overview (status + machine count) and kick-out / re-enable.
api.get("/admin/users", async (c) => c.json(await listAccountsWithStats(c.env.REGISTRY)));
api.post("/admin/users/:id/disable", async (c) => {
  const id = c.req.param("id");
  await disable(c.env.REGISTRY, id, c.get("identity").email);
  await recordAudit(c.env.REGISTRY, c.get("identity").email, "disable_account", id);
  return c.json({ ok: true });
});
api.post("/admin/users/:id/enable", async (c) => {
  const id = c.req.param("id");
  await approve(c.env.REGISTRY, id, c.get("identity").email);
  await recordAudit(c.env.REGISTRY, c.get("identity").email, "enable_account", id);
  return c.json({ ok: true });
});

api.get("/admin/accounts/:id/keys", async (c) =>
  c.json(await listKeys(c.env.REGISTRY, c.req.param("id"))),
);
api.post("/admin/accounts/:id/keys/:key/revoke", async (c) => {
  const id = c.req.param("id");
  const key = c.req.param("key");
  const ok = await revokeKey(c.env.REGISTRY, id, key);
  await recordAudit(c.env.REGISTRY, c.get("identity").email, "revoke_key", `${id}:${key}`);
  return c.json({ ok });
});
api.get("/admin/audit", async (c) => c.json(await listAudit(c.env.REGISTRY)));

app.route("/api", api);

// ---- QA-only bootstrap: full clean slate + self-minted fixture keys ----
// No pre-existing key needed (unlike /test/*), so the pipeline is fully
// self-provisioning. Gated by QA_TEST_MODE ⇒ 404 in PROD.
app.post("/test/bootstrap", async (c) => {
  if (c.env.QA_TEST_MODE !== "1") return c.json({ error: "not found" }, 404);
  await ready(c.env);
  const email = c.env.QA_FIXTURE_EMAIL ?? "fixtures@local";
  await wipeRegistry(c.env.REGISTRY); // delete ALL accounts/keys → clean slate
  await ensureAccountRow(c.env.REGISTRY, FIXTURE_ACCOUNT_ID, email);
  await tenant(c.env, FIXTURE_ACCOUNT_ID).reset(); // wipe the fixtures tenant's data
  const keys: string[] = [];
  // Two work machines (exercise the union-across-machines path within the
  // work ledger) plus one personal machine (exercises the ledger split).
  for (const [label, role] of [
    ["Laptop", "work"],
    ["Desktop", "work"],
    ["Personal laptop", "personal"],
  ] as const) {
    keys.push((await ensureKey(c.env.REGISTRY, FIXTURE_ACCOUNT_ID, label, role)).access_key);
  }
  return c.json({ accountId: FIXTURE_ACCOUNT_ID, keys });
});

// QA-only account approval/disable so the E2E suite can drive the register →
// approve → use → kick-out lifecycle without a human admin (the smoke's Access
// service-token identity is not on the admin allowlist). Gated by QA_TEST_MODE
// ⇒ absent in PROD, so it can never touch prod accounts.
app.post("/test/approve", async (c) => {
  if (c.env.QA_TEST_MODE !== "1") return c.json({ error: "not found" }, 404);
  await ready(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { accountId?: string };
  if (!body.accountId) return c.json({ error: "accountId required" }, 400);
  await approve(c.env.REGISTRY, body.accountId, "qa-test");
  return c.json({ ok: true });
});
app.post("/test/disable", async (c) => {
  if (c.env.QA_TEST_MODE !== "1") return c.json({ error: "not found" }, 404);
  await ready(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { accountId?: string };
  if (!body.accountId) return c.json({ error: "accountId required" }, 400);
  await disable(c.env.REGISTRY, body.accountId, "qa-test");
  return c.json({ ok: true });
});

// ---- QA-only test surface (wipe/load/validate fixtures) ----------------
// Key-authed and gated by QA_TEST_MODE, which is set ONLY in the QA env — so
// these endpoints do not exist in PROD and can never touch PROD data.
const test = new Hono<{ Bindings: Env; Variables: { acct: string } }>();
test.use("*", async (c, next) => {
  if (c.env.QA_TEST_MODE !== "1") return c.json({ error: "not found" }, 404);
  await ready(c.env);
  const auth = c.req.header("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const resolved = key ? await resolveKey(c.env.REGISTRY, key) : null;
  if (!resolved) return c.json({ error: "invalid access key" }, 401);
  c.set("acct", resolved.account_id);
  await next();
});
test.post("/reset", async (c) => {
  await tenant(c.env, c.get("acct")).reset();
  return c.json({ ok: true });
});
// Mint (or reuse) a machine key under the same account (multi-machine fixtures,
// no manual UI step). Idempotent by label so repeated deploys don't accumulate
// keys in the registry. Role defaults to work, letting fixtures also seed
// personal-role machines.
test.post("/machine", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { label?: string; role?: string };
  const role = body.role === "personal" ? "personal" : "work";
  return c.json(await ensureKey(c.env.REGISTRY, c.get("acct"), body.label ?? "fixture", role));
});
test.post("/correction", async (c) => {
  const b = (await c.req.json()) as {
    kind: "add_work" | "remove_work";
    start: number;
    end: number;
    note?: string;
    ledger?: string;
  };
  const ledger: Ledger = b.ledger === "personal" ? "personal" : "work";
  const id = await tenant(c.env, c.get("acct")).addCorrection(b.kind, b.start, b.end, b.note ?? null, ledger);
  return c.json({ ok: true, id });
});
test.get("/week", async (c) => {
  const offset = Number(c.req.query("offset") ?? "0");
  const ledger: Ledger = c.req.query("ledger") === "personal" ? "personal" : "work";
  return c.json(await tenant(c.env, c.get("acct")).weekView(offset, ledger));
});
test.get("/status", async (c) => {
  return c.json(await tenant(c.env, c.get("acct")).getStatus());
});
// "Move to other side" for fixtures — exercises the same paired-correction
// path the web UI's move action uses.
test.post("/move", async (c) => {
  const b = (await c.req.json()) as { start: number; end: number; fromLedger?: string };
  const fromLedger: Ledger = b.fromLedger === "personal" ? "personal" : "work";
  const result = await tenant(c.env, c.get("acct")).moveToOtherLedger(b.start, b.end, fromLedger);
  return c.json({ ok: true, ...result });
});
app.route("/test", test);

// ---- HTML UI (server-rendered HTMX shell) ------------------------------
app.get("/", async (c) => {
  await ready(c.env);
  try {
    const identity = await requireIdentity(c.req.raw, c.env);
    const accountId = await accountFor(c.env, identity);
    const acct = await getAccount(c.env.REGISTRY, accountId);
    return c.html(
      renderApp(identity, isAdmin(identity, c.env), accountId, {
        status: acct?.status ?? "pending",
        requested: !!acct?.requested_at,
      }),
    );
  } catch (e) {
    if (e instanceof UnauthorizedError) return c.text("Sign in required.", 401);
    throw e;
  }
});

// ---- daemon device-authorization (browser loopback flow) ---------------
// GET renders the approval page (no mutation); POST performs the actual key
// issuance after the human's explicit action, then redirects to the daemon's
// loopback callback with a one-time code (never the key itself). Both are
// reached by the daemon opening a URL in the system browser, so — like "/" —
// they authenticate directly with requireIdentity rather than through the
// /api sub-app (which 403s an inactive account before it can see why).
// `/device/authorize` stays Access-protected (this is where Google login
// happens); `/device/token` below is Access-bypassed, like /ingest.

/** Only 127.0.0.1:<port> — the loopback listener's own bind address. An
 *  unvalidated `cb` would be an open redirect that leaks the one-time
 *  authorization code (and thus the access key) to an attacker-controlled
 *  host; see design.md D2. */
function isLoopbackCallback(cb: string): boolean {
  return /^127\.0\.0\.1:[0-9]{1,5}$/.test(cb);
}

/** Active, recently-seen conflict for a specific Machine, or null. "Recently
 *  seen" reuses the same grace window worktime computation treats a machine
 *  as still alive under (3x heartbeat). Keyed by `machine_id`, not label:
 *  label resolution can drift between the approval page render and the
 *  submit (e.g. a concurrent "separate" choice adds another same-labeled
 *  Machine), so once a Machine is identified the rest of the flow must keep
 *  referring to that exact id, never re-resolve by label. */
async function deviceConflict(
  env: Env,
  accountId: string,
  machineId: string,
): Promise<{ lastSeen: number } | null> {
  const activeKey = await activeKeyForMachine(env.REGISTRY, accountId, machineId);
  if (!activeKey) return null;
  const machines = await tenant(env, accountId).listMachines();
  const row = machines.find((m) => m.machine_id === machineId);
  if (!row) return null; // key active but this machine has never actually ingested — nothing live to conflict with
  if (Date.now() - row.last_seen >= graceMs()) return null;
  return { lastSeen: row.last_seen };
}

app.get("/device/authorize", async (c) => {
  await ready(c.env);
  let identity: Identity;
  try {
    identity = await requireIdentity(c.req.raw, c.env);
  } catch (e) {
    if (e instanceof UnauthorizedError) return c.text("Sign in required.", 401);
    throw e;
  }
  const label = c.req.query("label")?.trim();
  const cb = c.req.query("cb") ?? "";
  const state = c.req.query("state") ?? "";
  if (!label) return c.text("missing label", 400);
  if (!state) return c.text("missing state", 400);
  if (!isLoopbackCallback(cb)) return c.text("invalid callback address", 400);

  const accountId = await accountFor(c.env, identity);
  const acct = await getAccount(c.env.REGISTRY, accountId);
  if (acct?.status !== "active") return c.html(renderDeviceNotActive(acct?.status ?? "pending"));

  const existing = await findMachine(c.env.REGISTRY, accountId, label);
  const conflict = existing ? await deviceConflict(c.env, accountId, existing.machine_id) : null;
  return c.html(renderDeviceApproval(label, cb, state, existing?.machine_id ?? null, conflict));
});

/** Parse a role form field, defaulting to `work` (the pre-selected radio value). */
function parseRole(form: FormData): MachineRole {
  return form.get("role") === "personal" ? "personal" : "work";
}

app.post("/device/authorize", async (c) => {
  await ready(c.env);
  let identity: Identity;
  try {
    identity = await requireIdentity(c.req.raw, c.env);
  } catch (e) {
    if (e instanceof UnauthorizedError) return c.text("Sign in required.", 401);
    throw e;
  }
  const form = await c.req.formData();
  const label = String(form.get("label") ?? "").trim();
  const cb = String(form.get("cb") ?? "");
  const state = String(form.get("state") ?? "");
  const decision = String(form.get("decision") ?? "");
  // Only meaningful when a new Machine is actually created (separate, or no
  // existing match at all) — an existing Machine's role is never re-asked.
  const role = parseRole(form);
  // The exact Machine shown on the approval page (empty when GET found none).
  const pinnedMachineId = String(form.get("machine_id") ?? "").trim() || null;
  if (!label) return c.text("missing label", 400);
  if (!state) return c.text("missing state", 400);
  if (!isLoopbackCallback(cb)) return c.text("invalid callback address", 400);
  if (decision !== "approve" && decision !== "replace" && decision !== "separate") {
    return c.text("invalid decision", 400);
  }

  const accountId = await accountFor(c.env, identity);
  const acct = await getAccount(c.env.REGISTRY, accountId);
  if (acct?.status !== "active") return c.text("account not active", 403);

  let machineId: string;
  if (decision === "separate") {
    machineId = (await createMachine(c.env.REGISTRY, accountId, label, role)).machine_id;
  } else if (pinnedMachineId) {
    // Reuse exactly the Machine the approval page showed — never re-resolve by
    // label (see deviceConflict's doc comment for why that can retarget).
    if (decision === "approve") {
      // Re-check server-side: never trust the client's notion of "no
      // conflict". "approve" is only valid when there truly is none; a live
      // conflict forces an explicit replace-or-separate choice.
      const conflict = await deviceConflict(c.env, accountId, pinnedMachineId);
      if (conflict) {
        return c.text("a machine with this label is already active — choose replace or separate", 409);
      }
    }
    machineId = pinnedMachineId;
  } else {
    machineId = (await resolveOrCreateMachine(c.env.REGISTRY, accountId, label, role)).machine_id;
  }

  const key = await issueKeyForMachine(c.env.REGISTRY, accountId, machineId, label);
  const code = await createDeviceAuthCode(c.env.REGISTRY, accountId, key.access_key, machineId);
  const dest = `http://${cb}/?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  return c.redirect(dest, 302);
});

app.post("/device/token", async (c) => {
  await ready(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { code?: string };
  if (!body.code) return c.json({ error: "code required" }, 400);
  const redeemed = await redeemDeviceAuthCode(c.env.REGISTRY, body.code);
  if (!redeemed) return c.json({ error: "invalid, expired, or already-used code" }, 400);
  // Re-check active: the account could have been disabled in the moment
  // between approval (which already gated on active) and this exchange. The
  // code is spent either way — a re-approval is required on retry.
  const acct = await getAccount(c.env.REGISTRY, redeemed.account_id);
  if (acct?.status !== "active") {
    return c.json({ error: "account not active", status: acct?.status ?? "unknown" }, 403);
  }
  return c.json({ access_key: redeemed.access_key, machine_id: redeemed.machine_id });
});

export default app;
