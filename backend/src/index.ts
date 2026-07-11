import { Hono } from "hono";
import type { Env } from "./env";
import { parseEventBatch } from "./schema";
import {
  ensureRegistrySchema,
  getOrCreateAccount,
  issueKey,
  listAccounts,
  listKeys,
  resolveKey,
  revokeKey,
} from "./registry";
import { isAdmin, requireIdentity, UnauthorizedError, type Identity } from "./identity";
import type { Settings } from "./worktime/settings";
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

const app = new Hono<{ Bindings: Env; Variables: { identity: Identity; accountId: string } }>();

app.get("/health", (c) => c.json({ ok: true, service: "flexi-worker-cloud" }));

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

// ---- daemon config (access-key auth) — thresholds pushed from settings --
app.get("/config", async (c) => {
  await ready(c.env);
  const auth = c.req.header("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const resolved = key ? await resolveKey(c.env.REGISTRY, key) : null;
  if (!resolved) return c.json({ error: "invalid access key" }, 401);
  const s = await tenant(c.env, resolved.account_id).getSettings();
  return c.json({
    minInactivitySec: s.minInactivitySec,
    minActivitySec: s.minActivitySec,
    heartbeatSec: s.heartbeatSec,
  });
});

// ---- authenticated user API --------------------------------------------
const api = new Hono<{ Bindings: Env; Variables: { identity: Identity; accountId: string } }>();

api.use("*", async (c, next) => {
  await ready(c.env);
  let identity: Identity;
  try {
    identity = await requireIdentity(c.req.raw, c.env);
  } catch (e) {
    if (e instanceof UnauthorizedError) return c.json({ error: e.message }, 401);
    throw e;
  }
  const account = await getOrCreateAccount(c.env.REGISTRY, identity.sub, identity.email);
  c.set("identity", identity);
  c.set("accountId", account.account_id);
  await next();
});

api.get("/status", async (c) => c.json(await tenant(c.env, c.get("accountId")).getStatus()));

api.get("/week", async (c) => {
  const offset = Number(c.req.query("offset") ?? "0");
  return c.json(await tenant(c.env, c.get("accountId")).weekView(offset));
});

api.get("/settings", async (c) => c.json(await tenant(c.env, c.get("accountId")).getSettings()));

api.put("/settings", async (c) => {
  const patch = (await c.req.json()) as Partial<Settings>;
  return c.json(await tenant(c.env, c.get("accountId")).putSettings(patch));
});

api.post("/corrections", async (c) => {
  const body = (await c.req.json()) as {
    kind: "add_work" | "remove_work";
    start: number;
    end: number;
    note?: string;
  };
  if (body.kind !== "add_work" && body.kind !== "remove_work") {
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
api.get("/admin/accounts/:id/keys", async (c) =>
  c.json(await listKeys(c.env.REGISTRY, c.req.param("id"))),
);
api.post("/admin/accounts/:id/keys/:key/revoke", async (c) => {
  const ok = await revokeKey(c.env.REGISTRY, c.req.param("id"), c.req.param("key"));
  return c.json({ ok });
});

app.route("/api", api);

// ---- HTML UI (server-rendered HTMX shell) ------------------------------
app.get("/", async (c) => {
  await ready(c.env);
  try {
    const identity = await requireIdentity(c.req.raw, c.env);
    const account = await getOrCreateAccount(c.env.REGISTRY, identity.sub, identity.email);
    return c.html(renderApp(identity, isAdmin(identity, c.env), account.account_id));
  } catch (e) {
    if (e instanceof UnauthorizedError) return c.text("Sign in required.", 401);
    throw e;
  }
});

export default app;
