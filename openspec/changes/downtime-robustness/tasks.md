> **Ordering rationale.** The daemon is the authority (design decision 1), so its
> reconciliation lands first — it resolves 10 of the 13 practical situations. The
> backend's provisional bound follows as the floor for the machine that never
> returns, and the repair path (group 5) is what makes a network outage correct
> rather than merely bounded.

## 1. Daemon: precise anchoring and gap reconciliation

- [ ] 1.1 Change the `recover()` anchor from `last_heartbeat.or(last_active_time)` to the **later** of the two (`state_machine.rs:91`), so the close back-dates to poll-interval precision (15 s) rather than heartbeat-interval precision (5 min).
- [ ] 1.2 Extract the body of `StateMachine::recover` into a shared `reconcile_gap(now, gap_ms)` and have `recover` call it, so startup and in-loop reconciliation cannot drift apart.
- [ ] 1.3 Add a monotonic reading (`Instant`) alongside `now_ms()` in `main.rs`, and carry both into `Tick` (wall `now`, plus monotonic elapsed since the previous tick).
- [ ] 1.4 In `step`, compute `divergence = Δwall − Δmono`; at or above `min_inactivity_ms`, call `reconcile_gap` before the normal state handling so a suspend is closed at the last evidence rather than absorbed.
- [ ] 1.5 Ignore backwards divergence for span purposes (clock correction, never downtime), and clamp emitted timestamps so no event's `ts` falls below the last emitted `ts`; persist that watermark alongside the other `Persisted` fields.
- [ ] 1.6 Absorb forward divergence below `min_inactivity`, matching the existing "short break absorbed" semantics.
- [ ] 1.7 Decouple the **freshness threshold** from `poll_sec`: `input_fresh` currently tests `idle_ms < poll_ms` (`state_machine.rs:83`), so editing the local `poll_sec` silently redefines what counts as recent input — at `poll_sec = 300` a user idle four minutes still reads as active. Give freshness its own constant, sized just above the poll interval, and keep `poll_sec` to sampling cadence alone.
- [ ] 1.8 Make idle back-dating exact on the idle-timeout path: anchor to `max(last_active_time, tick.now − tick.idle_ms)` instead of `last_active_time` alone (`state_machine.rs:115`). Keep the lock path on `last_active_time` — reported idle time at lock reflects the lock, not the user's last activity, and `locked_session_goes_idle` pins that.

## 2. Daemon: reconciliation tests

- [ ] 2.1 Anchor precision: with a last input more recent than the last heartbeat, the close back-dates to the input (guards 1.1).
- [ ] 2.2 Sleep longer than `min_inactivity` with the process alive: span closed back-dated to the last evidence.
- [ ] 2.3 The reported bug — resume with immediate input (small `idle_ms`) still reconciles instead of staying active.
- [ ] 2.4 Suspend shorter than `min_inactivity` is absorbed with no event.
- [ ] 2.5 Backwards clock step: no span closed, no event emitted below the watermark.
- [ ] 2.6 Small forward clock step is absorbed.
- [ ] 2.7 Startup `recover()` and in-loop reconciliation produce identical events for the same gap (guards 1.2's shared path).
- [ ] 2.8 A handler-emitted close followed by reconciliation does not double-close (the second is a no-op because the state is no longer `Active`).
- [ ] 2.9 Freshness is independent of sampling cadence: with `poll_sec` raised well above the freshness constant, input older than the freshness window is no longer treated as fresh (guards 1.7).
- [ ] 2.10 Back-dating precision: inactivity beginning between two polls yields an idle at the true stop time, not at the last fresh poll (guards 1.8). Assert the existing `locked_session_goes_idle` still back-dates to the last input.

## 3. Backend: provisional bound for open spans

- [ ] 3.1 In `pairSpans` (`backend/src/worktime/worktime.ts`), track per machine the timestamp of the last `PRESENCE` event seen (heartbeat included) as `lastAlive`, alongside the existing `open` cursor.
- [ ] 3.2 Close an orphan open span at `min(checkTime, lastAlive + GRACE)` instead of `checkTime`, with `GRACE = 3 × heartbeatSec × 1000`. Drop the span entirely if the bound is not after `open`.
- [ ] 3.3 Keep the bound purely read-time — derived from stored events inside `pairSpans`, never written back as an event or correction, so a later arrival supersedes it with no undo.
- [ ] 3.4 Carry the inference through the result: mark a period whose end came from the bound as provisional and attach the machine's last-seen timestamp, so the UI can distinguish an inferred end from an observed one. Periods closed by an event are not marked.
- [ ] 3.5 Also expose whether the period is still **growing** — its machine seen within the liveness window (`3 × heartbeatSec`, the notion `getStatus` already uses). The UI gates edit actions on this, not on `provisional`, so a permanently-stalled period stays correctable.
- [ ] 3.6 Thread `heartbeatSec` into `pairSpans` — it already reaches `computeWeek` via `Settings`; pass the derived grace rather than the whole settings object so the function stays pure and unit-testable.
- [ ] 3.7 Update the callers at `tenant-do.ts:316` (`getStatus`) and `:397` so both use the same bound. Check whether `getStatus`'s own `3 × heartbeatSec` liveness check at `:318` now duplicates this and collapse it if so.

## 4. Backend: calc tests

- [ ] 4.1 A machine that emits `active` + heartbeats then stops: the span ends at `lastHeartbeat + grace`, not at `checkTime`.
- [ ] 4.2 The Friday-16:00-to-Sunday-evening case from the design: Friday is bounded and Saturday/Sunday contain no time from that machine.
- [ ] 4.3 A currently-heartbeating machine is not truncated — its open span still reaches `checkTime`.
- [ ] 4.4 One missed heartbeat inside a continuing session does not truncate the span (grace covers it).
- [ ] 4.5 An explicit `idle` later than the inferred bound wins — the machine's own account supersedes the inference.
- [ ] 4.6 Late-arriving heartbeats extend a previously bounded span on recompute; late-arriving `idle` replaces the bound entirely.
- [ ] 4.7 Two machines, one suspended mid-span and one active: the suspended one is bounded independently and does not inflate the union.
- [ ] 4.8 The truncated remainder is an ordinary gap — assert an out-of-hours tail is not counted and an in-hours sub-threshold tail is bridged, i.e. existing rules decide it.

## 5. Backend: the repair path (dirty-marking widens)

- [ ] 5.1 In `ingest` (`backend/src/tenant-do.ts:143-154`), detect when an arriving event closes or shortens a machine's open span, and mark every day from the span's start day through the previously-assumed end day.
- [ ] 5.2 Keep single-day marking for events that do not change a span's extent, so ordinary ingest does not re-seal the whole window.
- [ ] 5.3 Test: a late `idle` for Friday marks Friday, Saturday and Sunday dirty; an ordinary mid-day event marks only its own day.
- [ ] 5.4 Test the outage round-trip end to end: a day reads low while events are buffered, and returns to the correct total once they are flushed — no working time lost. This is the scenario that justifies the bound being provisional.

## 6. Cost: keep the free tier structurally safe

- [ ] 6.1 Verify the current Cloudflare free-tier Durable Objects figures (rows written/day, rows read/day, storage) against the live docs rather than a remembered number, and record them in the design's cost section with the date checked.
- [ ] 6.2 Remove `heartbeatSec` **and** `minInactivitySec` from the per-account `Settings` interface and `DEFAULT_SETTINGS` (`backend/src/worktime/settings.ts`), replacing both with backend constants — protocol and cost timing, not preferences, and unsettable beats validated. `minInactivitySec` doubles as this design's downtime threshold (decisions 5–6), which must not vary per account.
- [ ] 6.3 Keep `minActivitySec` configurable — a fixed inactivity threshold already caps transition frequency, so it cannot drive write volume alone — and add it to `normalizeSettingsPatch` with a sane domain, since it is unvalidated today.
- [ ] 6.4 Keep `/config` (`index.ts:115-119`) serving all three: the two constants plus the stored `minActivitySec`, so the daemon still has one source of truth and the sides cannot drift.
- [ ] 6.5 Point the backend's own uses at the constants: `GRACE` in `pairSpans` (task 3.2) and the liveness window in `getStatus` (`tenant-do.ts:318`).
- [ ] 6.6 Handle stored settings that already carry the removed keys — `withDefaults` merges stored JSON over defaults, so confirm a stale stored `heartbeatSec`/`minInactivitySec` cannot resurrect a per-account value once the fields are gone.
- [ ] 6.7 Test: a settings write attempting to set either constant leaves stored settings and the `/config` response unchanged; a valid `minActivitySec` write is persisted and served, and an out-of-domain one is rejected.
- [ ] 6.8 After `settings-form-controls` is archived, correct the `web-ui` "Settings screen" requirement — "the daemon thresholds" now denotes only `minActivitySec`. Sequenced deliberately: both changes modify that requirement, and competing deltas would clash.
- [ ] 6.7 Measure actual row writes for one simulated 8-hour day against the local stack and confirm the ~1,000/day figure the design claims — if it is materially higher, the ratio argument needs revisiting before this ships.

## 7. UI: provisional periods read as "last known", not as measured

- [ ] 7.1 Give a provisional period its own presentation across its **whole extent** in the day timeline (`backend/src/ui/render.ts`) — not just a marked tail — distinguishable from the existing measured/bridged/manual/removed/gap treatments, and additionally draw its right edge as indefinite rather than as a hard boundary.
- [ ] 7.2 Show the machine's last-seen time on the period, so it reads "active at least until 16:00, then unknown" rather than as a confirmed end.
- [ ] 7.3 Suppress the action strip while the period is still growing (machine seen within the liveness window) — a correction anchored to a moving edge is not the correction the user meant. Say why in the strip rather than showing an empty one.
- [ ] 7.4 Restore the actions once the machine is no longer being seen, even though the period stays provisional — otherwise a machine that never returns leaves a permanently uncorrectable period.
- [ ] 7.5 Confirm the presentation re-adapts with no special handling: later heartbeats move the end, and the daemon's own `idle` turns it into an ordinary measured period. Both are plain recomputes, so this is a rendering check, not new logic.
- [ ] 7.6 Check a day with no open spans is visually unchanged — the marking must be invisible when nothing is wrong.

## 8. Daemon: outbox hardening

- [ ] 8.1 Make `Outbox::persist` and `save_state` atomic — write to a temp file in the same directory, then rename over the target.
- [ ] 8.2 Trim events older than the backend's 120-day edit window on load and before persist, so an extended offline period cannot grow the queue without limit.
- [ ] 8.3 Chunk `next_batch` to a bounded event count, and change `ack` to clear only the acknowledged chunk rather than the whole queue — each chunk carrying its own `batch_seq`.
- [ ] 8.4 Tests: a truncated/corrupt outbox file still starts (7.1); trimming drops only over-age events; a queue larger than one chunk drains across several acknowledged batches with distinct `batch_seq`.

## 9. E2E

- [ ] 9.1 Add a fixtures scenario for a machine that goes quiet mid-span (active + heartbeats, then nothing) and assert the oracle bounds it at the last heartbeat rather than filling to now.
- [ ] 9.2 Extend it across a day boundary to lock in that the bleed into following days is gone — the regression that would hurt most if it returned.

## 10. Power and shutdown handlers (sequenced last — optimisation only)

- [ ] 10.1 Linux: handle `SIGTERM` (service stop, shutdown) by emitting `idle` at now and flushing synchronously before exit.
- [ ] 10.2 Linux: subscribe to logind `PrepareForSleep(true)` over D-Bus and do the same before suspend.
- [ ] 10.3 Windows: console control handler for `CTRL_SHUTDOWN_EVENT`/`CTRL_CLOSE_EVENT`.
- [ ] 10.4 Windows: `WM_POWERBROADCAST`/`PBT_APMSUSPEND`, which needs a message loop the daemon does not currently have — keep it isolated from the poll loop.
- [ ] 10.5 Verify with every handler disabled that behaviour still degrades to reconciliation and the bound, so correctness never depends on a signal firing.

## 11. Verify

- [ ] 11.1 `cargo test` for the daemon and `npm test` for the backend — all green.
- [ ] 11.2 Manually exercise suspend/resume on this machine (`systemctl suspend`) with the daemon running against the local stack, and confirm the suspended interval is not counted.
- [ ] 11.3 Manually exercise a network outage — stop the local backend, keep working, restart it — and confirm the day returns to the correct total after the flush.
- [ ] 11.4 Confirm a normal working day is unchanged end-to-end: the bound must be invisible when nothing goes wrong.
