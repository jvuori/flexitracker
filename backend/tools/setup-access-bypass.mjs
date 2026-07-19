// Create the Cloudflare Access "bypass" applications for the daemon/monitoring
// paths (/ingest, /config, /health, /whoami) so non-browser clients aren't challenged.
// Idempotent: re-running reuses existing apps and skips existing bypass policies.
//
// Needs an API token with **Account → Access: Apps and Policies → Edit**:
//   CF_API_TOKEN=... CF_ACCOUNT_ID=e669a42c7e15e30c3898902755a05e04 \
//   HOSTNAME=flexitracker-qa.jaakko-vuori.workers.dev \
//   node tools/setup-access-bypass.mjs

const TOKEN = req("CF_API_TOKEN");
const ACCOUNT = req("CF_ACCOUNT_ID");
const HOSTNAME = process.env.HOSTNAME ?? "flexitracker-qa.jaakko-vuori.workers.dev";
// /test is QA-only (endpoints 404 unless QA_TEST_MODE=1) and key-authed; bypass
// keeps the CI fixtures loader from being challenged by the browser login.
const PATHS = ["ingest", "config", "health", "whoami", "test"];
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

async function main() {
  for (const p of PATHS) {
    const domain = `${HOSTNAME}/${p}`;
    const id = await ensureApp(`flexi-bypass-${p}`, domain);
    await ensureBypassPolicy(id, domain);
  }
  console.log("\nDone. /ingest, /config, /health, /whoami now bypass Access.");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
