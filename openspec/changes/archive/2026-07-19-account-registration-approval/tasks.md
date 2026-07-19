## 1. Registry: account status lifecycle

- [x] 1.1 Add `status` (`pending|active|rejected|disabled`, default `pending`), `requested_at`, `note`, `decided_at`, `decided_by` to the `account` DDL in `backend/src/registry.ts` (and `schema.ts` if mirrored). Version the change so existing rows backfill to `active` (pre-existing owner data must not lock itself out). — done via `migrateAccountStatus` (ADD COLUMN + grandfather existing rows to `active`).
- [x] 1.2 `getOrCreateAccount`: create `pending`, EXCEPT `email ∈ ADMIN_EMAILS` → create/repair `active`. Keep addressing by `account_id`/`sub` unchanged.
- [x] 1.3 Add `setRequested(accountId, note)`, `approve(accountId, adminEmail)`, `reject(accountId, adminEmail)`, `disable(accountId, adminEmail)` helpers. `disable` MUST also revoke all `machine_key` rows for the account atomically. — `disable` uses `db.batch([...])` for atomicity.
- [x] 1.4 Add a status read used by the gate (`getAccount`) and assert `active` inside `issueKey`'s caller path (`POST /api/machines`) as a secondary guard.

## 2. Backend gate + registration endpoints

- [x] 2.1 In the `/api/*` middleware (`index.ts`), after resolving `accountId`, load status; if `!== 'active'` return 403 for all routes except `GET /api/me` (and `POST /api/register` while pending).
- [x] 2.2 Add `GET /api/me` → `{ email, accountId, admin, status, requested, note }` (allowed in any status).
- [x] 2.3 Add `POST /api/register` (allowed while `pending`) → sets `requested_at`/`note`, idempotent; triggers `notifyAdmin()`.
- [x] 2.4 Confirm `POST /api/machines` is unreachable for non-active accounts (covered by 2.1 + the 1.4 secondary assert).

## 3. Admin console

- [x] 3.1 `GET /api/admin/registrations` → pending accounts that explicitly requested (email, requested_at, note).
- [x] 3.2 `POST /api/admin/registrations/:id/approve` and `.../reject` → status transition + `recordAudit`.
- [x] 3.3 `GET /api/admin/users` → email, status, joined, machine count (via `listAccountsWithStats`). Note: last-seen omitted from the aggregate to avoid an N-way Durable-Object fan-out on the admin list; per-account last-seen remains available in the Machines view.
- [x] 3.4 `POST /api/admin/users/:id/disable` → `disable` (revokes keys) + audit, plus `.../enable` (re-approve).
- [x] 3.5 Render in `ui/render.ts`: registrations queue (approve/reject), users table with status/stats, kick-out + enable. Admin-only via existing `isAdmin`; self-row cannot be disabled.

## 4. Notification (Option B, best-effort)

- [x] 4.1 Add optional `SEND_EMAIL` binding + `ADMIN_NOTIFY_ADDRESS`/`ADMIN_NOTIFY_FROM` to `env.ts`, with a documented commented binding in `wrangler.toml` (QA + PROD). Kept commented because the live `send_email` binding requires the Email-Routing domain bootstrap first — enabling it before that would break `wrangler deploy`.
- [x] 4.2 `notifyAdmin(env, requesterEmail, note)` helper (`src/mail.ts`): send plain-text via `send_email` if bound; no-op without error when unbound. Never blocks or fails the request on mail error.
- [x] 4.3 Documented the one-time Email Routing bootstrap (domain + verified destination) in `wrangler.toml`/`mail.ts`; absent it, the in-app queue is the notification.

## 5. Web UI: registration & state screens

- [x] 5.1 On load (`init`), branch on the server-embedded status; `pending` (never requested) shows a *Request access* form (optional note) posting to `/api/register`; on submit shows the "Waiting for approval" confirmation.
- [x] 5.2 `pending` (already requested) shows "waiting for approval"; `rejected`/`disabled` show the corresponding message; only `active` renders the full app tabs (nav hidden otherwise).

## 6. Tests (live e2e — the repo has no D1 unit harness; the faithful place is `e2e/smoke.mjs` against the real Worker + D1, plus QA-only `/test/approve` + `/test/disable` so the suite can drive the lifecycle without a human admin)

- [x] 6.1 First non-admin login → `pending`; `ADMIN_EMAILS` (non-fixture) login → `active` (bootstrap). Both asserted in smoke.
- [x] 6.2 Pending account gets 403 on `POST /api/machines`, 200 on `GET /api/me`; register recorded. Asserted in smoke.
- [x] 6.3 Approve flips `pending → active`; the account then mints a key and ingests. Asserted in smoke (and via the admin UI in the Playwright drive).
- [x] 6.4 Disable revokes keys: a previously working access key stops resolving at `/ingest` after disable. Asserted in smoke.
- [x] 6.5 `notifyAdmin` no-ops cleanly when the mail binding is absent — it is unbound in local/QA/PROD today and every smoke/fixtures run exercises the register path without error.
- [x] 6.6 Pre-existing accounts backfill to `active` on migration — `migrateAccountStatus` grandfathers existing rows (fresh local run also re-verified from empty).

## 7. Verify end-to-end

- [x] 7.1 Backend unit tests green (60 passed); typecheck clean.
- [x] 7.2 Drove locally with the identity stub (Playwright): new user → *Request access* → "Waiting for approval"; admin → Admin tab shows the queue; approved a user → flips to `active`; disable revokes keys (smoke). Full `e2e/smoke.mjs` passes against local `wrangler dev`.
