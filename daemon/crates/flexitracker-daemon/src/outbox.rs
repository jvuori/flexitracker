//! Durable local outbox. Events are buffered to disk so nothing is lost while
//! offline; the whole queue is flushed on reconnect, and a monotonic `batch_seq`
//! lets the backend deduplicate re-sent batches (activity-daemon spec).

use flexitracker_core::{ActivityEvent, EventBatch, MachineDescriptor};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Default, Serialize, Deserialize)]
struct OutboxState {
    next_seq: u64,
    pending: Vec<ActivityEvent>,
    machine: Option<MachineDescriptor>,
}

pub struct Outbox {
    path: PathBuf,
    state: OutboxState,
}

/// Events older than the backend's edit window are rejected on arrival, so
/// holding them only grows the file. Keeps an extended offline period bounded.
const MAX_EVENT_AGE_MS: i64 = 120 * 86_400_000;

/// Upper bound on one flush. The whole queue used to go in a single request, so
/// once it outgrew the ingest limit it could never succeed and the queue wedged
/// permanently — the failure mode is worst exactly when the backlog matters most.
const MAX_BATCH_EVENTS: usize = 2_000;

impl Outbox {
    pub fn open(path: PathBuf) -> std::io::Result<Self> {
        let state = match std::fs::read_to_string(&path) {
            Ok(text) => match serde_json::from_str(&text) {
                Ok(s) => s,
                Err(e) => {
                    // A torn file must not strand the daemon. Refusing to start
                    // would hold every buffered event hostage AND stop new
                    // capture — strictly worse than losing an unsendable queue.
                    // The file is moved aside rather than overwritten, so the
                    // contents remain recoverable and the failure leaves a trace
                    // instead of vanishing.
                    let aside = path.with_extension("corrupt");
                    let moved = std::fs::rename(&path, &aside).is_ok();
                    eprintln!(
                        "warning: outbox unreadable ({e}); starting with an empty queue{}",
                        if moved {
                            format!(" (previous contents kept at {})", aside.display())
                        } else {
                            String::new()
                        }
                    );
                    OutboxState::default()
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => OutboxState::default(),
            Err(e) => return Err(e),
        };
        Ok(Self { path, state })
    }

    /// Drop events the backend would reject as too old. Returns how many went.
    pub fn trim_expired(&mut self, now: i64) -> usize {
        let before = self.state.pending.len();
        self.state.pending.retain(|e| now - e.ts < MAX_EVENT_AGE_MS);
        before - self.state.pending.len()
    }

    pub fn pending_len(&self) -> usize {
        self.state.pending.len()
    }

    pub fn set_machine(&mut self, m: MachineDescriptor) -> std::io::Result<()> {
        self.state.machine = Some(m);
        self.persist()
    }

    pub fn append(&mut self, events: &[ActivityEvent]) -> std::io::Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        self.state.pending.extend_from_slice(events);
        self.persist()
    }

    /// The next chunk to send (empty pending → None). Includes the machine
    /// descriptor on every batch until first successfully sent, then drops it.
    ///
    /// Capped at `MAX_BATCH_EVENTS` so a long backlog drains across several
    /// acknowledged batches rather than being attempted as one oversized
    /// request that can never succeed.
    pub fn next_batch(&self) -> Option<EventBatch> {
        if self.state.pending.is_empty() {
            return None;
        }
        let n = self.state.pending.len().min(MAX_BATCH_EVENTS);
        Some(EventBatch {
            batch_seq: self.state.next_seq,
            events: self.state.pending[..n].to_vec(),
            machine: self.state.machine.clone(),
        })
    }

    /// Mark the batch just sent acknowledged: drop exactly the events it carried
    /// and advance the sequence, so the next chunk gets its own `batch_seq` and
    /// the backend's existing dedup keeps working.
    pub fn ack(&mut self) -> std::io::Result<()> {
        let n = self.state.pending.len().min(MAX_BATCH_EVENTS);
        self.state.pending.drain(..n);
        self.state.next_seq += 1;
        self.state.machine = None;
        self.persist()
    }

    /// Write via a temp file and rename. A plain write can be interrupted
    /// mid-flight and leave truncated JSON; rename within a directory is atomic,
    /// so a reader sees either the old file or the new one and never a torn one.
    fn persist(&self) -> std::io::Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text = serde_json::to_string(&self.state)?;
        let tmp = self.path.with_extension("tmp");
        std::fs::write(&tmp, text)?;
        std::fs::rename(&tmp, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flexitracker_core::EventKind;

    fn tmp() -> PathBuf {
        tmp_named("default")
    }
    fn tmp_named(tag: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("flexi-outbox-{}-{tag}.json", std::process::id()));
        let _ = std::fs::remove_file(&p);
        p
    }
    fn ev_at(ts: i64) -> ActivityEvent {
        ActivityEvent {
            ts,
            kind: EventKind::Heartbeat,
        }
    }

    #[test]
    fn buffers_persists_and_acks() {
        let path = tmp();
        {
            let mut ob = Outbox::open(path.clone()).unwrap();
            ob.append(&[ActivityEvent {
                ts: 1,
                kind: EventKind::Active,
            }])
            .unwrap();
            ob.append(&[ActivityEvent {
                ts: 2,
                kind: EventKind::Idle,
            }])
            .unwrap();
            assert_eq!(ob.pending_len(), 2);
        }
        // Reopen: pending survived the "restart".
        let mut ob = Outbox::open(path.clone()).unwrap();
        assert_eq!(ob.pending_len(), 2);
        let batch = ob.next_batch().unwrap();
        assert_eq!(batch.batch_seq, 0);
        assert_eq!(batch.events.len(), 2);
        ob.ack().unwrap();
        assert_eq!(ob.pending_len(), 0);
        assert!(ob.next_batch().is_none());

        // Next batch uses the incremented sequence.
        ob.append(&[ActivityEvent {
            ts: 3,
            kind: EventKind::Active,
        }])
        .unwrap();
        assert_eq!(ob.next_batch().unwrap().batch_seq, 1);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn a_torn_file_does_not_strand_the_daemon() {
        // Refusing to start would hold the buffered events hostage AND stop new
        // capture. The file is moved aside, not destroyed.
        let path = tmp_named("torn");
        std::fs::write(&path, r#"{"next_seq":3,"pending":[{"ts":1,"ki"#).unwrap();
        let ob = Outbox::open(path.clone()).expect("must start despite a torn file");
        assert_eq!(ob.pending_len(), 0);
        let aside = path.with_extension("corrupt");
        assert!(aside.exists(), "previous contents must remain recoverable");
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(&aside).ok();
    }

    #[test]
    fn trims_only_events_older_than_the_edit_window() {
        let path = tmp_named("trim");
        let mut ob = Outbox::open(path.clone()).unwrap();
        let now = 200 * 86_400_000i64;
        ob.append(&[
            ev_at(now - 150 * 86_400_000), // beyond the window: useless on arrival
            ev_at(now - 10 * 86_400_000),  // still acceptable
            ev_at(now),
        ])
        .unwrap();
        assert_eq!(ob.trim_expired(now), 1);
        assert_eq!(ob.pending_len(), 2);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn a_backlog_drains_across_several_acknowledged_chunks() {
        // The whole queue used to go as one request; past the ingest limit that
        // could never succeed, wedging the queue exactly when it mattered most.
        let path = tmp_named("chunk");
        let mut ob = Outbox::open(path.clone()).unwrap();
        let total = MAX_BATCH_EVENTS + 500;
        let events: Vec<_> = (0..total).map(|i| ev_at(i as i64)).collect();
        ob.append(&events).unwrap();

        let first = ob.next_batch().unwrap();
        assert_eq!(first.events.len(), MAX_BATCH_EVENTS, "chunk is capped");
        assert_eq!(first.batch_seq, 0);
        ob.ack().unwrap();
        assert_eq!(ob.pending_len(), 500, "ack drops only what it sent");

        let second = ob.next_batch().unwrap();
        assert_eq!(second.events.len(), 500);
        assert_eq!(second.batch_seq, 1, "each chunk carries its own seq");
        assert_eq!(
            second.events[0].ts, MAX_BATCH_EVENTS as i64,
            "resumes in order"
        );
        ob.ack().unwrap();
        assert!(ob.next_batch().is_none());
        std::fs::remove_file(&path).ok();
    }
}
