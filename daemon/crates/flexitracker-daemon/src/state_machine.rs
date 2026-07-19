//! Debounced hysteresis state machine (activity-daemon spec).
//!
//! Ported and extended from the predecessor's `activity_monitor.py`:
//! - idle is confirmed only after `min_inactivity` and emitted **back-dated** to
//!   the last real input,
//! - return-to-active is confirmed only after `min_activity` of sustained input
//!   (edge-side debounce that keeps sub-threshold jitter off the wire),
//! - periodic heartbeats bound crash/sleep damage.
//!
//! Pure: `step` takes an observation and returns events, with no I/O.

use flexitracker_core::{ActivityEvent, EventKind};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum State {
    Active,
    Idle,
}

/// Input newer than this counts as "fresh" on a tick.
///
/// Deliberately NOT `poll_ms`: freshness is "how recent must input be to mean
/// the user is here", while the poll interval is only how often we look. Tying
/// them together meant raising the poll interval silently widened freshness —
/// at a 300 s poll, someone idle four minutes still read as active.
pub const FRESH_INPUT_MS: i64 = 20_000;

#[derive(Debug, Clone)]
pub struct Thresholds {
    pub poll_ms: i64,
    pub min_inactivity_ms: i64,
    pub min_activity_ms: i64,
    pub heartbeat_ms: i64,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            poll_ms: 15_000,
            min_inactivity_ms: 10 * 60_000,
            min_activity_ms: 30_000,
            heartbeat_ms: 5 * 60_000,
        }
    }
}

/// The persisted part — survives restarts so reboots reconcile (see `recover`).
/// Written on every poll, so it is accurate to the poll interval and entirely
/// independent of the network: this is what makes daemon-side reconciliation
/// more reliable than anything the backend can infer about a quiet machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Persisted {
    pub reported_state: State,
    pub last_active_time: Option<i64>,
    pub last_heartbeat: Option<i64>,
    pub pending_active_since: Option<i64>,
    /// Timestamp of the most recently emitted event. Events are paired into
    /// spans in `ts` order, so emitting one below this would pair the wrong
    /// edges; a backwards clock must never be able to do that.
    #[serde(default)]
    pub last_emitted_ts: Option<i64>,
    /// Wall clock at the previous tick, differenced against monotonic elapsed
    /// time to detect a suspend. Only meaningful within a single process run —
    /// across a restart the first tick carries no monotonic delta and startup
    /// `recover` handles the gap instead.
    #[serde(default)]
    pub last_seen_wall: Option<i64>,
}

impl Default for Persisted {
    fn default() -> Self {
        Self {
            reported_state: State::Idle,
            last_active_time: None,
            last_heartbeat: None,
            pending_active_since: None,
            last_emitted_ts: None,
            last_seen_wall: None,
        }
    }
}

/// One observation from the OS.
pub struct Tick {
    pub now: i64,
    pub idle_ms: i64,
    pub locked: bool,
    /// Monotonic milliseconds elapsed since the previous tick. Compared against
    /// wall-clock movement to separate a suspend (wall advances, monotonic does
    /// not) from a clock step. `None` on the first tick, where there is no
    /// previous observation to difference against.
    pub mono_elapsed_ms: Option<i64>,
}

pub struct StateMachine {
    pub t: Thresholds,
    pub p: Persisted,
}

impl StateMachine {
    pub fn new(t: Thresholds, p: Persisted) -> Self {
        Self { t, p }
    }

    /// Emit an event, holding the monotonic-timestamp watermark. Clamping here
    /// rather than at the call sites means no path can emit out of order.
    fn emit(&mut self, ts: i64, kind: EventKind) -> ActivityEvent {
        let ts = match self.p.last_emitted_ts {
            Some(prev) if ts < prev => prev,
            _ => ts,
        };
        self.p.last_emitted_ts = Some(ts);
        ActivityEvent { ts, kind }
    }

    /// Fresh input observed this tick (not locked, input newer than the
    /// freshness window — see `FRESH_INPUT_MS`, which is independent of the
    /// poll interval).
    fn input_fresh(&self, tick: &Tick) -> bool {
        !tick.locked && tick.idle_ms < FRESH_INPUT_MS
    }

    /// The most recent local evidence that the user was actually here.
    ///
    /// The *later* of the two, not `last_heartbeat` first: heartbeats are
    /// minutes apart while `last_active_time` is written every poll, so
    /// preferring the heartbeat threw away resolution we already had.
    fn last_evidence(&self) -> Option<i64> {
        match (self.p.last_heartbeat, self.p.last_active_time) {
            (Some(h), Some(a)) => Some(h.max(a)),
            (h, a) => h.or(a),
        }
    }

    /// Reconcile an interval during which the daemon was not observing —
    /// a reboot, a crash, or a suspend. Shared by startup `recover` and the
    /// in-loop gap detection so the two cannot drift apart.
    ///
    /// Gaps below `min_inactivity` are absorbed into the ongoing span, matching
    /// "short break absorbed"; longer ones close it back-dated to the last local
    /// evidence, and the normal Idle→Active debounce reopens it if the user is
    /// present.
    fn reconcile_gap(&mut self, gap_ms: i64) -> Vec<ActivityEvent> {
        if self.p.reported_state != State::Active || gap_ms < self.t.min_inactivity_ms {
            return Vec::new();
        }
        let Some(anchor) = self.last_evidence() else {
            return Vec::new();
        };
        self.p.reported_state = State::Idle;
        self.p.pending_active_since = None;
        vec![self.emit(anchor, EventKind::Idle)]
    }

    /// On startup, reconcile downtime the daemon could not observe. The gap is
    /// measured from the last local evidence to now.
    pub fn recover(&mut self, now: i64) -> Vec<ActivityEvent> {
        match self.last_evidence() {
            Some(a) => self.reconcile_gap(now - a),
            None => Vec::new(),
        }
    }

    pub fn step(&mut self, tick: Tick) -> Vec<ActivityEvent> {
        let mut out = Vec::new();

        // Downtime the daemon slept through. The wall clock advances across a
        // suspend while the monotonic clock does not, so the difference isolates
        // the frozen interval. This must run BEFORE the state handling below:
        // on resume the user often touches the keyboard immediately, which makes
        // idle_ms small and would otherwise absorb the whole suspend as work.
        //
        // Backwards divergence is a clock correction, never downtime — and is
        // ignored here rather than being allowed to close a span.
        if let Some(mono) = tick.mono_elapsed_ms {
            let divergence = (tick.now - self.p.last_seen_wall.unwrap_or(tick.now)) - mono;
            if divergence > 0 {
                out.extend(self.reconcile_gap(divergence));
            }
        }
        self.p.last_seen_wall = Some(tick.now);

        let fresh = self.input_fresh(&tick);
        if fresh {
            self.p.last_active_time = Some(tick.now);
        }

        match self.p.reported_state {
            State::Active => {
                let idle_long = tick.locked || tick.idle_ms >= self.t.min_inactivity_ms;
                if idle_long {
                    // Back-date the idle to when input actually stopped.
                    //
                    // `now - idle_ms` is the exact moment, where the poll that
                    // last saw fresh input is only accurate to the poll
                    // interval. On the LOCK path we keep the last-input anchor:
                    // reported idle time at lock reflects the lock rather than
                    // the user's last activity, so `now - idle_ms` would resolve
                    // to the lock moment and count the quiet stretch before it.
                    //
                    // Note it is `now - idle_ms` ALONE, not the later of that
                    // and `last_active_time`: the latter is the last poll where
                    // input *looked* fresh, so it over-estimates by up to the
                    // freshness window and taking the later of the two would
                    // reinstate exactly the quantisation being removed. The
                    // floor against an implausible OS reading is `emit`'s
                    // watermark, which already prevents an event preceding the
                    // `active` that opened this span.
                    let ts = if tick.locked {
                        self.p.last_active_time.unwrap_or(tick.now)
                    } else {
                        tick.now - tick.idle_ms
                    };
                    let e = self.emit(ts, EventKind::Idle);
                    out.push(e);
                    self.p.reported_state = State::Idle;
                    self.p.pending_active_since = None;
                } else if self.due_heartbeat(tick.now) {
                    let e = self.emit(tick.now, EventKind::Heartbeat);
                    out.push(e);
                    self.p.last_heartbeat = Some(tick.now);
                }
            }
            State::Idle => {
                if fresh {
                    let since = *self.p.pending_active_since.get_or_insert(tick.now);
                    if tick.now - since >= self.t.min_activity_ms {
                        // Confirmed return; back-date to when activity resumed.
                        let e = self.emit(since, EventKind::Active);
                        out.push(e);
                        self.p.reported_state = State::Active;
                        self.p.pending_active_since = None;
                        self.p.last_heartbeat = Some(tick.now);
                    }
                } else {
                    // Activity did not sustain — drop the tentative return.
                    self.p.pending_active_since = None;
                }
            }
        }
        out
    }

    fn due_heartbeat(&self, now: i64) -> bool {
        match self.p.last_heartbeat {
            Some(hb) => now - hb >= self.t.heartbeat_ms,
            None => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sm() -> StateMachine {
        StateMachine::new(Thresholds::default(), Persisted::default())
    }
    // These helpers carry no monotonic delta, so the suspend path is inert and
    // they exercise the state logic alone. Suspend and clock-step tests build
    // their ticks explicitly with `mono_tick`.
    fn active_tick(now: i64) -> Tick {
        Tick {
            now,
            idle_ms: 0,
            locked: false,
            mono_elapsed_ms: None,
        }
    }
    fn idle_tick(now: i64, idle_ms: i64) -> Tick {
        Tick {
            now,
            idle_ms,
            locked: false,
            mono_elapsed_ms: None,
        }
    }
    /// A tick that also reports how much monotonic time really elapsed, so a
    /// wall-vs-monotonic divergence (suspend, or a clock step) can be expressed.
    fn mono_tick(now: i64, idle_ms: i64, mono_elapsed_ms: i64) -> Tick {
        Tick {
            now,
            idle_ms,
            locked: false,
            mono_elapsed_ms: Some(mono_elapsed_ms),
        }
    }
    /// Bring the machine to a confirmed Active state (two ticks ≥ min_activity).
    fn activate(m: &mut StateMachine, start: i64) {
        m.step(active_tick(start));
        m.step(active_tick(start + 40_000));
        assert_eq!(m.p.reported_state, State::Active);
    }

    #[test]
    fn activation_is_debounced_then_backdated() {
        let mut m = sm();
        assert!(
            m.step(active_tick(1_000)).is_empty(),
            "not confirmed on first tick"
        );
        let out = m.step(active_tick(41_000)); // 40s ≥ min_activity(30s)
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Active);
        assert_eq!(out[0].ts, 1_000, "active back-dated to when input started");
        assert_eq!(m.p.reported_state, State::Active);
    }

    #[test]
    fn idle_is_backdated_to_last_input() {
        let mut m = sm();
        m.step(active_tick(0)); // active pending at 0
        m.step(active_tick(60_000)); // confirmed active; last_active=60s
                                     // Now idle for >= min_inactivity: observed at 12min, idle 11min.
        let out = m.step(idle_tick(12 * 60_000, 11 * 60_000));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Idle);
        assert_eq!(out[0].ts, 60_000, "idle back-dated to last input, not now");
    }

    #[test]
    fn short_break_is_absorbed() {
        let mut m = sm();
        activate(&mut m, 0);
        // idle 5min < min_inactivity(10min): stay active, no event.
        let out = m.step(idle_tick(5 * 60_000, 5 * 60_000));
        assert!(out.is_empty());
        assert_eq!(m.p.reported_state, State::Active);
    }

    #[test]
    fn brief_activity_during_idle_is_debounced() {
        let mut m = sm();
        m.p.reported_state = State::Idle;
        // One fresh tick, then idle again before min_activity elapses.
        assert!(m.step(active_tick(100_000)).is_empty());
        let out = m.step(idle_tick(110_000, 60_000));
        assert!(
            out.is_empty(),
            "sub-min_activity blip must not report active"
        );
        assert_eq!(m.p.reported_state, State::Idle);
    }

    #[test]
    fn sustained_return_reports_active_backdated() {
        let mut m = sm();
        m.p.reported_state = State::Idle;
        m.step(active_tick(100_000)); // pending since 100s
        let out = m.step(active_tick(140_000)); // 40s >= min_activity(30s)
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Active);
        assert_eq!(
            out[0].ts, 100_000,
            "active back-dated to when input resumed"
        );
    }

    #[test]
    fn heartbeats_emitted_while_active() {
        let mut m = sm();
        activate(&mut m, 0); // confirmed active; last heartbeat at 40s
        assert!(
            m.step(active_tick(100_000)).is_empty(),
            "60s < heartbeat interval"
        );
        let out = m.step(active_tick(340_000)); // 300s since last hb → due
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Heartbeat);
    }

    #[test]
    fn recover_after_sudden_shutdown() {
        // Was active, last heartbeat at 16:00; boot next day 08:00.
        let mut m = sm();
        m.p.reported_state = State::Active;
        m.p.last_heartbeat = Some(16 * 3_600_000);
        let out = m.recover(32 * 3_600_000); // +16h later
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Idle);
        assert_eq!(
            out[0].ts,
            16 * 3_600_000,
            "idle back-dated to last heartbeat"
        );
        assert_eq!(m.p.reported_state, State::Idle);
    }

    #[test]
    fn locked_session_goes_idle() {
        let mut m = sm();
        activate(&mut m, 0); // last_active = 40s
        let out = m.step(Tick {
            now: 50_000,
            idle_ms: 0,
            locked: true,
            mono_elapsed_ms: None,
        });
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Idle);
        assert_eq!(out[0].ts, 40_000, "idle back-dated to last real input");
    }

    // ---- downtime reconciliation -------------------------------------------

    #[test]
    fn recover_anchors_to_the_later_evidence_not_the_heartbeat() {
        // Heartbeats are 5 min apart; last_active_time is written every poll.
        // Preferring the heartbeat threw away resolution we already had.
        let mut m = sm();
        m.p.reported_state = State::Active;
        m.p.last_heartbeat = Some(16 * 3_600_000); // 16:00
        m.p.last_active_time = Some(16 * 3_600_000 + 240_000); // 16:04, more recent
        let out = m.recover(32 * 3_600_000);
        assert_eq!(out.len(), 1);
        assert_eq!(
            out[0].ts,
            16 * 3_600_000 + 240_000,
            "back-dated to the last input, not the older heartbeat"
        );
    }

    #[test]
    fn suspend_longer_than_min_inactivity_closes_the_span() {
        let mut m = sm();
        activate(&mut m, 0); // confirmed active, last evidence 40s
                             // Wall advanced 3h; monotonic only advanced one poll: a 3h suspend.
        let out = m.step(mono_tick(3 * 3_600_000, 0, 15_000));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Idle);
        assert_eq!(out[0].ts, 40_000, "closed at the last local evidence");
        assert_eq!(m.p.reported_state, State::Idle);
    }

    #[test]
    fn suspend_is_reconciled_even_when_user_types_immediately_on_wake() {
        // The reported bug: input on wake makes idle_ms small, which used to
        // absorb the entire suspend as working time.
        let mut m = sm();
        activate(&mut m, 0);
        let out = m.step(mono_tick(3 * 3_600_000, 0, 15_000)); // idle_ms = 0: fresh input
        assert!(
            out.iter().any(|e| e.kind == EventKind::Idle),
            "suspend must be closed despite fresh input on resume"
        );
        assert_eq!(
            out.iter().find(|e| e.kind == EventKind::Idle).unwrap().ts,
            40_000
        );
    }

    #[test]
    fn suspend_shorter_than_min_inactivity_is_absorbed() {
        let mut m = sm();
        activate(&mut m, 0);
        // 5 min of wall time unaccounted for, below min_inactivity(10 min).
        let out = m.step(mono_tick(5 * 60_000, 0, 15_000));
        assert!(
            out.is_empty(),
            "brief suspend absorbed, as a brief reboot is"
        );
        assert_eq!(m.p.reported_state, State::Active);
    }

    #[test]
    fn backwards_clock_step_closes_nothing_and_never_emits_below_the_watermark() {
        let mut m = sm();
        activate(&mut m, 600_000); // active confirmed; an Active event was emitted
        let watermark = m.p.last_emitted_ts.unwrap();
        // Clock yanked back an hour while monotonic advanced one poll.
        let out = m.step(mono_tick(600_000 - 3_600_000, 0, 15_000));
        assert!(
            out.is_empty(),
            "a backwards clock is a correction, not downtime"
        );
        assert_eq!(m.p.reported_state, State::Active);
        // Now let it go idle: the emitted ts must not precede the watermark.
        let out = m.step(idle_tick(600_000 - 3_600_000 + 700_000, 700_000));
        for e in &out {
            assert!(
                e.ts >= watermark,
                "emitted {} below watermark {}",
                e.ts,
                watermark
            );
        }
    }

    #[test]
    fn small_forward_clock_step_is_absorbed() {
        let mut m = sm();
        activate(&mut m, 0);
        // 30s of NTP correction: forward divergence far below min_inactivity.
        let out = m.step(mono_tick(70_000, 0, 15_000));
        assert!(out.is_empty());
        assert_eq!(m.p.reported_state, State::Active);
    }

    #[test]
    fn startup_recover_and_in_loop_reconciliation_agree() {
        // Both must route through reconcile_gap, or they will drift apart.
        let gap = 3 * 3_600_000;
        let mut a = sm();
        activate(&mut a, 0);
        let via_loop = a.step(mono_tick(gap, 0, 15_000));

        let mut b = sm();
        activate(&mut b, 0);
        let via_recover = b.recover(gap);

        assert_eq!(via_loop.len(), via_recover.len());
        assert_eq!(via_loop[0].kind, via_recover[0].kind);
        assert_eq!(via_loop[0].ts, via_recover[0].ts);
        assert_eq!(a.p.reported_state, b.p.reported_state);
    }

    #[test]
    fn reconciliation_after_an_explicit_close_does_not_double_close() {
        // A power/shutdown handler emits the idle; reconciliation then runs.
        let mut m = sm();
        activate(&mut m, 0);
        let first = m.step(idle_tick(700_000, 700_000));
        assert_eq!(first.len(), 1, "handler-style close");
        assert_eq!(m.p.reported_state, State::Idle);
        // A later suspend must not produce a second close.
        let second = m.step(mono_tick(4 * 3_600_000, 999_999, 15_000));
        assert!(
            !second.iter().any(|e| e.kind == EventKind::Idle),
            "already idle: nothing to close"
        );
    }

    #[test]
    fn freshness_is_independent_of_the_poll_interval() {
        // Raising poll_sec must not widen what counts as recent input.
        let t = Thresholds {
            poll_ms: 300_000, // 5 min sampling
            ..Thresholds::default()
        };
        let mut m = StateMachine::new(t, Persisted::default());
        m.p.reported_state = State::Idle;
        // Input 4 minutes old: within the poll interval, far outside freshness.
        let out = m.step(idle_tick(1_000_000, 240_000));
        assert!(out.is_empty());
        assert_eq!(
            m.p.reported_state,
            State::Idle,
            "4-minute-old input must not read as active just because polling is slow"
        );
    }

    #[test]
    fn idle_backdating_is_exact_not_poll_quantised() {
        // Input stops at t=7s. The t=15s poll still sees it as fresh and records
        // last_active_time=15s, so anchoring there would be 8s late.
        let mut m = sm();
        m.step(active_tick(0));
        m.step(active_tick(40_000));
        assert_eq!(m.p.reported_state, State::Active);
        m.p.last_active_time = Some(15_000);
        // Confirmed idle at t=615s having been idle 608s → stopped at t=7s.
        let out = m.step(idle_tick(615_000, 608_000));
        assert_eq!(out.len(), 1);
        assert_eq!(
            out[0].ts, 7_000,
            "back-dated to the true stop time, not the last fresh poll"
        );
    }
}
