"""Debounced hysteresis state machine.

Any change here MUST land as a change to the behavioural vectors in
`tests/vectors/`, which are the daemon's oracle for this logic. The behaviour:
- idle is confirmed only after `min_inactivity` and emitted **back-dated** to the
  last real input,
- return-to-active is confirmed only after `min_activity` of sustained input,
- periodic heartbeats bound crash/sleep damage,
- downtime (reboot/suspend/clock-step) is reconciled via monotonic-vs-wall
  divergence and startup recover().

Pure: `step` takes an observation and returns events, with no I/O. All arithmetic
is integer milliseconds.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .core import EventKind, event

# Input newer than this counts as "fresh" on a tick. Deliberately NOT poll_ms:
# freshness is "how recent must input be to mean the user is here", independent
# of how often we poll. See the Rust comment for the bug this prevents.
FRESH_INPUT_MS = 20_000

ACTIVE = "Active"
IDLE = "Idle"


@dataclass
class Thresholds:
    poll_ms: int = 15_000
    min_inactivity_ms: int = 10 * 60_000
    min_activity_ms: int = 30_000
    heartbeat_ms: int = 5 * 60_000


@dataclass
class Persisted:
    """The persisted part — survives restarts so reboots reconcile (see recover).

    Written on every poll; accurate to the poll interval and independent of the
    network.
    """

    reported_state: str = IDLE
    last_active_time: Optional[int] = None
    last_heartbeat: Optional[int] = None
    pending_active_since: Optional[int] = None
    # Timestamp of the most recently emitted event; a backwards clock must never
    # emit below it (spans are paired in ts order).
    last_emitted_ts: Optional[int] = None
    # Wall clock at the previous tick, differenced against monotonic elapsed time
    # to detect a suspend. Only meaningful within a single process run.
    last_seen_wall: Optional[int] = None


@dataclass
class Tick:
    """One observation from the OS."""

    now: int
    idle_ms: int
    locked: bool = False
    # Monotonic ms since the previous tick; None on the first tick.
    mono_elapsed_ms: Optional[int] = None


class StateMachine:
    def __init__(self, thresholds: Thresholds, persisted: Persisted) -> None:
        self.t = thresholds
        self.p = persisted

    def emit(self, ts: int, kind: str) -> dict:
        """Emit an event, holding the monotonic-timestamp watermark. Clamping
        here means no path can emit out of order."""
        prev = self.p.last_emitted_ts
        if prev is not None and ts < prev:
            ts = prev
        self.p.last_emitted_ts = ts
        return event(ts, kind)

    def input_fresh(self, tick: Tick) -> bool:
        return (not tick.locked) and tick.idle_ms < FRESH_INPUT_MS

    def last_evidence(self) -> Optional[int]:
        """The most recent local evidence the user was here: the later of
        heartbeat and last-active-time (last_active is written every poll)."""
        h = self.p.last_heartbeat
        a = self.p.last_active_time
        if h is not None and a is not None:
            return max(h, a)
        return h if h is not None else a

    def reconcile_gap(self, gap_ms: int) -> list:
        """Reconcile an unobserved interval (reboot/crash/suspend). Gaps below
        min_inactivity are absorbed; longer ones close the span back-dated to the
        last local evidence. Shared by recover() and in-loop detection so they
        cannot drift apart."""
        if self.p.reported_state != ACTIVE or gap_ms < self.t.min_inactivity_ms:
            return []
        anchor = self.last_evidence()
        if anchor is None:
            return []
        self.p.reported_state = IDLE
        self.p.pending_active_since = None
        return [self.emit(anchor, EventKind.IDLE)]

    def recover(self, now: int) -> list:
        """On startup, reconcile downtime the daemon could not observe. The gap
        is measured from the last local evidence to now."""
        a = self.last_evidence()
        if a is None:
            return []
        return self.reconcile_gap(now - a)

    def due_heartbeat(self, now: int) -> bool:
        hb = self.p.last_heartbeat
        if hb is None:
            return True
        return now - hb >= self.t.heartbeat_ms

    def step(self, tick: Tick) -> list:
        out: list = []

        # Downtime the daemon slept through: wall advances across a suspend while
        # the monotonic clock does not, so the difference isolates the frozen
        # interval. Runs BEFORE state handling (fresh input on wake must not
        # absorb the suspend). Backwards divergence is a clock correction, ignored.
        if tick.mono_elapsed_ms is not None:
            seen = self.p.last_seen_wall if self.p.last_seen_wall is not None else tick.now
            divergence = (tick.now - seen) - tick.mono_elapsed_ms
            if divergence > 0:
                out.extend(self.reconcile_gap(divergence))
        self.p.last_seen_wall = tick.now

        fresh = self.input_fresh(tick)
        if fresh:
            self.p.last_active_time = tick.now

        if self.p.reported_state == ACTIVE:
            idle_long = tick.locked or tick.idle_ms >= self.t.min_inactivity_ms
            if idle_long:
                # Back-date idle to when input actually stopped. On the LOCK path
                # keep the last-input anchor (reported idle at lock reflects the
                # lock, not the user's last activity); otherwise now - idle_ms is
                # the exact stop moment.
                if tick.locked:
                    ts = self.p.last_active_time if self.p.last_active_time is not None else tick.now
                else:
                    ts = tick.now - tick.idle_ms
                out.append(self.emit(ts, EventKind.IDLE))
                self.p.reported_state = IDLE
                self.p.pending_active_since = None
            elif self.due_heartbeat(tick.now):
                out.append(self.emit(tick.now, EventKind.HEARTBEAT))
                self.p.last_heartbeat = tick.now
        else:  # IDLE
            # "Activity persisted for min_activity" must tolerate short pauses.
            # The claim dies only when idle reaches min_activity itself; below
            # that the accumulator keeps running.
            if tick.locked or tick.idle_ms >= self.t.min_activity_ms:
                self.p.pending_active_since = None
            else:
                # Start only on genuinely fresh input; once started, short pauses
                # no longer reset it. Anchor to the real resume moment.
                if fresh and self.p.pending_active_since is None:
                    self.p.pending_active_since = tick.now - tick.idle_ms
                if self.p.pending_active_since is not None:
                    if tick.now - self.p.pending_active_since >= self.t.min_activity_ms:
                        out.append(self.emit(self.p.pending_active_since, EventKind.ACTIVE))
                        self.p.reported_state = ACTIVE
                        self.p.pending_active_since = None
                        self.p.last_heartbeat = tick.now
        return out
