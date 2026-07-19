// Best-effort admin notification (Option B: native Cloudflare Email Routing, no
// third-party ESP, and NO email to end users). If no send_email binding + admin
// address is configured, this no-ops silently — the in-app registrations queue
// is the authoritative surface, so mail is a convenience, never a dependency.
// A mail failure MUST NOT fail the user's request.
//
// Prerequisite (one-time bootstrap, like the Access app): a Cloudflare Email
// Routing domain plus one verified destination address, and a `send_email`
// binding in wrangler.toml. Until that exists, notifications live only in the UI.

import type { Env } from "./env";

export async function notifyAdmin(
  env: Env,
  requesterEmail: string,
  note: string | null,
): Promise<void> {
  try {
    if (!env.SEND_EMAIL || !env.ADMIN_NOTIFY_ADDRESS) return; // not configured → queue only
    const to = env.ADMIN_NOTIFY_ADDRESS;
    const from = env.ADMIN_NOTIFY_FROM ?? to;
    // Import the runtime-provided virtual module dynamically via a non-literal
    // specifier so the type-checker does not try to resolve it (it only exists
    // in the Workers runtime when a send_email binding is present).
    const spec = "cloudflare:email";
    const { EmailMessage } = (await import(spec)) as {
      EmailMessage: new (from: string, to: string, raw: string) => unknown;
    };
    const body =
      `A new person requested access to FlexiTracker: ${requesterEmail}.` +
      (note ? `\r\n\r\nTheir note: ${note}` : "") +
      `\r\n\r\nReview it in the admin console.`;
    const raw =
      `From: FlexiTracker <${from}>\r\n` +
      `To: <${to}>\r\n` +
      `Subject: FlexiTracker: new access request from ${requesterEmail}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n` +
      `MIME-Version: 1.0\r\n\r\n` +
      body;
    await env.SEND_EMAIL.send(new EmailMessage(from, to, raw));
  } catch {
    // best-effort: never surface a mail error to the requester
  }
}
