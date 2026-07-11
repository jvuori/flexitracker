import { Hono } from "hono";
import type { Env } from "./env";

export { TenantDO } from "./tenant-do";
export type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true, service: "flexi-worker-cloud" }));

// Write path — access-key auth, key→account resolution, routing to the tenant
// DO, and idempotent dedupe are implemented in the event-ingestion tasks.
app.post("/ingest", (c) => c.text("not implemented", 501));

export default app;
