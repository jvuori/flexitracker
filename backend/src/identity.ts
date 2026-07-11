// Human identity via Cloudflare Access. In production the Access edge injects a
// signed JWT (Cf-Access-Jwt-Assertion) that we verify against the team's JWKS.
// In local mode a stub header stands in (local-simulation spec).

import type { Env } from "./env";

export interface Identity {
  sub: string;
  email: string;
}

const ACCESS_HEADER = "cf-access-jwt-assertion";

export class UnauthorizedError extends Error {}

/** Extract and verify the caller's identity, or throw UnauthorizedError. */
export async function requireIdentity(request: Request, env: Env): Promise<Identity> {
  if (env.DEV_MODE === "1") {
    // Local stub for Cloudflare Access. Resolution order lets both browser
    // navigation and API fetches work without the edge auth layer.
    const url = new URL(request.url);
    const cookie = /(?:^|;\s*)dev_identity=([^;]+)/.exec(request.headers.get("cookie") ?? "");
    const email =
      request.headers.get("x-dev-identity") ??
      url.searchParams.get("dev") ??
      (cookie ? decodeURIComponent(cookie[1]!) : null) ??
      env.DEV_IDENTITY ??
      null;
    if (!email) throw new UnauthorizedError("no dev identity (set DEV_IDENTITY or ?dev=)");
    return { sub: `dev:${email}`, email };
  }

  const token = request.headers.get(ACCESS_HEADER);
  if (!token) throw new UnauthorizedError("missing Access assertion");
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new Error("ACCESS_TEAM_DOMAIN and ACCESS_AUD must be configured");
  }
  const claims = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  const email = typeof claims.email === "string" ? claims.email : null;
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!email || !sub) throw new UnauthorizedError("Access token missing sub/email");
  return { sub, email };
}

export function isAdmin(identity: Identity, env: Env): boolean {
  const allow = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(identity.email.toLowerCase());
}

// ---- JWT (RS256) verification against Access JWKS -----------------------

interface Jwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
  alg?: string;
}
let jwksCache: { domain: string; keys: Map<string, CryptoKey>; at: number } | null = null;
const JWKS_TTL = 3600_000;

async function getKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  if (jwksCache && jwksCache.domain === teamDomain && Date.now() - jwksCache.at < JWKS_TTL) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`failed to fetch Access JWKS: ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys) {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keys.set(jwk.kid, key);
  }
  jwksCache = { domain: teamDomain, keys, at: Date.now() };
  return keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new UnauthorizedError("malformed JWT");
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64))) as {
    kid?: string;
    alg?: string;
  };
  if (header.alg !== "RS256" || !header.kid) throw new UnauthorizedError("unexpected JWT alg/kid");

  const key = (await getKeys(teamDomain)).get(header.kid);
  if (!key) throw new UnauthorizedError("unknown signing key");

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) throw new UnauthorizedError("bad JWT signature");

  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as Record<
    string,
    unknown
  >;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) throw new UnauthorizedError("expired");
  const audOk = Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud;
  if (!audOk) throw new UnauthorizedError("wrong audience");
  return claims;
}
