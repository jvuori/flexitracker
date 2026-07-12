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

  // Mon–Fri: mornings on the laptop with a short coffee gap (auto-bridged),
  // afternoons on the desktop; Wed has a long midday gap (a meeting → reviewable);
  // Thu evening has some extra work (out-of-hours, counted per burst).
  for (let d = 0; d < 5; d++) {
    await post(laptop, [
      ...block(day(d, 8), day(d, 10)),
      ...block(day(d, 10, 20), day(d, 12)), // 20-min coffee gap → bridged
    ]);
    if (d === 2) {
      await post(desktop, block(day(d, 14, 30), day(d, 16, 30))); // gap 12:00–14:30 → reviewable
    } else {
      await post(desktop, block(day(d, 13), day(d, 16, 30)));
    }
  }
  await post(laptop, block(day(3, 20), day(3, 21, 15))); // Thu evening extra

  console.log(
    `seeded week of ${new Date(monday).toISOString().slice(0, 10)} at ${BASE}\n` +
      `open the UI and check the Week view (times are in the account timezone; set it in Settings).`,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
