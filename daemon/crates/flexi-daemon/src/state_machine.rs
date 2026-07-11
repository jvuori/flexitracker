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

use flexi_core::{ActivityEvent, EventKind};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum State {
    Active,
    Idle,
}

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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Persisted {
    pub reported_state: State,
    pub last_active_time: Option<i64>,
    pub last_heartbeat: Option<i64>,
    pub pending_active_since: Option<i64>,
}

impl Default for Persisted {
    fn default() -> Self {
        Self {
            reported_state: State::Idle,
            last_active_time: None,
            last_heartbeat: None,
            pending_active_since: None,
        }
    }
}

/// One observation from the OS.
pub struct Tick {
    pub now: i64,
    pub idle_ms: i64,
    pub locked: bool,
}

pub struct StateMachine {
    pub t: Thresholds,
    pub p: Persisted,
}

impl StateMachine {
    pub fn new(t: Thresholds, p: Persisted) -> Self {
        Self { t, p }
    }

    fn ev(ts: i64, kind: EventKind) -> ActivityEvent {
        ActivityEvent { ts, kind }
    }

    /// Fresh input observed this tick (not locked, input within one poll).
    fn input_fresh(&self, tick: &Tick) -> bool {
        !tick.locked && tick.idle_ms < self.t.poll_ms
    }

    /// On startup, reconcile downtime the daemon could not observe (reboot/sleep).
    /// If we were Active and have been silent for >= min_inactivity, close the
    /// span back-dated to the last heartbeat/active time.
    pub fn recover(&mut self, now: i64) -> Vec<ActivityEvent> {
        if self.p.reported_state == State::Active {
            let anchor = self.p.last_heartbeat.or(self.p.last_active_time);
            if let Some(a) = anchor {
                if now - a >= self.t.min_inactivity_ms {
                    self.p.reported_state = State::Idle;
                    self.p.pending_active_since = None;
                    return vec![Self::ev(a, EventKind::Idle)];
                }
            }
        }
        Vec::new()
    }

    pub fn step(&mut self, tick: Tick) -> Vec<ActivityEvent> {
        let fresh = self.input_fresh(&tick);
        if fresh {
            self.p.last_active_time = Some(tick.now);
        }
        let mut out = Vec::new();

        match self.p.reported_state {
            State::Active => {
                let idle_long = tick.locked || tick.idle_ms >= self.t.min_inactivity_ms;
                if idle_long {
                    // Back-date the idle to when input actually stopped.
                    let ts = self.p.last_active_time.unwrap_or(tick.now);
                    out.push(Self::ev(ts, EventKind::Idle));
                    self.p.reported_state = State::Idle;
                    self.p.pending_active_since = None;
                } else if self.due_heartbeat(tick.now) {
                    out.push(Self::ev(tick.now, EventKind::Heartbeat));
                    self.p.last_heartbeat = Some(tick.now);
                }
            }
            State::Idle => {
                if fresh {
                    let since = *self.p.pending_active_since.get_or_insert(tick.now);
                    if tick.now - since >= self.t.min_activity_ms {
                        // Confirmed return; back-date to when activity resumed.
                        out.push(Self::ev(since, EventKind::Active));
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
    fn active_tick(now: i64) -> Tick {
        Tick { now, idle_ms: 0, locked: false }
    }
    fn idle_tick(now: i64, idle_ms: i64) -> Tick {
        Tick { now, idle_ms, locked: false }
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
        assert!(m.step(active_tick(1_000)).is_empty(), "not confirmed on first tick");
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
        assert!(out.is_empty(), "sub-min_activity blip must not report active");
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
        assert_eq!(out[0].ts, 100_000, "active back-dated to when input resumed");
    }

    #[test]
    fn heartbeats_emitted_while_active() {
        let mut m = sm();
        activate(&mut m, 0); // confirmed active; last heartbeat at 40s
        assert!(m.step(active_tick(100_000)).is_empty(), "60s < heartbeat interval");
        let out = m.step(active_tick(340_000)); // 300s since last hb → due
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Heartbeat);
    }

    #[test]
    fn recover_after_sudden_shutdown() {
        // Was active, last heartbeat at 16:00; boot next day 08:00.
        let mut m = sm();
        m.p.reported_state = State::Active;
        m.p.last_heartbeat = Some(16 * 3600_000);
        let out = m.recover(32 * 3600_000); // +16h later
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Idle);
        assert_eq!(out[0].ts, 16 * 3600_000, "idle back-dated to last heartbeat");
        assert_eq!(m.p.reported_state, State::Idle);
    }

    #[test]
    fn locked_session_goes_idle() {
        let mut m = sm();
        activate(&mut m, 0); // last_active = 40s
        let out = m.step(Tick { now: 50_000, idle_ms: 0, locked: true });
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EventKind::Idle);
        assert_eq!(out[0].ts, 40_000, "idle back-dated to last real input");
    }
}
