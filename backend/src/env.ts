// Worker + Durable Object bindings and configuration.
export interface Env {
  /** Per-account tenant Durable Objects (SQLite). */
  TENANT: DurableObjectNamespace<import("./tenant-do").TenantDO>;
  /** Global registry: identities and access keys → internal account_id. */
  REGISTRY: D1Database;

  /** "1" enables the local identity stub (X-Dev-Identity) — never in prod. */
  DEV_MODE?: string;
  /** Default identity used in dev mode when none is otherwise provided. */
  DEV_IDENTITY?: string;
  /** Cloudflare Access team domain, e.g. myteam.cloudflareaccess.com. */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access application audience (AUD) tag. */
  ACCESS_AUD?: string;
  /** Comma-separated admin email allowlist. */
  ADMIN_EMAILS?: string;
  /** "1" enables the QA-only test endpoints (/test/*: reset, load, validate). */
  QA_TEST_MODE?: string;
  /** In QA, a login with this email is mapped to the fixtures account so the
   *  seeded scenarios are browsable. Never set in PROD. */
  QA_FIXTURE_EMAIL?: string;
}
