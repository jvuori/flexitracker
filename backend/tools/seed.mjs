// Synthetic-activity generator (local-simulation). Produces a realistic
// multi-day, multi-machine week and posts it through the REAL ingest pipeline
// (not precomputed rollups), so bridging/corrections behave as in production.
//
//   BASE=http://localhost:8789 IDENTITY=dev@local node tools/seed.mjs

const BASE = process.env.BASE ?? "http://localhost:8789";
const IDENTITY = process.env.IDENTITY ?? "dev@local";
const H = 3600_000;
const userHeaders = { "content-type": "application/json", "x-dev-identity": IDENTITY };

const now = new Date();
const dowMon0 = (now.getUTCDay() + 6) % 7;
const monday =
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dowMon0 * 86400_000;
const day = (d, h, m = 0) => monday + d * 86400_000 + h * H + m * 60_000;

async function issueKey(label) {
  const r = await fetch(BASE + "/api/machines", {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({ label }),
  });
  return (await r.json()).access_key;
}
async function post(key, events) {
  await fetch(BASE + "/ingest", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ batch_seq: Math.floor(Math.random() * 1e9), events }),
  });
}
const block = (s, e) => [
  { ts: s, kind: "active" },
  { ts: e, kind: "idle" },
];

async function main() {
  const laptop = await issueKey("Laptop");
  const desktop = await issueKey("Desktop");

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

  console.log(`seeded week of ${new Date(monday).toISOString().slice(0, 10)} for ${IDENTITY}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
