//! Durable local outbox. Events are buffered to disk so nothing is lost while
//! offline; the whole queue is flushed on reconnect, and a monotonic `batch_seq`
//! lets the backend deduplicate re-sent batches (activity-daemon spec).

use flexi_core::{ActivityEvent, EventBatch, MachineDescriptor};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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

impl Outbox {
    pub fn open(path: PathBuf) -> std::io::Result<Self> {
        let state = match std::fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => OutboxState::default(),
            Err(e) => return Err(e),
        };
        Ok(Self { path, state })
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

    /// The batch to send (empty pending → None). Includes the machine descriptor
    /// on every batch until first successfully sent, then drops it.
    pub fn next_batch(&self) -> Option<EventBatch> {
        if self.state.pending.is_empty() {
            return None;
        }
        Some(EventBatch {
            batch_seq: self.state.next_seq,
            events: self.state.pending.clone(),
            machine: self.state.machine.clone(),
        })
    }

    /// Mark the current batch acknowledged: clear it and advance the sequence.
    pub fn ack(&mut self) -> std::io::Result<()> {
        self.state.pending.clear();
        self.state.next_seq += 1;
        self.state.machine = None;
        self.persist()
    }

    fn persist(&self) -> std::io::Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text = serde_json::to_string(&self.state)?;
        std::fs::write(&self.path, text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flexi_core::EventKind;

    fn tmp() -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("flexi-outbox-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&p);
        p
    }

    #[test]
    fn buffers_persists_and_acks() {
        let path = tmp();
        {
            let mut ob = Outbox::open(path.clone()).unwrap();
            ob.append(&[ActivityEvent { ts: 1, kind: EventKind::Active }]).unwrap();
            ob.append(&[ActivityEvent { ts: 2, kind: EventKind::Idle }]).unwrap();
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
        ob.append(&[ActivityEvent { ts: 3, kind: EventKind::Active }]).unwrap();
        assert_eq!(ob.next_batch().unwrap().batch_seq, 1);
        std::fs::remove_file(&path).ok();
    }
}
