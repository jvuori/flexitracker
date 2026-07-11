// End-to-end smoke test against a running instance (local wrangler dev or QA).
// Drives the real path: issue key → ingest → week view → correction round-trip.
//
//   Local:  BASE=http://localhost:8787 node e2e/smoke.mjs
//   QA:     BASE=https://qa... CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... node e2e/smoke.mjs

const BASE = process.env.BASE ?? "http://localhost:8787";
const H = 3600_000;
const RUN = Math.random().toString(36).slice(2, 8);

// User routes: Access service token on QA, a fresh dev identity locally.
const userAuth =
  process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET
    ? {
        "cf-access-client-id": process.env.CF_ACCESS_CLIENT_ID,
        "cf-access-client-secret": process.env.CF_ACCESS_CLIENT_SECRET,
      }
    : { "x-dev-identity": `e2e-${RUN}@local` };
const jsonHeaders = { "content-type": "application/json", ...userAuth };

let failures = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  <-- " + detail}`);
  if (!cond) failures++;
}
async function j(path, opts = {}) {
  const r = await fetch(BASE + path, { headers: jsonHeaders, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(body)}`);
  return body;
}

// Monday 00:00 UTC of the current week (stable target; identical posts merge).
const now = new Date();
const dowMon0 = (now.getUTCDay() + 6) % 7;
const monday =
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dowMon0 * 86400_000;
const at = (h) => monday + h * H;

async function run() {
  check("health", (await (await fetch(BASE + "/health")).json()).ok);

  const key = await j("/api/machines", { method: "POST", body: JSON.stringify({ label: "smoke" }) });
  check("issued access key", typeof key.access_key === "string" && !!key.machine_id);

  const events = [
    { ts: at(8), kind: "active" },
    { ts: at(10), kind: "idle" },
    { ts: at(13), kind: "active" },
    { ts: at(16), kind: "idle" },
  ];
  const ingest = (batch_seq) =>
    fetch(BASE + "/ingest", {
      method: "POST",
      headers: { authorization: `Bearer ${key.access_key}`, "content-type": "application/json" },
      body: JSON.stringify({ batch_seq, events }),
    }).then((r) => r.json());

  check("ingest accepted", (await ingest(1)).duplicate === false);
  check("ingest idempotent on batch_seq", (await ingest(1)).duplicate === true);

  let mon = (await j("/api/week?offset=0")).days[0];
  check("Monday gross = 5h (long gap not bridged)", mon.grossMs === 5 * H, `got ${mon.grossMs / H}h`);
  check("one reviewable gap surfaced", mon.reviewableGaps.length === 1);

  const corr = await j("/api/corrections", {
    method: "POST",
    body: JSON.stringify({ kind: "add_work", start: at(10), end: at(13) }),
  });
  try {
    mon = (await j("/api/week?offset=0")).days[0];
    check("after include, worked = 7.5h (8h − lunch)", mon.workedMs === 7.5 * H, `got ${mon.workedMs / H}h`);
    check("reviewable gap cleared", mon.reviewableGaps.length === 0);
    check("manual_added provenance present", mon.spans.some((s) => s.provenance === "manual_added"));

    const removed = (await j("/api/week?offset=0")).days[0];
    check("status resolves", ["active", "idle", "unknown"].includes((await j("/api/status")).state));
    void removed;
  } finally {
    // Clean up so the run is repeatable against a persistent QA account.
    await j(`/api/corrections/${corr.id}`, { method: "DELETE" }).catch(() => {});
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("smoke error:", e.message);
  process.exit(1);
});
