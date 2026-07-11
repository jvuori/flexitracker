// End-to-end smoke test against a running instance (local wrangler dev or QA).
// Drives the real path: issue key → ingest → week view → correction round-trip.
// Usage: BASE=http://localhost:8787 node e2e/smoke.mjs

const BASE = process.env.BASE ?? "http://localhost:8787";
const DEV = { "x-dev-identity": "dev@local", "content-type": "application/json" };
const H = 3600_000;

let failures = 0;
function check(name, cond, detail = "") {
  const ok = !!cond;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : "  <-- " + detail}`);
  if (!ok) failures++;
}
async function j(path, opts = {}) {
  const r = await fetch(BASE + path, { headers: DEV, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(body)}`);
  return body;
}

// Monday 00:00 UTC of the current week.
const now = new Date();
const dowMon0 = (now.getUTCDay() + 6) % 7;
const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dowMon0 * 86400_000;
const at = (h, m = 0) => monday + h * H + m * 60_000;

const run = async () => {
  check("health", (await (await fetch(BASE + "/health")).json()).ok);

  const key = await j("/api/machines", {
    method: "POST",
    body: JSON.stringify({ label: "smoke" }),
  });
  check("issued access key", typeof key.access_key === "string" && key.machine_id);

  // Two active blocks with a 3h in-hours gap (10:00–13:00) → reviewable.
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

  const first = await ingest(1);
  check("ingest accepted", first.ok && first.duplicate === false);
  const dup = await ingest(1);
  check("ingest idempotent on batch_seq", dup.duplicate === true);

  let week = await j("/api/week?offset=0");
  let mon = week.days[0];
  check("Monday gross = 5h (gap not bridged)", mon.grossMs === 5 * H, `got ${mon.grossMs / H}h`);
  check("one reviewable gap surfaced", mon.reviewableGaps.length === 1);

  await j("/api/corrections", {
    method: "POST",
    body: JSON.stringify({ kind: "add_work", start: at(10), end: at(13) }),
  });
  week = await j("/api/week?offset=0");
  mon = week.days[0];
  check("after include, worked = 7.5h (8h - lunch)", mon.workedMs === 7.5 * H, `got ${mon.workedMs / H}h`);
  check("reviewable gap cleared", mon.reviewableGaps.length === 0);
  check("manual_added provenance present", mon.spans.some((s) => s.provenance === "manual_added"));

  const status = await j("/api/status");
  check("status resolved", status.state === "active" || status.state === "idle");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error("smoke error:", e.message);
  process.exit(1);
});
