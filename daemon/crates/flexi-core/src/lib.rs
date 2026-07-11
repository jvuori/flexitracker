//! Shared types for flexi-worker-cloud.
//!
//! The wire schema mirrors `docs/wire-schema.md` and `backend/src/schema.ts`.
//! Keep all three in sync — any change here must be applied to the others.

use serde::{Deserialize, Serialize};

/// Presence and session-state transitions plus periodic liveness.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventKind {
    Active,
    Idle,
    Lock,
    Unlock,
    Login,
    Logout,
    Heartbeat,
}

/// A single back-dated activity event. `ts` is unix epoch milliseconds
/// (daemon clock); the backend records its own `received_at`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivityEvent {
    pub ts: i64,
    pub kind: EventKind,
}

/// Machine descriptor, sent on first contact or when it changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MachineDescriptor {
    pub hostname: String,
    pub os: String,
}

/// The `POST /ingest` request body. The access key travels in the
/// `Authorization` header, not here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventBatch {
    /// Monotonic per-machine sequence for idempotent deduplication.
    pub batch_seq: u64,
    /// Events ordered by `ts` ascending.
    pub events: Vec<ActivityEvent>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub machine: Option<MachineDescriptor>,
}

/// The `POST /ingest` response body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IngestAck {
    pub ok: bool,
    pub batch_seq: u64,
    pub duplicate: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_kind_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&EventKind::Heartbeat).unwrap(),
            "\"heartbeat\""
        );
    }

    #[test]
    fn batch_round_trips_and_omits_absent_machine() {
        let batch = EventBatch {
            batch_seq: 42,
            events: vec![ActivityEvent {
                ts: 1_731_412_800_000,
                kind: EventKind::Active,
            }],
            machine: None,
        };
        let json = serde_json::to_string(&batch).unwrap();
        assert!(!json.contains("machine"), "absent machine must be omitted");

        let back: EventBatch = serde_json::from_str(&json).unwrap();
        assert_eq!(batch, back);
    }
}
