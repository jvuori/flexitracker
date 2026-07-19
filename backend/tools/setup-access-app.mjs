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
//   CF_API_TOKEN=... CF_ACCOUNT_ID=<your-account-id> \
//   HOSTNAME=flexitracker-qa.jaakko-vuori.workers.dev \
//   (QA vs PROD is derived from HOSTNAME — no flag to forget)
//   node tools/setup-access-app.mjs

const TOKEN = req("CF_API_TOKEN");
const ACCOUNT = req("CF_ACCOUNT_ID");
const HOSTNAME = req("HOSTNAME");
// QA-ness is derived from the HOSTNAME, never a dispatch flag: a forgotten flag
// would otherwise prune QA's CI service-token policy and break the post-deploy
// smoke (and would drop auto-redirect on PROD).
const ADD_CI = /(^|[.-])qa([.-]|$)/i.test(HOSTNAME);
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
  // A service token is not an interactive identity, so auto-redirect-to-IdP must
  // be OFF wherever the CI token must authenticate (QA) — otherwise Access sends
  // the login page instead of evaluating the service-token policy.
  const cfg = {
    name: `FlexiTracker (${HOSTNAME})`,
    domain: HOSTNAME,
    type: "self_hosted",
    session_duration: "24h",
    allowed_idps: [idpId],
    auto_redirect_to_identity: !ADD_CI,
  };
  const apps = await cf("GET", `/accounts/${ACCOUNT}/access/apps`);
  const existing = apps.find((a) => a.domain === HOSTNAME);
  if (existing) {
    const app = await cf("PUT", `/accounts/${ACCOUNT}/access/apps/${existing.id}`, cfg);
    console.log(`app updated: ${HOSTNAME} (${app.id})`);
    return app;
  }
  const app = await cf("POST", `/accounts/${ACCOUNT}/access/apps`, cfg);
  console.log(`app created: ${HOSTNAME} (${app.id})`);
  return app;
}

async function ensurePolicy(appId, name, decision, include) {
  const policies = await cf("GET", `/accounts/${ACCOUNT}/access/apps/${appId}/policies`);
  const existing = policies.find((p) => p.name === name);
  const body = { name, decision, include };
  if (existing) {
    await cf("PUT", `/accounts/${ACCOUNT}/access/apps/${appId}/policies/${existing.id}`, body);
    console.log(`  policy updated: ${name} (${decision})`);
  } else {
    await cf("POST", `/accounts/${ACCOUNT}/access/apps/${appId}/policies`, body);
    console.log(`  policy created: ${name} (${decision})`);
  }
}

async function prunePolicies(appId, keep) {
  const policies = await cf("GET", `/accounts/${ACCOUNT}/access/apps/${appId}/policies`);
  for (const p of policies) {
    if (keep.has(p.name)) continue;
    await cf("DELETE", `/accounts/${ACCOUNT}/access/apps/${appId}/policies/${p.id}`);
    console.log(`  policy pruned: ${p.name} (${p.decision})`);
  }
}

async function main() {
  const idpId = await googleIdpId();
  const app = await ensureApp(idpId);

  const keep = new Set();
  // Humans authenticated via the (only) allowed Google IdP.
  await ensurePolicy(app.id, "allow-google", "allow", [{ everyone: {} }]);
  keep.add("allow-google");
  // CI service token as a dedicated **Service Auth** policy (decision
  // "non_identity") — the only decision that authorizes a non-interactive
  // service token; a plain "allow" include still forces interactive auth. Lets
  // QA's post-deploy smoke reach authed /api/* routes.
  if (ADD_CI) {
    await ensurePolicy(app.id, "ci-service-token", "non_identity", [
      { any_valid_service_token: {} },
    ]);
    keep.add("ci-service-token");
  }
  // Remove any other policies (e.g. debugging leftovers) so the app carries
  // exactly the intended set.
  await prunePolicies(app.id, keep);

  // Diagnostics: dump the effective app + policy config.
  const policies = await cf("GET", `/accounts/${ACCOUNT}/access/apps/${app.id}/policies`);
  console.log(
    `\napp: auto_redirect_to_identity=${app.auto_redirect_to_identity} allowed_idps=${JSON.stringify(app.allowed_idps)}`,
  );
  console.log(
    `policies: ${JSON.stringify(policies.map((p) => ({ name: p.name, decision: p.decision, include: p.include })))}`,
  );

  console.log("\n==================== ACCESS_AUD ====================");
  console.log(app.aud);
  console.log("===================================================");
  console.log(`Paste into wrangler.toml under the matching [env.*.vars] as ACCESS_AUD.`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
