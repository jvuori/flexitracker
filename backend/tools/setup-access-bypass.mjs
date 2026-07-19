// Create the Cloudflare Access "bypass" applications for the daemon/monitoring
// paths (/ingest, /config, /health, /whoami) so non-browser clients aren't challenged.
// Idempotent: re-running reuses existing apps and skips existing bypass policies.
//
// Needs an API token with **Account → Access: Apps and Policies → Edit**:
//   CF_API_TOKEN=... CF_ACCOUNT_ID=<your-account-id> \
//   HOSTNAME=flexitracker-qa.jaakko-vuori.workers.dev \
//   node tools/setup-access-bypass.mjs

const TOKEN = req("CF_API_TOKEN");
const ACCOUNT = req("CF_ACCOUNT_ID");
const HOSTNAME = process.env.HOSTNAME ?? "flexitracker-qa.jaakko-vuori.workers.dev";
// /test is QA-ONLY: the endpoints 404 unless QA_TEST_MODE=1 (set only in the QA
// env), and its bypass keeps the CI fixtures loader off the browser login page.
// PROD must never carry a /test bypass — even though the routes don't exist
// there, an unauthenticated bypass contradicts the PROD data firewall. Any
// stray /test app on a non-QA hostname is deleted below.
const INCLUDE_TEST = process.env.INCLUDE_TEST_BYPASS === "1";
const PATHS = ["ingest", "config", "health", "whoami", ...(INCLUDE_TEST ? ["test"] : [])];
const REMOVE_PATHS = INCLUDE_TEST ? [] : ["test"];
const API = "https://api.cloudflare.com/client/v4";

function req(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function cf(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!j.success) {
    throw new Error(`${method} ${path} failed: ${JSON.stringify(j.errors ?? j)}`);
  }
  return j.result;
}

async function ensureApp(name, domain) {
  const apps = await cf("GET", `/accounts/${ACCOUNT}/access/apps`);
  const existing = apps.find((a) => a.domain === domain);
  if (existing) {
    console.log(`app exists: ${domain} (${existing.id})`);
    return existing.id;
  }
  const app = await cf("POST", `/accounts/${ACCOUNT}/access/apps`, {
    name,
    domain,
    type: "self_hosted",
    session_duration: "24h",
  });
  console.log(`created app: ${domain} (${app.id})`);
  return app.id;
}

async function ensureBypassPolicy(appId, domain) {
  const policies = await cf("GET", `/accounts/${ACCOUNT}/access/apps/${appId}/policies`);
  if (policies.some((p) => p.decision === "bypass")) {
    console.log(`  bypass policy already present`);
    return;
  }
  await cf("POST", `/accounts/${ACCOUNT}/access/apps/${appId}/policies`, {
    name: "bypass",
    decision: "bypass",
    include: [{ everyone: {} }],
  });
  console.log(`  added bypass/Everyone policy for ${domain}`);
}

async function removeApp(domain) {
  const apps = await cf("GET", `/accounts/${ACCOUNT}/access/apps`);
  const existing = apps.find((a) => a.domain === domain);
  if (!existing) return;
  await cf("DELETE", `/accounts/${ACCOUNT}/access/apps/${existing.id}`);
  console.log(`removed bypass app: ${domain} (${existing.id})`);
}

async function main() {
  for (const p of PATHS) {
    const domain = `${HOSTNAME}/${p}`;
    const id = await ensureApp(`flexi-bypass-${p}`, domain);
    await ensureBypassPolicy(id, domain);
  }
  // Sweep bypasses that must not exist on this hostname (e.g. /test on PROD).
  for (const p of REMOVE_PATHS) {
    await removeApp(`${HOSTNAME}/${p}`);
  }
  console.log(`\nDone. ${PATHS.map((p) => "/" + p).join(", ")} bypass Access.`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
