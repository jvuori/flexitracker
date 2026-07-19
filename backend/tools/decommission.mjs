// Decommission a retired hostname / Worker: delete its Cloudflare Access apps
// (the protected app + every /path bypass app) and optionally the Worker script.
// Used after a rename leaves the old resources orphaned.
//
// DESTRUCTIVE — three guards, all must pass:
//   1. Dry-run by default. Nothing is deleted unless CONFIRM === HOSTNAME.
//   2. Refuses any hostname/Worker still declared in wrangler.toml, so a LIVE
//      environment can never be deleted by a typo (the live names are exactly
//      the ones under version control).
//   3. Prints the full deletion plan before acting.
//
//   CF_API_TOKEN=... CF_ACCOUNT_ID=<your-account-id> \
//   HOSTNAME=old-host.example.workers.dev \
//   WORKER_NAME=old-worker \            # optional
//   CONFIRM=old-host.example.workers.dev \   # omit for a dry run
//   node tools/decommission.mjs

import { readFileSync } from "node:fs";

const TOKEN = req("CF_API_TOKEN");
const ACCOUNT = req("CF_ACCOUNT_ID");
const HOSTNAME = req("HOSTNAME");
const WORKER_NAME = process.env.WORKER_NAME ?? "";
const CONFIRM = process.env.CONFIRM ?? "";
const API = "https://api.cloudflare.com/client/v4";
const LIVE = CONFIRM === HOSTNAME;

function req(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function cf(method, path) {
  const r = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
  });
  const j = await r.json().catch(() => ({ success: r.ok }));
  if (!j.success) throw new Error(`${method} ${path} failed: ${JSON.stringify(j.errors ?? j)}`);
  return j.result;
}

/** Names/hostnames still under version control — these are LIVE, never deletable. */
function protectedNames() {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const grab = (re) => [...toml.matchAll(re)].map((m) => m[1]);
  return new Set([
    ...grab(/^\s*name\s*=\s*"([^"]+)"/gm), // worker names (incl. every [env.*])
    ...grab(/^\s*pattern\s*=\s*"([^"]+)"/gm), // custom-domain routes
  ]);
}

async function main() {
  const live = protectedNames();
  for (const target of [HOSTNAME, WORKER_NAME].filter(Boolean)) {
    // A hostname like <worker>.<sub>.workers.dev embeds the worker name.
    const bare = target.split(".")[0];
    if (live.has(target) || live.has(bare)) {
      console.error(
        `REFUSING: "${target}" is still declared in wrangler.toml (live). ` +
          `Remove it from config before decommissioning.`,
      );
      process.exit(2);
    }
  }

  const apps = await cf("GET", `/accounts/${ACCOUNT}/access/apps`);
  const doomed = apps.filter((a) => a.domain === HOSTNAME || a.domain.startsWith(`${HOSTNAME}/`));

  console.log(`\nPlan for ${HOSTNAME}${WORKER_NAME ? ` (+ Worker "${WORKER_NAME}")` : ""}:`);
  if (doomed.length === 0) console.log("  (no Access apps match)");
  for (const a of doomed) console.log(`  delete Access app  ${a.domain}  (${a.id})`);
  if (WORKER_NAME) console.log(`  delete Worker      ${WORKER_NAME}  (and its Durable Object data)`);

  if (!LIVE) {
    console.log(`\nDRY RUN — nothing deleted. Set CONFIRM="${HOSTNAME}" to execute.`);
    return;
  }

  console.log("\nExecuting:");
  for (const a of doomed) {
    await cf("DELETE", `/accounts/${ACCOUNT}/access/apps/${a.id}`);
    console.log(`  deleted Access app ${a.domain}`);
  }
  if (WORKER_NAME) {
    await cf("DELETE", `/accounts/${ACCOUNT}/workers/scripts/${WORKER_NAME}?force=true`);
    console.log(`  deleted Worker ${WORKER_NAME}`);
  }
  console.log("\nDone.");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
