## Why

Today the first authenticated Google identity to hit any `/api/*` route is silently provisioned into a full account (`getOrCreateAccount`, `registry.ts`). That was fine for a single-owner tool, but the repo is going public and the hosted instance must let *strangers* sign in far enough to **ask for access** without gaining any capability until an admin approves them. There is no registration intent, no approval gate, no way to remove a user, and no admin surface for it beyond key revocation. We need an explicit **register → admin-approve → use** lifecycle that stays entirely within the Cloudflare free tier.

## What Changes

- Provisioning becomes a **lifecycle**: an account has a `status ∈ {pending, active, rejected, disabled}`. First login creates a `pending` account (no capability); an email on `ADMIN_EMAILS` is created/kept `active` so the owner bootstraps without an approver.
- **Registration is explicit**: a signed-in `pending` user submits a *Request access* form (optional note). Until `active`, every `/api/*` route except a minimal self-view returns 403, and the UI shows a "waiting for approval" screen instead of the app.
- **Access-key issuance is gated**: `pending`/`rejected`/`disabled` accounts cannot mint machine keys, so a daemon can never be authorized before approval.
- **Admin approval + management**: the admin console gains a **registrations queue** (approve/reject with audit), a **users overview with stats** (status, joined, last-seen, machine count), and **kick-out** (`active → disabled`) which *also revokes the user's machine keys* so their daemon stops ingesting.
- **Notification without cost (Option B)**: on a new request the system best-effort sends a native Cloudflare **Email Routing `send_email`** message to the admin's verified address *if* a mail binding is configured; the authoritative surface is always the in-app queue. Users receive **no** email — they see immediate on-screen confirmation on submit and the full app the moment they are approved. No third-party ESP, no outbound-to-stranger email, no new secret.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `identity-and-access`: accounts carry an approval `status`; first login is `pending` (admins auto-`active`); access-key issuance and all user data routes require `active`.
- `admin-console`: registrations queue (approve/reject), user overview with stats, kick-out that disables the account and revokes its keys, all audited; best-effort native admin-notify email.
- `web-ui`: a *Request access* form and a "pending / rejected / disabled" state screen for non-active accounts.

## Impact

- **Registry** (`backend/src/registry.ts`, `src/schema.ts` DDL): add `status` (+ `requested_at`, `note`, `decided_at`, `decided_by`) to `account`; `getOrCreateAccount` creates `pending` (or `active` for `ADMIN_EMAILS`); add approve/reject/disable helpers; `disable` also revokes the account's `machine_key` rows.
- **Gate** (`backend/src/index.ts` api middleware): after resolving `accountId`, load status; non-`active` → 403 except `GET /api/me`; block `POST /api/machines`. Add `POST /api/register`, `GET /api/me`.
- **Admin** (`index.ts` `/api/admin/*`, `ui/render.ts`): registrations queue + approve/reject/disable endpoints; users overview with stats; render admin actions; audit every mutation via existing `recordAudit`.
- **Mail** (`env.ts`, `wrangler.toml`): optional `send_email` binding + `ADMIN_NOTIFY_ADDRESS`; a thin best-effort notify helper that no-ops when unbound. Requires a Cloudflare Email Routing domain + one verified destination (one-time bootstrap, like the Access app); absent that, the queue is the notification.
- **UI** (`ui/render.ts`): pending/rejected/disabled screens; *Request access* form; admin registrations + users views.
- **Tests** (`backend/test`): pending blocks data + key issuance; admin bootstrap via `ADMIN_EMAILS`; approve flips to active; reject/disable behavior; disable revokes keys; notify no-ops cleanly when unbound.
- No daemon or Durable-Object-tenant change (status lives in the global registry `account` row).
