"""Durable local outbox — mirror of `outbox.rs`.

Events are buffered to disk so nothing is lost while offline; the whole queue is
flushed on reconnect, and a monotonic `batch_seq` lets the backend deduplicate
re-sent batches. The on-disk JSON format matches the Rust daemon's exactly so
either implementation can resume the other's outbox (proven by the harness).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

# Events older than the backend's edit window are rejected on arrival; holding
# them only grows the file.
MAX_EVENT_AGE_MS = 120 * 86_400_000

# Upper bound on one flush, so a long backlog drains across several acknowledged
# batches rather than one oversized request that can never succeed.
MAX_BATCH_EVENTS = 2_000


class Outbox:
    def __init__(self, path: Path, next_seq: int, pending: list, machine: Optional[dict]) -> None:
        self.path = path
        self.next_seq = next_seq
        self.pending = pending
        self.machine = machine

    @classmethod
    def open(cls, path: Path) -> "Outbox":
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return cls(path, 0, [], None)
        try:
            state = json.loads(text)
        except json.JSONDecodeError as e:
            # A torn file must not strand the daemon: refusing to start would
            # hold buffered events hostage AND stop new capture. Move it aside so
            # the contents stay recoverable, then start empty.
            aside = path.with_suffix(".corrupt")
            moved = False
            try:
                path.rename(aside)
                moved = True
            except OSError:
                pass
            extra = f" (previous contents kept at {aside})" if moved else ""
            print(f"warning: outbox unreadable ({e}); starting with an empty queue{extra}")
            return cls(path, 0, [], None)
        return cls(
            path,
            state.get("next_seq", 0),
            state.get("pending", []),
            state.get("machine"),
        )

    def trim_expired(self, now: int) -> int:
        """Drop events the backend would reject as too old. Returns how many went."""
        before = len(self.pending)
        self.pending = [e for e in self.pending if now - e["ts"] < MAX_EVENT_AGE_MS]
        return before - len(self.pending)

    def pending_len(self) -> int:
        return len(self.pending)

    def set_machine(self, machine: dict) -> None:
        self.machine = machine
        self._persist()

    def append(self, events: list) -> None:
        if not events:
            return
        self.pending.extend(events)
        self._persist()

    def next_batch(self) -> Optional[dict]:
        """The next chunk to send (empty pending -> None). Includes the machine
        descriptor on every batch until first successfully sent. Capped at
        MAX_BATCH_EVENTS."""
        if not self.pending:
            return None
        n = min(len(self.pending), MAX_BATCH_EVENTS)
        return {
            "batch_seq": self.next_seq,
            "events": list(self.pending[:n]),
            "machine": self.machine,
        }

    def ack(self) -> None:
        """Drop exactly the events the just-sent batch carried and advance the
        sequence, so the next chunk gets its own batch_seq."""
        n = min(len(self.pending), MAX_BATCH_EVENTS)
        del self.pending[:n]
        self.next_seq += 1
        self.machine = None
        self._persist()

    def _persist(self) -> None:
        """Write via a temp file and rename (atomic within a directory), so a
        reader never sees a torn file."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        state = {"next_seq": self.next_seq, "pending": self.pending, "machine": self.machine}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state), encoding="utf-8")
        os.replace(tmp, self.path)
