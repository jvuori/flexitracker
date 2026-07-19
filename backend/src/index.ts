import { Hono } from "hono";
import type { Env } from "./env";
import { parseEventBatch } from "./schema";
import {
  approve,
  disable,
  ensureAccountRow,
  ensureKey,
  ensureRegistrySchema,
  getAccount,
  getOrCreateAccount,
  issueKey,
  listAccounts,
  listAccountsWithStats,
  listAudit,
  listKeys,
  listRegistrations,
  recordAudit,
  reject,
  resolveKey,
  revokeKey,
  setRequested,
  whoamiForKey,
  wipeRegistry,
  type AccountStatus,
} from "./registry";
import { isAdmin, requireIdentity, UnauthorizedError, type Identity } from "./identity";
import { DAEMON_PROTOCOL } from "./worktime/settings";
import type { Settings } from "./worktime/settings";
import { notifyAdmin } from "./mail";
import { renderApp } from "./ui/render";

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
  return c.json(await tenant(c.env, c.get("accountId")).weekView(offset));
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
  };
  if (body.kind !== "add_work" && body.kind !== "remove_work" && body.kind !== "holiday") {
    return c.json({ error: "invalid correction kind" }, 400);
  }
  const id = await tenant(c.env, c.get("accountId")).addCorrection(
    body.kind,
    body.start,
    body.end,
    body.note ?? null,
  );
  return c.json({ ok: true, id });
});

api.delete("/corrections/:id", async (c) => {
  await tenant(c.env, c.get("accountId")).deleteCorrection(Number(c.req.param("id")));
  return c.json({ ok: true });
});

api.get("/machines", async (c) => {
  const accountId = c.get("accountId");
  const [keys, machines] = await Promise.all([
    listKeys(c.env.REGISTRY, accountId),
    tenant(c.env, accountId).listMachines(),
  ]);
  return c.json({ keys, machines });
});

api.post("/machines", async (c) => {
  // Secondary guard: key issuance requires an active account even if a future
  // route were mounted outside the gate above.
  if (c.get("status") !== "active") return c.json({ error: "account not active" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { label?: string };
  const key = await issueKey(c.env.REGISTRY, c.get("accountId"), body.label ?? null);
  return c.json(key);
});

api.post("/machines/:key/revoke", async (c) => {
  const ok = await revokeKey(c.env.REGISTRY, c.get("accountId"), c.req.param("key"));
  return c.json({ ok });
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
  for (const label of ["Laptop", "Desktop"]) {
    keys.push((await ensureKey(c.env.REGISTRY, FIXTURE_ACCOUNT_ID, label)).access_key);
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
// keys in the registry.
test.post("/machine", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { label?: string };
  return c.json(await ensureKey(c.env.REGISTRY, c.get("acct"), body.label ?? "fixture"));
});
test.post("/correction", async (c) => {
  const b = (await c.req.json()) as {
    kind: "add_work" | "remove_work";
    start: number;
    end: number;
    note?: string;
  };
  const id = await tenant(c.env, c.get("acct")).addCorrection(b.kind, b.start, b.end, b.note ?? null);
  return c.json({ ok: true, id });
});
test.get("/week", async (c) => {
  const offset = Number(c.req.query("offset") ?? "0");
  return c.json(await tenant(c.env, c.get("acct")).weekView(offset));
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

export default app;
