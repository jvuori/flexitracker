## Context

The global registry (`backend/src/registry.ts`, D1) maps `google_sub → account_id` and `access_key → (account_id, machine_id)`. `getOrCreateAccount(sub, email)` is called from the `/api/*` middleware (`index.ts`) via `accountFor` and today creates a fully-capable account row on first sight. Admins are identified by `isAdmin(identity, env)` against `ADMIN_EMAILS` (already in `wrangler.toml`). Cloudflare Access is the outer gate; to allow self-service registration its human policy must admit any Google account, so the **app status flag becomes the real capability gate**.

## Goals / Non-Goals

**Goals:**
- Explicit register → approve → use lifecycle; nothing capable before `active`.
- Admins bootstrap themselves (no first-approver paradox) via `ADMIN_EMAILS`.
- Admin can approve/reject, see user stats, and kick a user out (disable + revoke keys).
- New-request notification with **zero external dependency and zero new secret**; degrade to the in-app queue when no mail binding exists.

**Non-Goals:**
- No email to end users (Option B): no third-party ESP, no outbound-to-stranger mail. (Leave a seam to add it later.)
- No email *verification* flow — Google already proved the address at login.
- No self-serve re-application UI for rejected users (admin can re-enable manually); no org/multi-tenant roles beyond owner-admin.
- No change to how worktime is computed or how the daemon behaves.

## Decisions

- **`status` on the `account` row, not a new table.** `status ∈ {pending, active, rejected, disabled}`, plus `requested_at`, `note`, `decided_at`, `decided_by`. `getOrCreateAccount` inserts `pending` — **except** when `email ∈ ADMIN_EMAILS`, where it inserts/repairs `active`. This makes the owner capable on first login with no approver, and is the documented bootstrap.
- **The gate lives in the `/api/*` middleware, once.** After `accountFor` resolves `accountId`, load the account; if `status !== 'active'`, return 403 for everything except `GET /api/me` (which returns `{email, status, note}` so the UI can render the right screen). This is a single choke point; individual handlers stay unaware. `POST /api/register` is also allowed while `pending` (it sets `requested_at`/`note`, idempotent).
- **Key issuance is gated at the source.** `POST /api/machines` is behind the same middleware, so a non-active account is already 403; additionally `issueKey`’s callers assert `active` so the rule is enforced even if a future route bypasses the middleware. No key ⇒ `/ingest` and `/config` naturally reject (no resolvable key).
- **Disable is destructive to keys.** `active → disabled` (kick-out) revokes every `machine_key` for that account in the same transaction, so the user's daemon stops being accepted at `/ingest` immediately — not just the human UI. Reject (`pending → rejected`) has no keys to revoke. Both are audited with the admin identity.
- **Notification is best-effort and unbound-safe.** Add an optional `send_email` binding + `ADMIN_NOTIFY_ADDRESS`. On a new request, a `notifyAdmin()` helper sends a plain-text "new access request from <email>" to the verified admin address; if the binding is absent (local/dev, or before Email Routing is set up) it **no-ops without error**. The registrations queue is always the source of truth, so mail is a convenience, never a dependency — consistent with fail-fast (no silent reliance on an external service) and rule #1 (Email Routing is free; needs a Cloudflare domain + one verified destination, a one-time bootstrap like the Access app).
- **Access seat tradeoff is accepted and documented.** With Access admitting any Google account, pending/rejected users consume Access seats (≤50, shared QA+PROD). For a low-traffic personal tool this is acceptable; the escape hatch is reverting the Access human policy to an allowlist. Recorded here so it is a conscious choice, not a surprise.

## Risks / Trade-offs

- **Any-Google Access policy widens the outer door.** Mitigated by the status gate (nothing capable before approval) and the allowlist escape hatch. The 50-seat account-wide cap is the real ceiling; flagged, not solved, on the free tier.
- **Middleware gate must be exhaustive.** If any user-data route is mounted outside the gated `api` group it would leak to pending users; the key-issuance secondary assert and a test that pending gets 403 on representative routes guard this.
- **Disable/revoke atomicity.** Disabling a user must revoke keys in the same operation or a daemon keeps ingesting after kick-out; covered by a test asserting keys stop resolving post-disable.
- **Admin-notify domain prerequisite.** Native `send_email` needs an Email Routing domain + verified destination. Until that exists the admin relies on the queue; the helper's no-op-when-unbound keeps this from being a failure. If a custom domain is never added, notification stays in-app only (acceptable).
- **Rejected users linger as rows/seats.** Rejected accounts remain (for audit) and still occupy an Access seat until Access policy prunes them; acceptable at this scale, revisit if seats get tight.
