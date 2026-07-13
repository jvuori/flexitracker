// Synthetic-activity generator (local-simulation). Produces a realistic
// multi-day, multi-machine week and posts it through the REAL ingest pipeline
// (not precomputed rollups), so bridging/corrections behave as in production.
//
// Local (dev identity issues the keys automatically):
//   BASE=http://localhost:8789 node tools/seed.mjs
//
// QA/PROD (Access protects /api, so mint keys in the browser — Machines → Add
// machine — and pass them in; /ingest must be bypassed in Access):
//   BASE=https://flexi-worker-cloud-qa.jaakko-vuori.workers.dev \
//   LAPTOP_KEY=xxxx DESKTOP_KEY=yyyy node tools/seed.mjs

const BASE = process.env.BASE ?? "http://localhost:8789";
const IDENTITY = process.env.IDENTITY ?? "dev@local";
const H = 3600_000;

const now = new Date();
const dowMon0 = (now.getUTCDay() + 6) % 7;
const monday =
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dowMon0 * 86400_000;
const day = (d, h, m = 0) => monday + d * 86400_000 + h * H + m * 60_000;

// Mint a key via the API (local/dev only — needs the dev-identity stub).
async function issueKey(label) {
  const r = await fetch(BASE + "/api/machines", {
    method: "POST",
    headers: { "content-type": "application/json", "x-dev-identity": IDENTITY },
    body: JSON.stringify({ label }),
  });
  if (!r.ok) {
    throw new Error(
      `Could not issue a key via /api/machines (${r.status}). On QA/PROD, mint keys in ` +
        `the browser and pass LAPTOP_KEY=… DESKTOP_KEY=… instead.`,
    );
  }
  return (await r.json()).access_key;
}
async function keyFor(label, envKey) {
  return envKey ?? (await issueKey(label));
}

async function post(key, events) {
  const r = await fetch(BASE + "/ingest", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ batch_seq: Math.floor(Math.random() * 1e9), events }),
  });
  if (!r.ok) {
    throw new Error(
      `POST /ingest failed (${r.status}). If this is QA/PROD, ensure /ingest is a ` +
        `Bypass app in Cloudflare Access and the key is valid.`,
    );
  }
}
const block = (s, e) => [
  { ts: s, kind: "active" },
  { ts: e, kind: "idle" },
];

async function main() {
  const laptop = await keyFor("Laptop", process.env.LAPTOP_KEY);
  const desktop = await keyFor("Desktop", process.env.DESKTOP_KEY ?? process.env.LAPTOP_KEY);

  // A block on weekday `d`, from [h,m] to [h,m] — hours ≥ 24 roll into the next
  // day, so a single effort can run past midnight (the calculation splits it at
  // the day boundary into two periods).
  const B = (d, s, e) => block(day(d, ...s), day(d, ...e));

  // Natural start/stop variation — nobody clocks in at 08:00:00. Mornings on the
  // laptop with a short coffee gap (auto-bridged), afternoons on the desktop.
  // Mon: realistic day, coffee + lunch gaps bridged.
  await post(laptop, [...B(0, [8, 6], [10, 9]), ...B(0, [10, 27], [12, 4])]);
  await post(desktop, B(0, [12, 46], [16, 12]));
  // Tue: early bird, plus an out-of-hours evening session (counted per burst).
  await post(laptop, B(1, [7, 51], [12, 13]));
  await post(desktop, [...B(1, [12, 49], [15, 34]), ...B(1, [19, 40], [21, 8])]);
  // Wed: long midday meeting gap → reviewable (left uncorrected for the demo).
  await post(laptop, B(2, [8, 17], [11, 52]));
  await post(desktop, B(2, [14, 33], [16, 21]));
  // Thu: normal day + a late session that runs past midnight into Fri.
  await post(laptop, [...B(3, [8, 3], [10, 6]), ...B(3, [10, 24], [12, 1])]);
  await post(desktop, [...B(3, [12, 44], [16, 8]), ...B(3, [22, 47], [24, 41])]); // → Fri 00:41
  // Fri: shorter day + a late session running past midnight into Sat.
  await post(laptop, B(4, [8, 23], [12, 12]));
  await post(desktop, B(4, [23, 9], [25, 22])); // → Sat 01:22

  console.log(
    `seeded week of ${new Date(monday).toISOString().slice(0, 10)} at ${BASE}\n` +
      `open the UI and check the Week view (times are in the account timezone; set it in Settings).`,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
