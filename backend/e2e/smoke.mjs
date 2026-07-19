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

  // --- registration gate: a fresh identity starts pending and cannot mint a key
  // until an admin approves. The QA smoke's Access service token is not on the
  // admin allowlist, so we approve via the QA-only /test/approve (QA_TEST_MODE).
  const me0 = await j("/api/me");
  check("new identity is pending", me0.status === "pending", `status ${me0.status}`);
  const blocked = await fetch(BASE + "/api/machines", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ label: "smoke" }),
  });
  check("pending cannot mint a key (403)", blocked.status === 403, `got ${blocked.status}`);
  await j("/api/register", { method: "POST", body: JSON.stringify({ note: "e2e smoke" }) });
  const meReq = await j("/api/me");
  check("register recorded", meReq.requested === true);
  await j("/test/approve", { method: "POST", body: JSON.stringify({ accountId: me0.accountId }) });
  check("approved → active", (await j("/api/me")).status === "active");

  const key = await j("/api/machines", { method: "POST", body: JSON.stringify({ label: "smoke" }) });
  check("issued access key", typeof key.access_key === "string" && !!key.machine_id);

  // Clean the account's tenant DO before the worktime assertions. /test/bootstrap
  // wipes the registry + the fixtures account, but NOT this (deterministic) smoke
  // account's Durable Object — so a prior same-week run's trailing events (e.g. the
  // kick-out section's open active at 20:00) would otherwise leak +hours into the
  // numbers below. Reset makes the smoke idempotent regardless of run cadence.
  await fetch(BASE + "/test/reset", {
    method: "POST",
    headers: { authorization: `Bearer ${key.access_key}` },
  });

  // Connectivity self-test (what `flexitracker test` calls): read-only, echoes the
  // bound account + machine, sends no activity data.
  const who = await (
    await fetch(BASE + "/whoami", { headers: { authorization: `Bearer ${key.access_key}` } })
  ).json();
  check("whoami echoes account + machine", typeof who.email === "string" && who.machineLabel === "smoke" && who.active === true, JSON.stringify(who));
  const whoBad = await fetch(BASE + "/whoami", { headers: { authorization: "Bearer nope" } });
  check("whoami rejects a bad key (401)", whoBad.status === 401, `got ${whoBad.status}`);

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

  // Direct-timeline-editing payload: a complete partition, the office-day
  // envelope, and per-period correction identity — the fields the select-a-
  // period + whole-day-fill UI consumes. (The fill itself is client-computed
  // from these gap/review periods, so validating them covers it transitively.)
  {
    const d0 = (await j("/api/week?offset=0")).days[0];
    const ps = [...d0.periods].sort((a, b) => a.start - b.start);
    check("partition starts at day start", ps[0].start === d0.dayStart);
    check(
      "partition tiles the day (no gaps/overlaps)",
      ps.every((p, i) => i === 0 || p.start === ps[i - 1].end),
    );
    check("partition ends at day end", ps[ps.length - 1].end === d0.dayStart + 24 * H);
    check(
      "office envelope spans presence within the window",
      !!d0.officeEnvelope && d0.officeEnvelope.start === at(8) && d0.officeEnvelope.end === at(16),
      `env ${JSON.stringify(d0.officeEnvelope)}`,
    );

    const add = await j("/api/corrections", {
      method: "POST",
      body: JSON.stringify({ kind: "add_work", start: at(10), end: at(13) }),
    });
    try {
      const d = (await j("/api/week?offset=0")).days[0];
      const manual = d.periods.find((p) => p.type === "manual_added" && p.start === at(10));
      check(
        "manual period carries its correction id (enables undo)",
        !!manual && (manual.correctionIds || []).includes(add.id),
        `ids ${manual && JSON.stringify(manual.correctionIds)}`,
      );
    } finally {
      await j(`/api/corrections/${add.id}`, { method: "DELETE" }).catch(() => {});
    }
  }

  // Re-include after removal: a remove_work must not permanently defeat a later
  // add_work on the same span (regression — "15–16 is a gap I can't fill back").
  {
    const base = (await j("/api/week?offset=0")).days[0].workedMs; // Monday 8–10 + 13–16 = 5h
    const rm = await j("/api/corrections", {
      method: "POST",
      body: JSON.stringify({ kind: "remove_work", start: at(14), end: at(15) }),
    });
    const afterRemove = (await j("/api/week?offset=0")).days[0].workedMs;
    const add = await j("/api/corrections", {
      method: "POST",
      body: JSON.stringify({ kind: "add_work", start: at(14), end: at(15) }),
    });
    try {
      const afterAdd = (await j("/api/week?offset=0")).days[0].workedMs;
      check("remove_work carves out an hour", afterRemove === base - H, `got ${afterRemove / H}h vs base ${base / H}h`);
      check(
        "add_work re-includes a removed hour (add overrides remove)",
        afterAdd === base,
        `got ${afterAdd / H}h, expected ${base / H}h`,
      );
    } finally {
      await j(`/api/corrections/${rm.id}`, { method: "DELETE" }).catch(() => {});
      await j(`/api/corrections/${add.id}`, { method: "DELETE" }).catch(() => {});
    }
  }

  // Admin bootstrap (local only): an ADMIN_EMAILS identity (non-fixture, so it
  // exercises the getOrCreateAccount admin-active path) is active with no
  // approval step. (On QA the smoke uses a non-admin service token.)
  if (!process.env.CF_ACCESS_CLIENT_ID) {
    const meAdmin = await (
      await fetch(BASE + "/api/me", { headers: { "x-dev-identity": "jaakko.vuori@gmail.com" } })
    ).json();
    check("admin identity is auto-active", meAdmin.status === "active" && meAdmin.admin === true);
  }

  // Seal path (dev only): a fully-past day → maintenance materializes rollup+sessions.
  if (!process.env.CF_ACCESS_CLIENT_ID) {
    const past = monday - 14 * 86400_000 + 9 * H;
    await fetch(BASE + "/ingest", {
      method: "POST",
      headers: { authorization: `Bearer ${key.access_key}`, "content-type": "application/json" },
      body: JSON.stringify({
        batch_seq: 2,
        events: [
          { ts: past, kind: "active" },
          { ts: past + 3 * H, kind: "idle" },
        ],
      }),
    });
    const maint = await j("/api/dev/maintenance", { method: "POST" });
    check("maintenance sealed a rollup", maint.rollups >= 1, JSON.stringify(maint));
    check("maintenance wrote sessions", maint.sessions >= 1);
  }

  // Kick-out (runs last: disabling revokes ALL the account's keys). The key that
  // worked a moment ago must stop being accepted at /ingest once disabled.
  {
    const before = await fetch(BASE + "/ingest", {
      method: "POST",
      headers: { authorization: `Bearer ${key.access_key}`, "content-type": "application/json" },
      body: JSON.stringify({ batch_seq: 20, events: [{ ts: at(20), kind: "active" }] }),
    });
    check("key ingests while active", before.ok, `got ${before.status}`);
    await j("/test/disable", { method: "POST", body: JSON.stringify({ accountId: me0.accountId }) });
    const after = await fetch(BASE + "/ingest", {
      method: "POST",
      headers: { authorization: `Bearer ${key.access_key}`, "content-type": "application/json" },
      body: JSON.stringify({ batch_seq: 21, events: [{ ts: at(21), kind: "active" }] }),
    });
    check("disabled account's key is rejected (401)", after.status === 401, `got ${after.status}`);
    // Re-enable so the (persistent QA) account is left usable for the next run.
    await j("/test/approve", { method: "POST", body: JSON.stringify({ accountId: me0.accountId }) });
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("smoke error:", e.message);
  process.exit(1);
});
