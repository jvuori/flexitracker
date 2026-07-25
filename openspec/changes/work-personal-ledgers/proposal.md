## Why

Every machine's activity is currently unioned into one undifferentiated timeline before it ever reaches the week view — `pairSpans` merges all machines' spans together, and `daily_rollup` seals one collapsed number per day. There is no way to register a personal machine (a private laptop, a music-production desktop) whose time is worth tracking for personal awareness but must never touch flextime balance, nor to treat a mixed fleet (two work laptops + a personal machine) as anything other than one flat "active or not" signal. The user wants the same daemon/backend to serve both purposes at once, cleanly separated.

## What Changes

- Every machine gets a durable **role** (`work` or `personal`), set at creation time (default `work`, changeable before the user commits) and editable later from the Machines tab.
- The week view gains a single **mode toggle** (work / personal) instead of any per-machine selector. Work mode is the existing engine, completely unchanged (bridging, office-hours gating, lunch deduction, working-day/holiday, norm, balance). Personal mode is a strict subset — sensor-active time plus the noise-floor threshold only, no bridging, no office-hours concept, no lunch, no norm/balance, weekends not visually distinguished.
- Manual corrections gain a **ledger** dimension (`work` | `personal`) and a third action:
  - **Include** — add to the ledger currently being viewed only.
  - **Exclude** — remove from the ledger currently being viewed only; counts nowhere (a bogus reading, someone else used the machine).
  - **Move to other side** — remove from the current ledger and add to the other, as one gesture, over the same range. Not a new correction primitive — it composes the existing add/remove pair, now ledger-scoped.
- **BREAKING (data model):** the `correction` table gains a required `ledger` column; existing rows are implicitly `work` (a migration backfills this).
- `daily_rollup` gains a parallel set of personal-ledger columns, sealed at the same time as the existing work-ledger columns, so personal totals survive past the raw-event retention window exactly as work totals already do. The raw-event retention window itself (`EDIT_WINDOW_DAYS`) is unchanged — it is a storage/quota bound, not something this change has reason to touch.
- The two machine-creation surfaces (browser `login` approval page, and the headless "Get a key" web form) both gain a work/personal radio (default work). The headless form currently only mints a bare `machine_key` with no backing `machine` row — it is unified onto the same `createMachine()` path the browser flow already uses, so it has an entity to attach a role to. The CLI (`flexitracker login`, `login --key`) requires **no changes**: it never creates a machine in either flow, so it never needs to know about role.

## Capabilities

### New Capabilities
- `machine-classification`: a machine's durable work/personal role — where it defaults, where it's set (both creation surfaces), and where it's edited later (Machines tab). Independently specifiable from how the role is *used* downstream.

### Modified Capabilities
- `identity-and-access`: the headless key-issuance path (`issueKey`) converges onto the same durable Machine-entity creation (`createMachine`) the browser flow already uses, so every machine — however it's created — has one `machine` row to hang identity-shaped data on.
- `manual-corrections`: corrections gain a ledger dimension and the three-action (include/exclude/move) model, replacing the implicit single-ledger add/remove.
- `worktime-calculation`: day/week computation runs against a role-filtered event set and gains a personal-mode composition path (a stricter subset of the existing rules, no new rule types).
- `tenant-storage`: `daily_rollup` schema extends with personal-ledger columns, sealed by the same nightly alarm pass.
- `web-ui`: the week view gains the work/personal mode toggle; the day-timeline action UI gains the third (move) action; the daemon-login approval page and the headless "Get a key" form both gain the role radio; the Machines tab gains a role edit affordance.

## Impact

- **Backend:** `backend/src/worktime/worktime.ts` (event filtering by role, personal-mode `computeDay` subset), `backend/src/tenant-do.ts` (`correction` schema + ledger column, `daily_rollup` schema + personal columns, `sealDay()`, `getWeek`/`weekView` mode parameter), `backend/src/registry.ts` (`machine.role` column, `createMachine`/`issueKey` convergence), `backend/src/index.ts` (`/device/authorize`, `/machines`, `/week`, `/corrections` route changes).
- **Web UI:** `backend/src/ui/render.ts` (mode toggle, three-action buttons, role radios on both machine-creation surfaces, Machines-tab role toggle).
- **Data migration:** existing `correction` rows backfilled with `ledger = 'work'`; existing `machine_key`-only rows (no backing `machine` row) backfilled with a `machine` row defaulting to `role = 'work'`.
- **No daemon (Python) changes** and no wire-protocol changes — `machine_id` is already on every event.
- **No change to raw-event retention** (`EDIT_WINDOW_DAYS`) or to the QA fixtures' zero-cost guarantees; `daily_rollup`'s extra columns are negligible against existing free-tier storage quotas.
