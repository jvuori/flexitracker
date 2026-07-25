## Context

Every event already carries `machine_id` (`backend/src/tenant-do.ts:48`), but `pairSpans` (`backend/src/worktime/worktime.ts:126`) unions all machines' active intervals into one flat timeline the moment spans are computed, and `daily_rollup`/`session` seal one collapsed number per day with no machine dimension at all. There is currently no way to register a machine whose activity should be tracked but never touch flextime balance.

This was worked out through an exploration session (see the archived proposal at `openspec/changes/archive/2026-07-12-flexi-worker-cloud/` for the original architecture, and the retention rationale in its `design.md` decision #4). The key realization that shapes this design: a "lane" in this codebase already means one row per **day** (`backend/src/ui/render.ts:343`), not per machine — so this does not need per-machine visual lanes, only a mode-scoped view of the same per-day lane.

## Goals / Non-Goals

**Goals:**
- A machine can be classified `work` or `personal`, decided at creation time (default `work`, changeable before commit) and editable later.
- The week view has one mode toggle (work / personal). Work mode is byte-for-byte the existing engine. Personal mode is a strict subset with no work-only concepts (bridging, office hours, lunch, norm, holidays, working-day distinction).
- A time range can be explicitly included in, excluded from, or moved between the two ledgers, independent of which machine produced the underlying sensor evidence.
- Personal-ledger totals survive the raw-event retention window exactly as work totals already do, without extending raw retention.
- The CLI (`daemon-py`) requires zero changes.

**Non-Goals:**
- Per-machine lanes or a per-machine filter/dropdown in the week view — explicitly rejected during exploration in favor of the two-ledger mode toggle.
- Any change to `EDIT_WINDOW_DAYS` / raw-event retention.
- Fixing that `session` rows are currently written but never read (`backend/src/tenant-do.ts:89`, confirmed via a full-repo grep with zero read sites) — a pre-existing gap, unrelated to this change, called out here so it isn't mistaken for new scope.
- Norm/balance semantics for the personal ledger — it has none, by design.

## Decisions

### D1: Role lives on the registry `machine` row, not the DO's ingest-cache `machine` table — and the DO resolves it itself
There are two tables named `machine` today: the registry (D1) row `{ machine_id, account_id, label, created_at }` is the durable identity that survives key rotation; the per-tenant DO row `{ machine_id, hostname, os, first_seen, last_seen, last_batch_seq }` is a telemetry cache written by `upsertMachine()` on every ingest batch. Role is identity-shaped (set once by a human, not derived from traffic), so it belongs next to `label` in the registry table.
*Alternative considered:* storing role in the DO's `machine` table, since that's where `getWeek`/`computeWeek` actually run. Rejected — it would mean ingest traffic (`upsertMachine`) could theoretically race a human's classification decision, and it conflates "what the machine told us" with "what the user decided."

**How the DO reads it (settled during implementation, revising the plan below):** the original plan was for the Worker to fetch role-by-machine from the registry and pass a machine-id set into the DO call for `/week`, mirroring the `Promise.all`-merge shape `/machines` (`index.ts:238`) already uses for `label`. That breaks down for `sealDay()`, which runs from the DO's own nightly **Alarm** — an Alarm fires with no request behind it, so there is no Worker call to attach a pre-fetched role map to, yet sealing needs the same role split live reads do. Rather than build two different mechanisms (Worker-supplied for reads, something else for sealing), `TenantDO` resolves roles itself via `this.env.REGISTRY` — the same D1 binding the Worker uses, already present on the DO's `env` because `TenantDO` is exported from the same Worker script (`index.ts: export { TenantDO } from "./tenant-do"`), so no new wrangler.toml binding was needed. The lookup queries `machine_id IN (...)` with no `account_id` at all, since `machine_id` is already globally unique (a UUID) — so the DO does not even need to know its own account_id to ask "what role are these machines." `getWeek` and `sealDay` both go through the same `machineRoles()`/`filterByLedgerRole()` helpers, so the live-read and seal-time paths can never disagree about what a machine's role was at query time.

### D2: Both machine-creation surfaces converge on `createMachine()`; the CLI is untouched
`createMachine()` (`registry.ts:451`) already creates a durable `machine` row — used today only by the browser `/device/authorize` "separate" decision. The headless "Get a key" web form (`render.ts:651-658`, `POST /machines` → `issueKey()`, `registry.ts:614`) is a legacy shortcut that inserts only a `machine_key` row, with no backing `machine` row at all — `findMachine`/`listMachinesForAccount` paper over the gap by falling back to bare-key rows. Giving that form a role radio requires it to have a `machine` row to put the role on, so `POST /machines` is changed to call `createMachine()` (or the equivalent registry helper) before issuing the key, closing the legacy gap as a side effect.
The CLI (`daemon-py/src/flexitracker/cli.py`) never creates a machine in either flow — `login` (browser) hands the decision to the browser page; `login --key KEY` only persists a key someone already minted. No CLI argument is added.
*Alternative considered:* a mandatory `--role` CLI flag on `login --key`. Rejected during exploration — by the time that command runs the machine (and its key) already exist, so the flag would have nothing to attach to except by making a second, redundant write.

### D3: Corrections gain a `ledger` column; "move" is not a third correction kind
Today `Correction { kind: 'add_work' | 'remove_work' | 'holiday', start, end }` applies against one implicit ledger. The natural first design considered during exploration — reinterpreting `remove_work` to automatically become personal time via idempotent interval-union math — was rejected: exclude (bogus reading, someone else used the machine) and reassign (move to the other ledger) must stay distinct, user-chosen actions, or a plain "not work" correction would silently start counting as personal time nobody asked to track.
Resolution: `correction` rows gain `ledger: 'work' | 'personal'`. Three UI actions, all relative to whichever ledger (mode) is currently open:
- **Include** = an add-correction on the current ledger only.
- **Exclude** = a remove-correction on the current ledger only; does not touch the other ledger.
- **Move to other side** = a remove-correction on the current ledger + an add-correction on the other ledger, over the same range, written as one atomic user gesture.
Corrections stay time-range-based, not machine-attributed — this sidesteps having to decide "whose" activity a range belongs to when two machines with different roles were active in the same window; interval-union math is idempotent, so a "move" landing on a range that already had natural activity in the destination ledger is a no-op there, not a double-count.
*Alternative considered:* attributing corrections to a specific machine instead of a ledger. Rejected — the exploration surfaced a concrete case (overlapping work-laptop and personal-laptop activity) where "which machine does this correction belong to" has no good answer, whereas "which ledger" always does.

### D4: `pairSpans`/`computeDay` are filtered by role upstream; no changes to interval math
`pairSpans` (`worktime.ts:126`) already discards machine identity the instant it unions per-machine intervals (`mergeIntervals(all)`, `worktime.ts:169`) — by design, so two overlapping work laptops don't double-count. That means "which machines count" can be applied by filtering the `RawEvent[]` list by machine role *before* it reaches `pairSpans`, once per ledger being computed. No change to the interval-math core (`pairSpans`, `mergeIntervals`, `subtract`, `gaps`) is needed.
`computeDay` gains a reduced composition path for the personal ledger: sensor-active spans (still filtered by `minActiveSec` — noise floor, not work semantics) plus ledger-relative corrections only. No `inHours` gating, no `bridged`/`reviewable` classification, no `officeEnvelope`, no `lunchMs`, no `isWorkingDay`/`isHoliday` distinction — every day is computed identically regardless of weekday. This is a strict subset of the existing function, not new rule types.

### D5: `daily_rollup` grows a personal-ledger column set; raw retention is untouched
`EDIT_WINDOW_DAYS = 120` (`tenant-do.ts:20`) is a storage/quota bound, not an arbitrary editability cutoff: free-tier Durable Object SQLite caps (1 GB/object, 5 GB account-wide, shared QA+PROD, 100K row-writes/day — verified in the archived `2026-07-12-flexi-worker-cloud/design.md` decision #4 and its Open Questions) make the high-volume raw `event` table the thing that must stay bounded over "10+ years of daily use." Extending raw retention to preserve machine-role history would reopen exactly the problem tiered retention exists to solve.
Instead, `sealDay()` (`tenant-do.ts:439`) computes both ledgers at seal time and `daily_rollup` gains a parallel set of personal-ledger columns (e.g. `personal_worked_ms`, `personal_gross_ms`) alongside the existing work-ledger ones — a handful of extra integers per day, negligible against quota.
A role change only reshapes days that have not yet sealed: `getWeek` always recomputes live from raw events for any day still within the edit window (the `daysWithRaw` check at `tenant-do.ts:296`), so no extra dirty-marking is needed for role changes themselves — the same pattern `putSettings`'s `markAllDaysDirty()` already establishes for a different class of account-wide reshape. A sealed day keeps whatever split existed at seal time; this is a one-way door, consistent with every other sealed-day limitation already accepted in this project (see `manual-corrections`' "Corrections persist beyond raw retention").

## Risks / Trade-offs

- **[Risk]** A machine is misclassified at creation and generates real work hours before being corrected → **Mitigation**: role is editable at any time from the Machines tab; any day still within the 120-day edit window recomputes live, so the fix reaches every day that can still be corrected at all. Sealed days are frozen, same as every other correction today.
- **[Risk]** The `correction.ledger` migration must backfill existing rows → **Mitigation**: every existing correction implicitly meant "work" (there was no other ledger), so backfilling `ledger = 'work'` is unambiguous and lossless.
- **[Risk]** `POST /machines` changing to create a `machine` row (D2) could interact with the existing keyless-Machine fallback logic in `findMachine`/`listMachinesForAccount` → **Mitigation**: the fallback exists specifically to paper over pre-existing keyless rows; new rows created by this change never need it. No existing row's shape changes.
- **[Trade-off]** Corrections are ledger-scoped but still time-range-based, not machine-attributed, per D3 — this means a "move" pulls a range into the destination ledger's totals even where no machine of that role was ever actually active there (e.g., marking a pure work-laptop-only block as personal creates personal-ledger time backed by the work laptop's sensor evidence). This is intentional: the two ledgers track *how time was spent*, not *which physical device produced the reading*.
- **[Found during implementation]** `wipeRegistry()` (`registry.ts`) never deleted the `machine` table — only `machine_key`. Harmless before this change: `machine` rows were created almost exclusively by the browser `/device/authorize` flow, which the QA fixtures loader never exercises. Once `POST /machines` converges onto `createMachine()` (D2), every `/test/bootstrap` run leaves behind a stale `machine` row (confirmed live: the Machines tab showed 6 rows for 3 machines after two bootstrap cycles). Fixed by adding `machine` and `device_auth` to the wipe — `device_auth` was a similar near-miss (self-expiring, so not a correctness bug, but not part of "wipes ALL data" either). This is exactly the kind of gap that only running the actual QA bootstrap cycle live (not just typecheck/unit tests) would surface — see the verification note in `tasks.md` §10.

## Migration Plan

1. Add `machine.role` to the registry schema (default `'work'` for the backfill of every existing row — matches "work can be default" from the requirements discussion).
2. Add `correction.ledger`, backfilling existing rows to `'work'`.
3. Extend `daily_rollup` with personal-ledger columns; `sealDay()` starts populating them going forward (past sealed days before this change simply have no personal-ledger figures — acceptable, since there was no personal ledger to seal at the time).
4. Ship `createMachine()`/`issueKey()` convergence (D2) and the role radios (both creation surfaces) together, so no window exists where a machine can be created without a role.
5. Ship the mode toggle and three-action correction UI last, once the backend can serve both ledgers.

Rollback: each step is additive (new columns, new UI affordances); no destructive schema change is involved, so any step can be reverted independently by redeploying the prior Worker version — the new columns simply go unread.

## Open Questions

- Should the Machines-tab role toggle require any confirmation step (given it can retroactively change which future days count toward balance), or behave exactly like the existing frictionless Rename control? Leaning toward matching Rename (no confirmation dialog), consistent with this project's onboarding-friction bias, but not yet decided.
