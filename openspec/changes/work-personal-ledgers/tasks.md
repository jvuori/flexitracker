## 1. Registry: machine role

- [x] 1.1 Add `role TEXT NOT NULL DEFAULT 'work' CHECK(role IN ('work','personal'))` to the registry `machine` table schema (`backend/src/registry.ts`)
- [x] 1.2 Thread `role` through `createMachine()` (`registry.ts:451`), defaulting to `'work'`
- [x] 1.3 Add a `setMachineRole(db, accountId, machineId, role)` registry helper, ownership-checked like `renameMachine`
- [x] 1.4 Add `role` to the `Machine` type and to `listMachinesForAccount()`'s returned rows

## 2. Registry: converge headless key issuance onto `createMachine`

- [x] 2.1 Change `POST /machines` (`backend/src/index.ts:251`) to create (or resolve, by label) a `machine` row via `createMachine`/`findMachine` before calling `issueKey`, so every key has a backing Machine — closes the legacy gap where `issueKey()` (`registry.ts:614`) only inserted a `machine_key` row
- [x] 2.2 Accept a `role` field on the `POST /machines` body, defaulting to `'work'`
- [x] 2.3 Write a one-time backfill (or an idempotent on-read repair, matching the existing `findMachine` fallback pattern) that creates `machine` rows for any pre-existing keyless `machine_key` rows, defaulting `role = 'work'`
- [x] 2.4 Verify `listMachinesForAccount`/`renderMachines`'s keyless-row fallback (`render.ts:680-684`) still behaves correctly once every key has a backing row (should become a no-op path, not removed — legacy accounts may still hit it before the backfill runs)

## 3. Registry/DB: corrections gain a ledger

- [x] 3.1 Add `ledger TEXT NOT NULL DEFAULT 'work' CHECK(ledger IN ('work','personal'))` to the `correction` table (`backend/src/tenant-do.ts` schema)
- [x] 3.2 Update `Correction`/`loadCorrections()` (`tenant-do.ts:272`) to read/carry `ledger`
- [x] 3.3 Update `addCorrection()` to accept and store `ledger`
- [x] 3.4 Add a `moveCorrection(kind-pair)` path (or have the API layer issue the two calls atomically) implementing "move to other side" as a paired remove (current ledger) + add (other ledger) over the same span

## 4. Worktime calculation: role-filtered input and personal composition

- [x] 4.1 Add a machine-role lookup (machine_id → role) as an input to `computeWeek`/`getWeek` — implemented as `TenantDO.machineRoles()`/`filterByLedgerRole()` querying the registry directly (not Worker-supplied): the nightly alarm has no caller to hand it a pre-fetched map, and machine_id is globally unique so no account_id is needed, so the DO resolves roles itself for both the live-read and seal paths (see design.md D1, updated)
- [x] 4.2 Filter `RawEvent[]` by role before `pairSpans` (`worktime.ts:126`), once per ledger being computed — no changes to `pairSpans`/`mergeIntervals`/`subtract`/`gaps` themselves
- [x] 4.3 Filter corrections passed into `computeDay` by `ledger`, matching the ledger being computed
- [x] 4.4 Add a personal-mode composition path in `computeDay` (or a sibling function): sensor-active spans (`minActiveSec` filter only) + ledger corrections; no `inHours`/bridging/reviewable classification, no `officeEnvelope`, no `lunchMs`, no `isWorkingDay`/`isHoliday`
- [x] 4.5 Add a `ledger` (or `mode`) parameter to `computeDay`/`computeWeek`/`getWeek`/`weekView` selecting which composition path runs
- [x] 4.6 Unit tests: role-filtered event input, personal-mode composition (no bridging/lunch/norm), simultaneous work+personal machine activity computed independently per ledger

## 5. Tenant storage: seal both ledgers

- [x] 5.1 Add personal-ledger columns to `daily_rollup` (e.g. `personal_worked_ms`, `personal_gross_ms`) (`tenant-do.ts:79-87`)
- [x] 5.2 Update `sealDay()` (`tenant-do.ts:439`) to compute and persist both ledgers' totals in the same pass
- [x] 5.3 Update `getWeek()`'s sealed-day fallback (`tenant-do.ts:286-321`) to serve the requested ledger's rollup columns
- [x] 5.4 Confirm `runMaintenanceNow()`/dev maintenance hook still reports sensibly with the extra columns (now async; rollup/session counts unaffected)

## 6. API surface

- [x] 6.1 Add a `ledger`/`mode` query param to `GET /week` (`index.ts:197`), defaulting to `work`
- [x] 6.2 Add `ledger` to the `POST /corrections` body (`index.ts:214`), and a `POST /corrections/move` (or equivalent) endpoint for the atomic move action
- [x] 6.3 Add `role` to `POST /machines` and a `POST /machines/:machineId/role` endpoint (mirroring the existing rename endpoint at `index.ts:265`)
- [x] 6.4 Thread the role choice through `GET/POST /device/authorize` (`index.ts:462-530`), passed to `createMachine()` on the `separate` decision; carry the existing Machine's role through unchanged on `replace`/reused `pinnedMachineId`

## 7. Web UI: machine creation surfaces

- [x] 7.1 Add a work/personal radio (default work) to `renderDeviceApproval()` (`render.ts:73-96`) and thread it through the `/device/authorize` POST
- [x] 7.2 Add the same radio to the headless "Get a key" form (`render.ts:651-658`), threaded through `POST /machines`
- [x] 7.3 Add a role column + edit control to the Machines list table (`renderMachines()`, `render.ts:668-712`), alongside Rename/Revoke

## 8. Web UI: week view mode toggle and personal-mode chrome

- [x] 8.1 Add the work/personal mode toggle to the week view, defaulting to work, persisted client-side for the session
- [x] 8.2 Wire the toggle to `GET /week?ledger=...`
- [x] 8.3 Suppress norm/balance/lunch figures and the non-working-day visual distinction when personal mode is active
- [x] 8.4 Verify the day-lane timeline rendering (ticks, ruler, segment types) degrades correctly with the reduced personal-mode period-type set (no `auto_bridged`/`review` segments) — legend trimmed accordingly; segment rendering itself is type-driven CSS so an absent type simply never draws

## 9. Web UI: three-action correction UI

- [x] 9.1 Add "Move to other side" alongside Count/Exclude in the per-period action strip (`render.ts:467`, `buildDetail`) — `actionsFor()` now returns multiple actions; a manual_added period's move deletes+re-adds (a plain remove_work would lose to its own add_work under existing precedence rules) while sensor/auto_bridged use the new `/corrections/move`
- [x] 9.2 Scope the manual exact-times control's add/remove calls to the currently-viewed ledger
- [x] 9.3 Scope "Mark whole day as work" to work mode only (hidden/disabled in personal mode)
- [x] 9.4 Hide the holiday marker action in personal mode

## 10. QA fixtures and E2E

- [x] 10.1 Extend `backend/e2e/fixtures.data.mjs` with at least one personal-role machine and one moved-between-ledgers correction scenario — added `MACHINES[2]` ("Personal laptop", role personal) and two new days in "this week" (wd 5, 6) covering personal-machine activity and a `/test/move` scenario
- [x] 10.2 Update the oracle validation in `backend/e2e/fixtures.mjs` to check both ledgers' totals for the new scenarios — added `expectPersonal` per-day assertions and a per-week conditional fetch of the personal ledger
- [x] 10.3 Confirm the QA bootstrap (`/test/bootstrap`) still wipes/reseeds role and ledger data cleanly on every deploy — **found and fixed a real bug while verifying live**: `wipeRegistry()` never deleted the `machine` table, so repeated bootstraps accumulated stale rows once `POST /machines` started creating one per key (Group 2). Harmless before that convergence (browser-only path, rarely exercised by fixtures); would have silently broken "QA is a disposable, fully self-provisioning scenario lab" by leaking rows (and stale roles) across every deploy. Fixed in `registry.ts`; verified clean before/after via a live `wrangler dev` run of the full fixtures suite (`ALL FIXTURES VALID`) plus manual browser inspection of the Machines tab (see design.md Risks).

### Verified live (not just typecheck/unit tests)
Ran the full E2E fixtures suite against a real `wrangler dev` instance (all 4 weeks, including the two new personal-ledger scenarios) — **ALL FIXTURES VALID**. Also exercised `POST /api/dev/maintenance` against the seeded fixtures account to confirm `sealDay()`'s new dual-ledger seal path runs without error (19 rollups, 43 sessions). Then drove the actual browser UI end-to-end: work/personal mode toggle, personal-mode chrome suppression (no norm/balance/lunch, no non-working-day styling, trimmed legend), the "Move to other side" action in both directions (verified the moved time appears in the destination ledger and disappears from the source), the Machines tab's role column/toggle, the headless "Get a key" form's role radio (created a real personal-role machine end-to-end), and the browser `/device/authorize` approval page's role radio.

## 11. Docs

- [x] 11.1 Update `CLAUDE.md` if any new pitfall surfaces during implementation (per this project's "document root causes" convention) — added the `wipeRegistry()` gap to "Known pitfalls"
- [ ] 11.2 Run `/opsx:archive` once implementation and QA e2e are green — **not yet**: this requires the real deploy pipeline (GitHub Actions → live QA e2e), which hasn't run. Next step is to commit, push, let CI run the QA e2e (extended fixtures included), then archive once green.
