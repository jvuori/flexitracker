// Wipe → load → validate the scenario fixtures. Runs identically against local
// wrangler dev and QA (only the way it obtains the first key differs). Every run
// re-materializes the data, so QA can be freely explored between runs.
//
//   Local:  BASE=http://localhost:8787 node e2e/fixtures.mjs
//   QA:     BASE=https://…qa….workers.dev node e2e/fixtures.mjs   (self-provisioning)
//
// PROD PROTECTION (belt and suspenders):
//   1. The /test/* endpoints only exist where QA_TEST_MODE=1 — never in PROD.
//   2. This loader hard-refuses any BASE that looks like prod (below).

import { MACHINES, WEEKS } from "./fixtures.data.mjs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const H = 3600_000;
const MIN = 60_000;

// --- PROD guard: refuse to ever run against production. -------------------
if (/prod/i.test(BASE) || process.env.PROD === "1") {
  console.error(`REFUSING to load test data against a production target: ${BASE}`);
  process.exit(2);
}

let failures = 0;
const check = (name, cond, detail = "") => {
  if (!cond) failures++;
  if (!cond) console.log(`  ✗ ${name}  <-- ${detail}`);
};

async function jf(path, opts = {}, key) {
  const headers = { "content-type": "application/json", ...(opts.headers ?? {}) };
  if (key) headers.authorization = `Bearer ${key}`;
  const r = await fetch(BASE + path, { ...opts, headers });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(body)}`);
  return body;
}

// Monday 00:00 UTC of the week at `offset` weeks from now.
function monday(offset) {
  const now = new Date();
  const dowMon0 = (now.getUTCDay() + 6) % 7;
  const thisMon =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dowMon0 * 86400_000;
  return thisMon + offset * 7 * 86400_000;
}
const tsOf = (offset, wd, [h, m]) => monday(offset) + wd * 86400_000 + (h * 60 + m) * MIN;

// Fully self-provisioning: /test/bootstrap wipes ALL data and returns freshly
// minted machine keys for the fixtures account. No pre-existing key, no manual
// step, identical on local and QA.
async function acquireKeys() {
  const r = await jf("/test/bootstrap", { method: "POST" });
  const keys = r.keys ?? [];
  if (keys.length < MACHINES.length) {
    throw new Error(
      // Never echo the raw response: it carries live machine access keys and CI
      // logs are public on a public repo. Shape only.
      `/test/bootstrap returned ${keys.length} keys, need ${MACHINES.length} ` +
        `(is QA_TEST_MODE=1 and /test bypassed in Access?): ` +
        `${JSON.stringify({ accountId: r.accountId, fields: Object.keys(r ?? {}) })}`,
    );
  }
  return keys;
}

async function main() {
  check("health", (await (await fetch(BASE + "/health")).json()).ok);
  // bootstrap wipes ALL data and returns fresh keys for the fixtures account.
  const keys = await acquireKeys();
  check(`bootstrapped ${MACHINES.length} machine keys`, keys.length === MACHINES.length);

  // Load every week's events + corrections onto the clean slate.
  let seq = 1;
  for (const week of WEEKS) {
    for (const day of week.days) {
      for (const b of day.blocks) {
        await jf(
          "/ingest",
          {
            method: "POST",
            body: JSON.stringify({
              batch_seq: seq++,
              events: [
                { ts: tsOf(week.offset, day.wd, b.s), kind: "active" },
                // `ed` (end weekday) lets a single work effort run past midnight;
                // the calculation splits it at the day boundary via per-day clamp.
                { ts: tsOf(week.offset, b.ed ?? day.wd, b.e), kind: "idle" },
              ],
            }),
          },
          keys[b.m],
        );
      }
      for (const c of day.corrections) {
        await jf(
          "/test/correction",
          {
            method: "POST",
            body: JSON.stringify({
              kind: c.kind,
              start: tsOf(week.offset, day.wd, c.s),
              end: tsOf(week.offset, day.wd, c.e),
            }),
          },
          keys[0],
        );
      }
    }
  }

  // Validate each week against the expected oracle.
  for (const week of WEEKS) {
    console.log(`\n${week.label} (offset ${week.offset}):`);
    const wk = await jf(`/test/week?offset=${week.offset}`, {}, keys[0]);
    for (const day of week.days) {
      const d = wk.days[day.wd];
      const worked = Math.round(d.workedMs / MIN);
      const balance = Math.round(d.balanceMs / MIN);
      const ctx = `${day.label} [worked ${worked}m bal ${balance}m rev ${d.reviewableGaps.length}]`;
      check(ctx, worked === day.expect.worked, `worked ${worked} ≠ ${day.expect.worked}`);
      check(ctx, balance === day.expect.balance, `balance ${balance} ≠ ${day.expect.balance}`);
      check(ctx, d.reviewableGaps.length === day.expect.reviewable, `reviewable ${d.reviewableGaps.length} ≠ ${day.expect.reviewable}`);
      if (day.expect.manualAdded) {
        check(ctx, d.spans.some((s) => s.provenance === "manual_added"), "missing manual_added provenance");
      }
      if (worked === day.expect.worked && balance === day.expect.balance && d.reviewableGaps.length === day.expect.reviewable) {
        console.log(`  ✓ ${day.label}`);
      }
    }
    const wWorked = Math.round(wk.weeklyWorkedMs / MIN);
    const wBal = Math.round(wk.weeklyBalanceMs / MIN);
    check(`weekly total (${wWorked}m)`, wWorked === week.weeklyWorked, `${wWorked} ≠ ${week.weeklyWorked}`);
    check(`weekly balance (${wBal}m)`, wBal === week.weeklyBalance, `${wBal} ≠ ${week.weeklyBalance}`);
  }

  console.log(failures === 0 ? "\nALL FIXTURES VALID" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("fixtures error:", e.message);
  process.exit(1);
});
