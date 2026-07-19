## Context

Three mechanisms already exist and partly work:

| Mechanism | Where | State |
| --- | --- | --- |
| Back-dated hysteresis state machine | `state_machine.rs:103` | Works |
| Heartbeats every 5 min while active | `state_machine.rs:119-122` | Emitted, **ignored by the backend** |
| Startup reconciliation of downtime | `state_machine.rs:89`, called `main.rs:211` | Works, but **only at process start**, and anchored to the coarser of two timestamps |
| Durable outbox with `batch_seq` | `outbox.rs` | Works; not crash-safe, unbounded, single-batch |

The damage comes from the gaps. `pairSpans` closes an orphan span at `checkTime`, and callers pass `Date.now()` — so the phantom grows without limit until something closes it. `computeDay` clamps that span into every day it crosses, so the cost is not one day but every day since the machine vanished.

Worked example with today's code. Laptop active from 09:00 Friday, shut down abruptly at 16:02, last heartbeat 16:00, no `idle` ever emitted. Opening the week view at 18:00 Sunday:

| Day | Counted | Reality |
| --- | --- | --- |
| Fri | 09:00–24:00 (15h) | 7h |
| Sat | 00:00–24:00 (24h) | 0 |
| Sun | 00:00–18:00 (18h) | 0 |

## What a heartbeat actually means to the backend

This has to be settled first, because an earlier draft of this design leaned on heartbeats as the primary fix and that was wrong.

A heartbeat is **not** a real-time liveness signal. Events are buffered in the outbox and flushed opportunistically, so a heartbeat carrying `ts = T` may arrive hours later. Its `ts` and its `received_at` are independent, and only `received_at` says anything about *now*. Precisely, a heartbeat asserts:

> Machine M was running, and in the confirmed-active state, at time T.

That is a **retrospective assertion about the past**, and it carries three limits:

1. **Absence proves nothing.** No heartbeat for an hour is equally consistent with "the machine is off" and "the machine is working fine but the network is down and everything is sitting in the outbox." The backend cannot distinguish these, ever.
2. **Its resolution is one interval.** The true end of a span lies somewhere between the last heartbeat and one interval after it. The daemon's back-dated `idle`, by contrast, is exact — it names the last real input.
3. **It is redundant whenever the daemon comes back.** A returning daemon reconciles the gap itself and sends an exact `idle`; the heartbeats it also sends add nothing to the historical record that the `idle` did not already settle.

So heartbeats earn their keep in exactly two places: **current-status display** (combined with `received_at`, which is what `getStatus` already does at `tenant-do.ts:318`), and **the machine that never comes back** — dead hardware, wiped OS, a laptop retired from the account. That machine will never send a closing event, so its final span has no other bound.

That is a much narrower role than "bound every open span," and the design below reflects it.

## Cost: do heartbeats threaten the free tier?

Rule #1 makes this a first-class question rather than an afterthought, so it is answered with the actual write path rather than an estimate.

**Writes per heartbeat.** One heartbeat is flushed as its own batch, and `ingest` (`tenant-do.ts:129-160`) performs four row writes for it:

| Write | Purpose |
| --- | --- |
| `upsertMachine` | last-seen `batch_seq` |
| `INSERT INTO event` | the heartbeat itself |
| `markDirty` | `INSERT OR IGNORE`, usually a no-op after the day's first |
| `INSERT INTO batch_seen` | idempotency key |

**Daily total.** A heartbeat every 5 minutes across an 8-hour day is 96 heartbeats per machine, so ≈ 384 row writes per machine per day, ≈ 770 for two machines. Transitions and the nightly seal add tens more. Call it **~1,000 row writes/day**.

Against a Durable Objects SQLite free-tier allowance on the order of **100,000 rows written/day**, that is roughly **1%**. Storage is equally unthreatening: 120 days of retained heartbeats for two machines is ~23,000 rows, low single-digit megabytes against a 5 GB allowance.

The ratio is what matters, and it is robust — the conclusion survives the allowance being several times smaller than stated. The exact current figures still get verified as a task, per the standing instruction to confirm free-tier quotas rather than trust a remembered number.

**Ephemeral memory does not help, and is actively wrong here.** A Durable Object's in-memory state is free but is lost when the object is evicted, and eviction follows inactivity — so the in-memory liveness marker would be discarded at precisely the moment the machine goes quiet, which is the only moment it is needed. Workers KV is worse on its own terms: its free-tier write allowance is around a thousand per day, an order of magnitude *below* what DO SQLite already grants. The Cache API is neither durable nor authoritative. DO SQLite is already the cheapest durable option available on the free plan.

**What would change the answer, and why the fix is removal rather than a floor.** Write volume scales linearly with heartbeat frequency, and `heartbeatSec` is currently a per-account setting served from stored settings via `/config` (`index.ts:115-119`). At the 5-minute default there is 100× headroom; at 30 seconds, 10×; at 1 second the account would generate ~350,000 row writes/day and **breach the free tier**. Nothing stops that today — it is not among the validated fields.

Validating it with a minimum would work, but it is the weaker answer. The interval is not a preference anyone holds: no user wants to tune how often a background process phones home, and exposing it as a setting is what created the hole in the first place. So it stops being account state and becomes a **backend constant**, still served over `/config` so the daemon has one source of truth and the two sides cannot drift. A value that cannot be set cannot be misconfigured — which is what "structural" should mean.

**`minInactivitySec` gets the same treatment; `minActivitySec` stays configurable.** All three currently sit together in per-account settings (`index.ts:115-119`), all three unvalidated, none exposed in the UI. Splitting them this way is not arbitrary — the two decisions are load-bearing on each other:

- `minInactivitySec` is the second cost lever. A short value means the daemon confirms idle sooner and therefore transitions more often, and every transition is an ingested event. It is also the **downtime threshold** this design leans on (decisions 5 and 6): the boundary between "absorbed" and "reconciled as downtime". Both of those are protocol behaviour rather than taste, and a user-tunable suspend threshold would make reconciliation behave differently per account for no benefit. It becomes a constant.
- Fixing it is precisely what makes `minActivitySec` **safe** to leave configurable. With idle confirmation pinned at 10 minutes, a machine cannot go idle more often than once per 10 minutes, which caps transition frequency — and therefore write volume — regardless of how eagerly activity is confirmed. `minActivitySec` cannot blow the budget once `minInactivitySec` cannot.

`minActivitySec` is also the one of the three that is a genuine preference: it decides how much sustained input counts as *returning to work*, which separates someone brushing the mouse in passing from someone actually sitting down. It stays settable, and — unlike today — gets validated at the settings boundary alongside the rest.

*Note on the UI spec.* The `web-ui` "Settings screen" requirement lists "the daemon thresholds" among the editable settings. After this change that phrase denotes exactly one field. The implementation never showed any of them, so this is a pre-existing spec-versus-code divergence rather than a regression, but the wording should be corrected — sequenced after `settings-form-controls` is archived, since that change is already modifying the same requirement and two competing deltas would clash.

*Alternative considered — collapse consecutive heartbeats by updating the previous row in place*, keeping one heartbeat row per open span. It would flatten storage growth, but an `UPDATE` costs the same one row write as an `INSERT`, so it does not reduce the quantity actually under pressure. Rejected as complexity that buys nothing against the binding constraint.

*Alternative considered — flush several heartbeats per batch* (every 30 minutes rather than every 5), amortising the three fixed per-batch writes and cutting the daily total roughly 2.6×. A genuine reduction, but it delays the backend's view of a live machine and degrades "active now", for headroom that is not needed at 1% utilisation. Worth revisiting only if the ratio changes.

## Goals / Non-Goals

**Goals:**
- No downtime — shutdown, crash, sleep, hibernate, power loss — is counted as work.
- The daemon, which has ground truth, is the authority on when a span ended.
- A network outage never causes the backend to under-report genuine work once the buffered events arrive.
- Clock changes are distinguishable from suspends, and a backwards clock never inverts a span.

**Non-Goals:**
- Not treating the backend as capable of deciding whether a quiet machine is dead or merely offline — it cannot, and the design must not pretend otherwise.
- Not attempting exact accounting on Windows Modern Standby, where the process may run intermittently.
- Not reworking hysteresis or back-dating semantics.
- No new wire event kind; `heartbeat` already exists in all three schema copies.

## Practical situations

`H` = heartbeat interval (default 5 min), `I` = `min_inactivity` (default 10 min).

| # | Situation | Today | After | Resolved by |
| --- | --- | --- | --- | --- |
| 1 | Clean shutdown from the Start menu | Span runs to now | Exact `idle` from handler, else exact on next start | Daemon |
| 2 | Power cut, battery death, hard reset | Span runs to now | Exact `idle` on next start, back-dated to last input | Daemon |
| 3 | **Lid closed Fri 16:00, opened Mon 08:00** | Whole weekend counted | Closed at Friday's last input | Daemon |
| 4 | Sleep, user types immediately on wake | Suspend fully counted — reported bug | Gap detected in-process, closed back-dated | Daemon |
| 5 | Short sleep (< `I`) during the workday | Counted | Absorbed deliberately — matches "short break absorbed" | Daemon |
| 6 | Lock screen, machine sleeps later | `idle` on lock (correct) | Unchanged | Daemon |
| 7 | Daemon killed, restarted later | `recover()` closes it | Unchanged, anchored more precisely | Daemon |
| 8 | **Network down for hours while working** | Correct once flushed | Correct once flushed; **must not be truncated meanwhile** | Outbox + recompute |
| 9 | Late `idle` arrives for an already-sealed day | Fixes only that day | Every day the span covered is re-marked dirty | Backend |
| 10 | NTP or manual clock change | Indistinguishable from suspend | Distinguished; backwards never inverts | Daemon |
| 11 | Desktop working + laptop suspended mid-span | Laptop's phantom inflates the union | Laptop closes its own span on resume | Daemon |
| 12 | Machine idle overnight, never shut down | `idle` after `I` (correct) | Unchanged | Daemon |
| 13 | **Machine never returns** (dead, wiped, retired) | Span runs forever | Bounded at last heartbeat | Backend (only case) |

Every row but 8, 9 and 13 is resolved by the daemon. That is the shape of the fix.

## Decisions

### 1. The daemon is the authority on when a span ended

The daemon has what the backend structurally lacks: it knows whether it was suspended, when it resumed, whether it was shut down, and when the last real input occurred. It resolves every returning case exactly, and its `idle` is back-dated to the true transition rather than bounded to an interval.

The backend cannot match this. Given a quiet machine it faces an irreducible ambiguity — dead, or alive behind a broken network — and any rule it applies is wrong in one of those cases. So the backend does not attempt to adjudicate. **Explicit daemon events always win**; anything the backend infers is provisional and is superseded the moment better information arrives.

This inverts the earlier draft, which made the backend's heartbeat bound the primary mechanism. That was wrong for the reason above: it would truncate genuine work during a network outage, which is the one failure mode a person actually notices, and it would do so on evidence that cannot distinguish the case it is trying to detect.

### 2. The backend bound is a provisional floor for the machine that never returns

The backend still needs *some* answer for an open span, because the current answer — count to the moment of observation — is indefensible. But it is scoped to what heartbeats can actually support:

```
end = min(checkTime, lastAlive + GRACE)     GRACE = k × heartbeatSec,  k = 3
```

with three properties that keep it honest:

- **Provisional, never destructive.** It is computed at read time from stored events, not written back as a correction. When the daemon returns and its buffered events arrive, recomputation extends or replaces the bound — nothing has to be undone.
- **Invisible when nothing is wrong.** A live machine's `lastAlive` is at most one interval old, so its bound sits in the future and `checkTime` governs.
- **It under-counts rather than fabricating.** During an outage the affected day may read low until the outbox drains. That is the right direction to be wrong in: a temporarily low number that self-corrects beats a permanently inflated one, and it does not silently bank hours the user never worked.

`k = 3` covers heartbeat jitter and a dropped batch. It deliberately does *not* try to cover a real outage — no finite grace can, since outages are unbounded — and that case is handled by recompute-on-arrival (decision 3) rather than by widening `k`.

*Alternative considered — suppress the bound while a machine looks reachable*, e.g. if `received_at` is recent. Rejected: recent contact from a machine already implies its events are current, so the bound is already inert there; adding the condition buys nothing and introduces a second liveness notion to keep consistent.

*Alternative considered — do not count an unclosed span at all.* Attractively honest, but it discards work that genuinely happened right up to the last heartbeat, and it makes an outage look like a zero day rather than a slightly short one.

### 3. An unclosed span is shown as provisional, not as settled fact

A span with no closing event is **the last known situation, not a confirmed measurement**. Heartbeats say the user was active *at least* until the last one; they say nothing about what happened after. Rendering that identically to a span whose end was actually observed asserts a certainty the data does not carry — and it is the same class of error as the original bug, just quieter: the first version over-counted silently, and presenting an inferred end as measured would over-*claim* silently.

**The uncertainty is a property of the whole period, not just its tail.** It is tempting to treat the segment up to the last heartbeat as settled and only mark the grace tail — but the period has no confirmed end at all until a real closing event arrives, and its extent will move as evidence lands. So the period as a whole takes a distinct presentation, and its right edge is additionally drawn as indefinite rather than as a hard measured boundary. The user reads "active at least until 16:00, then unknown", not "worked until 16:15."

It re-adapts as knowledge improves, with no special handling: heartbeats buffered through an outage arrive with their true timestamps, `lastAlive` advances, and the provisional end moves with it. When the machine is currently alive the end simply tracks `checkTime`, since the bound sits in the future. When the daemon's `idle` finally lands, the period stops being provisional and becomes an ordinary measured span. Because the bound is derived at read time (decision 2), each of these is just a recompute.

**Edit actions are suppressed while the period is still growing.** Offering "Exclude as private" on a period whose right edge is advancing means acting on a moving target: the correction is anchored to boundaries that will not be the boundaries a minute later. A period is still growing when its machine has been seen within the liveness window — the same notion `getStatus` already uses — so the result exposes that alongside the provisional flag and the UI omits the action strip for those periods.

Once the machine stops being seen, the period stops moving and **edit actions return**, even though it remains provisional. This matters for the case the bound exists to serve: a machine that never comes back leaves a permanently provisional period, and suppressing edits on `provisional` alone would make that period uncorrectable forever — trading an over-count for an un-fixable one. The rule is therefore "not editable while it is moving", not "not editable while it is uncertain."

The **remainder** of the day past the bound needs nothing new: the existing partition fills it as a `gap`, and current rules already give the right answer — a Friday-16:00 tail is out of hours so it is not bridged; a three-hour mid-day disappearance exceeds the private-leave threshold so it is not bridged; a brief quiet inside office hours is bridged exactly as a brief sensor gap would be. It is already selectable and correctable through "Count as work."

*Alternative considered — end the span exactly at the last heartbeat and drop the grace*, which needs no provisional marking because nothing is speculated. Rejected: a machine that is working right now has a last heartbeat up to one interval old, so this would truncate up to `H` of genuinely current work on every live session. The grace exists for the live case; the provisional marking is what keeps it honest in the dead case.

### 4. Late arrivals must repair every day the span covered

This becomes load-bearing once the backend's bound is provisional: the repair path *is* the correctness story for outages, not a nicety.

`ingest` marks `localDayStart(e.ts)` dirty per event (`tenant-do.ts:152`). An `idle` arriving late for Friday 16:00 therefore re-seals Friday and leaves the phantom Saturday and Sunday rollups untouched — the fix would be invisible where the damage was worst. Dirty-marking widens to the range affected: when an arriving event changes a machine's open-span extent, mark every day from the span's start day through the previously-assumed end.

### 5. The daemon detects suspend by monotonic-versus-wall divergence

Sleep does not restart the process, so `recover()` never runs. Each tick records both clocks; between consecutive ticks:

```
suspended ≈ Δwall − Δmono
```

`Instant` (CLOCK_MONOTONIC on Linux, QPC on Windows) does not advance across suspend while the wall clock does, so the difference isolates the frozen interval. At or above `I` the daemon applies the same reconciliation `recover()` performs; below `I` it is absorbed, consistent with situation 5. `recover()` and the in-loop path share one `reconcile_gap` so they cannot drift apart.

*Alternative considered — CLOCK_BOOTTIME vs CLOCK_MONOTONIC*, which isolates suspend exactly. Rejected for now: Linux-only, not exposed by `std::time::Instant`, and the precision is unnecessary for a 10-minute threshold.

### 6. Reconciliation anchors to the most recent evidence, not the coarsest

`recover()` currently anchors to `last_heartbeat.or(last_active_time)` (`state_machine.rs:91`) — it *prefers the heartbeat*, which is the coarser and usually older of the two. `last_active_time` is updated on every tick where input is fresh (`state_machine.rs:106`) and `save_state` persists it every loop iteration (`main.rs:227`), so it is accurate to the poll interval (15 s) rather than the heartbeat interval (5 min).

The anchor becomes `max(last_heartbeat, last_active_time)`, cutting the residual over-count on an abrupt power loss from up to 5 minutes to up to 15 seconds. This is local state, written to disk on every tick, and therefore entirely independent of the network — which is the property that makes daemon-side recovery more reliable than anything the backend can infer.

### 7. Local liveness and transmitted liveness are separate concerns at separate cadences

These are two different jobs and there is no reason for one number to serve both:

| | Purpose | Needs to be | Cadence |
| --- | --- | --- | --- |
| **Local** (disk) | reconstruct the end timestamp after an ungraceful shutdown | as precise as is cheap | every poll — 15 s |
| **Transmitted** (wire) | coarse liveness for the never-returns bound and "active now" | coarse is sufficient | every 5 min |

The transmitted rhythm can be coarse precisely because of decision 1: the daemon decides where spans start and end, so the wire heartbeat is never the thing that determines a boundary for a machine that comes back. Its only jobs are the never-returns case and status display, and both tolerate minutes of granularity. That is what makes the ~1% write footprint affordable without any accuracy cost.

**The local side already exists and is finer than a dedicated one-minute heartbeat would be.** `save_state` persists on every loop iteration (`main.rs:227`), and `last_active_time` is updated on every tick with fresh input (`state_machine.rs:106`) — so local evidence is already written at the 15-second poll interval. Adding a separate one-minute local heartbeat would be a *coarser* mechanism duplicating a finer one. Decision 6's re-anchoring is what actually unlocks it: the data was always there at 15-second resolution, and `recover()` was reading the 5-minute value instead.

**`poll_sec` is not the same thing as the local heartbeat, though today they coincide.** `poll_sec` (default 15, `config.rs:21`) is doing three jobs at once:

1. the loop sleep interval (`main.rs:232`);
2. the **freshness threshold** — `input_fresh` is `idle_ms < poll_ms` (`state_machine.rs:83`);
3. *incidentally*, the local persistence cadence, because `save_state` happens to sit in the loop body (`main.rs:227`).

Only the third is the "local heartbeat" in the sense meant here, and it coincides with `poll_sec` by accident of call placement rather than by design. Naming the three apart matters because job 2 is a live footgun of the same shape as the `heartbeatSec` one: `poll_sec` lives in the local config file and is user-editable, and raising it silently widens what counts as *fresh input*. Set it to 300 and someone who has been idle four minutes is still treated as actively working, because their `idle_ms` is below the threshold. Sampling cadence and the definition of "recent input" should not be the same number, so the freshness threshold becomes its own constant rather than a re-use of the poll interval.

*The remaining question is disk churn, not accuracy.* Persisting every 15 s is ~5,760 small atomic writes per day. That is unremarkable for an SSD and the file is tiny, but the daemon is required to keep a minimal footprint, so throttling persistence to roughly once a minute is a legitimate trade: 4× fewer writes for a worst-case reconstruction error of 60 s instead of 15 s. Against half-hour transcription rounding both are noise. Keeping the 15 s cadence for now on the grounds that the writes are already atomic and small, with the throttle noted as a cheap lever if footprint ever matters.

### 8. Idle is back-dated from the reported idle time, not the last polled tick

Back-dating an `idle` to when inactivity *began* rather than to when the threshold tripped is already implemented and tested (`state_machine.rs:114-116`; `idle_is_backdated_to_last_input`). The anchor, though, is `last_active_time` — the last poll at which input looked fresh — which quantises the result to the poll interval.

The OS already reports the exact answer. At a tick with idle time `X`, the true last input was at `now − X`. Worked through: polls at 15-second spacing, input actually stops at t=7 s. The t=15 poll still sees `idle_ms = 8`, below the poll interval, so it records `last_active_time = 15`. The transition confirms at t=615 with `idle_ms = 608`; back-dating to `last_active_time` yields 15, while `now − idle_ms` yields exactly 7.

So the idle-timeout path anchors to `max(last_active_time, now − idle_ms)`, which is exact rather than poll-quantised and cannot regress below the last observed activity if the OS reports something implausible.

The **lock** path deliberately keeps `last_active_time`. On lock, reported idle time is near zero, so `now − idle_ms` would resolve to the lock moment and count the quiet stretch between the last keystroke and the lock as work. Anchoring to the last real input is the conservative and correct reading, and the existing `locked_session_goes_idle` test pins it.

### 9. Clock changes are separated from suspends, and never invert a span

The same divergence appears when the clock is stepped, so the two are ambiguous by construction and are separated by sign and magnitude:

- **Backwards divergence**: a clock correction, never downtime. No span is closed. Additionally no emitted event may carry a `ts` below the last emitted event's `ts`, or `pairSpans` — which sorts by `ts` — would pair the wrong edges.
- **Forward below `I`**: absorbed, whether a small NTP step or a brief suspend.
- **Forward at or above `I`**: treated as downtime. A genuine forward jump that large is rare, and closing the span errs toward under-counting rather than fabricating work.

### 10. Power and shutdown handlers are a fast path, never the mechanism

Signals give an *exact* close instead of a reconciled one, but they can be missed — a power cut fires nothing, and an OS may kill the process before a handler finishes. Every handler is therefore an optimisation, and the system must be correct with all of them disabled.

- **Linux**: logind `PrepareForSleep(true)` over D-Bus; `SIGTERM` on service stop and shutdown.
- **Windows**: console control handler for `CTRL_SHUTDOWN_EVENT`/`CTRL_CLOSE_EVENT`; `WM_POWERBROADCAST`/`PBT_APMSUSPEND`.

Each emits `idle` and flushes the outbox synchronously. Windows power broadcasts need a message loop the daemon lacks, so this work is sequenced **last** — the safety net must not wait on it.

### 11. Outbox hardening

Three defects matter once a machine is offline for a long stretch — the very case decision 2 defers to:

- **Non-atomic writes.** `persist()` and `save_state` use a plain `fs::write` (`outbox.rs:75`, `main.rs:288`). A crash mid-write truncates the JSON; `Outbox::open` then returns `InvalidData` (`outbox.rs:25`), the daemon fails to start, and every buffered event is stranded. Writes become temp-file + atomic rename.
- **Unbounded growth.** `pending` grows forever. Events older than the backend's 120-day edit window are useless on arrival and are trimmed against it.
- **All-or-nothing batches.** `next_batch` sends the whole queue as one request (`outbox.rs:51-60`); once it exceeds the ingest limit it can never succeed, wedging the queue permanently. Batches are chunked, each with its own `batch_seq`, and `ack` clears only the acknowledged chunk.

## Risks / Trade-offs

- **During a network outage the day reads low until the outbox drains** → accepted and deliberate (decision 2); it self-corrects on arrival, and under-counting is the safe direction. The alternative — trusting an unclosed span — is what produced the 24-hour Saturday.
- **A machine that never returns keeps up to `k × H` ≈ 15 min of phantom** → within the existing half-hour transcription rounding, and manually correctable.
- **Suspend detection is approximate** → it only needs to clear a 10-minute threshold; the error is seconds.
- **Widening dirty-marking re-seals more days** → bounded by the span's extent, and only on ingest that changes a span.
- **Handlers may double-close** (handler fires, then reconciliation also runs) → the state machine already ignores a close when it is not in `Active`, so the second is a no-op; covered by test.

## Migration Plan

No schema or wire change. Existing stored events are re-read by the new `pairSpans`, so historical phantom spans shrink on the next recompute — days inside the 120-day window self-heal, and `markAllDaysDirty()` can force it. Days already sealed *and* pruned keep their rollup; those are beyond the edit window. Rollback is a redeploy.

Daemon and backend deploy independently and are compatible in both directions: an old daemon with a new backend gets the provisional bound (strictly better than today); a new daemon with an old backend closes its own spans correctly and the backend simply never needs the bound.

## Open Questions

- Should the grace multiplier `k` be a per-account setting? Starting as a constant — it is a property of protocol timing, not of a working pattern, and an extra knob invites misconfiguration that silently distorts hours.
- Should a machine that has been silent for a long time be surfaced in the UI ("laptop last seen 3 days ago"), so a user can tell an outage from a retired machine? The backend cannot distinguish them, but the *user* can at a glance — proposed as a follow-up rather than widening this change.
