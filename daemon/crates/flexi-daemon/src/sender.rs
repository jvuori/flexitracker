//! Thin HTTP client to the backend: post a batch, fetch daemon thresholds.

use flexi_core::EventBatch;
use serde::Deserialize;

use crate::config::ThresholdCfg;

#[derive(Deserialize)]
struct ConfigResponse {
    #[serde(rename = "minInactivitySec")]
    min_inactivity_sec: i64,
    #[serde(rename = "minActivitySec")]
    min_activity_sec: i64,
    #[serde(rename = "heartbeatSec")]
    heartbeat_sec: i64,
}

fn ingest_url(base: &str) -> String {
    format!("{}/ingest", base.trim_end_matches('/'))
}

/// Post a batch. 2xx (including a duplicate ack) is success; anything else keeps
/// the batch queued for retry.
pub fn post_batch(base: &str, key: &str, batch: &EventBatch) -> Result<(), String> {
    match ureq::post(&ingest_url(base))
        .set("authorization", &format!("Bearer {key}"))
        .send_json(batch)
    {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, _)) => Err(format!("server returned {code}")),
        Err(e) => Err(e.to_string()),
    }
}

/// Fetch current thresholds from the backend (keeps the caller's poll interval).
pub fn fetch_thresholds(base: &str, key: &str, poll_sec: i64) -> Result<ThresholdCfg, String> {
    let url = format!("{}/config", base.trim_end_matches('/'));
    let resp = ureq::get(&url)
        .set("authorization", &format!("Bearer {key}"))
        .call()
        .map_err(|e| e.to_string())?;
    let c: ConfigResponse = resp.into_json().map_err(|e| e.to_string())?;
    Ok(ThresholdCfg {
        poll_sec,
        min_inactivity_sec: c.min_inactivity_sec,
        min_activity_sec: c.min_activity_sec,
        heartbeat_sec: c.heartbeat_sec,
    })
}
