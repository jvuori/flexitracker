// Create (idempotently) the PROTECTED Cloudflare Access application that guards
// the browser UI for a given hostname, wired to the existing Google IdP. Prints
// the generated **AUD** to paste into wrangler.toml ([env.<env>.vars].ACCESS_AUD).
//
// Why this exists: renaming a Worker changes its hostname, so its Access app +
// AUD must be recreated; and PROD needs its own app on the custom domain. This
// codifies what was previously a manual dashboard step.
//
// Needs an API token with Account → Access: Apps and Policies: Edit (+ read of
// Identity Providers). If IdP listing is blocked, pass ACCESS_IDP_ID explicitly.
//
//   CF_API_TOKEN=... CF_ACCOUNT_ID=e669a42c7e15e30c3898902755a05e04 \
//   HOSTNAME=flexitracker-qa.jaakko-vuori.workers.dev \
//   ADD_CI_SERVICE_TOKEN=1 \            # QA only: let the CI service token in
//   node tools/setup-access-app.mjs

const TOKEN = req("CF_API_TOKEN");
const ACCOUNT = req("CF_ACCOUNT_ID");
const HOSTNAME = req("HOSTNAME");
const ADD_CI = process.env.ADD_CI_SERVICE_TOKEN === "1";
const IDP_OVERRIDE = process.env.ACCESS_IDP_ID;
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

async function googleIdpId() {
  if (IDP_OVERRIDE) return IDP_OVERRIDE;
  const idps = await cf("GET", `/accounts/${ACCOUNT}/access/identity_providers`);
  const google = idps.filter((i) => String(i.type).startsWith("google"));
  if (google.length === 0) {
    throw new Error(
      `No Google IdP found (types: ${idps.map((i) => i.type).join(", ") || "none"}). ` +
        `Create the Google IdP once, or pass ACCESS_IDP_ID.`,
    );
  }
  if (google.length > 1) {
    throw new Error(
      `Multiple Google IdPs: ${google.map((i) => `${i.name}=${i.id}`).join(", ")}. Pass ACCESS_IDP_ID.`,
    );
  }
  console.log(`Google IdP: ${google[0].name} (${google[0].id})`);
  return google[0].id;
}

async function ensureApp(idpId) {
  const apps = await cf("GET", `/accounts/${ACCOUNT}/access/apps`);
  const existing = apps.find((a) => a.domain === HOSTNAME);
  if (existing) {
    console.log(`app exists: ${HOSTNAME} (${existing.id})`);
    return existing;
  }
  const app = await cf("POST", `/accounts/${ACCOUNT}/access/apps`, {
    name: `FlexiTracker (${HOSTNAME})`,
    domain: HOSTNAME,
    type: "self_hosted",
    session_duration: "24h",
    allowed_idps: [idpId],
    auto_redirect_to_identity: true,
  });
  console.log(`created app: ${HOSTNAME} (${app.id})`);
  return app;
}

async function ensureAllowPolicy(appId) {
  const policies = await cf("GET", `/accounts/${ACCOUNT}/access/apps/${appId}/policies`);
  if (policies.some((p) => p.decision === "allow")) {
    console.log("  allow policy already present");
    return;
  }
  // Google-authenticated humans (allowed_idps already restricts to Google), plus
  // the CI service token on QA so the post-deploy smoke can call authed routes.
  const include = [{ everyone: {} }];
  if (ADD_CI) include.push({ any_valid_service_token: {} });
  await cf("POST", `/accounts/${ACCOUNT}/access/apps/${appId}/policies`, {
    name: "allow-google" + (ADD_CI ? "-and-ci" : ""),
    decision: "allow",
    include,
  });
  console.log(`  added allow policy${ADD_CI ? " (+ CI service token)" : ""}`);
}

async function main() {
  const idpId = await googleIdpId();
  const app = await ensureApp(idpId);
  await ensureAllowPolicy(app.id);
  console.log("\n==================== ACCESS_AUD ====================");
  console.log(app.aud);
  console.log("===================================================");
  console.log(`Paste into wrangler.toml under the matching [env.*.vars] as ACCESS_AUD.`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
