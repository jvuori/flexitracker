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

/// Read-only account echo for the connectivity self-test. Hits `GET /whoami`,
/// which sends/stores no activity data — it only proves the key resolves and
/// reports the bound account + machine.
#[derive(Deserialize)]
pub struct WhoAmI {
    pub email: String,
    #[serde(rename = "machineLabel")]
    pub machine_label: Option<String>,
    pub status: String,
    pub active: bool,
}

pub fn whoami(base: &str, key: &str) -> Result<WhoAmI, String> {
    let url = format!("{}/whoami", base.trim_end_matches('/'));
    match ureq::get(&url)
        .set("authorization", &format!("Bearer {key}"))
        .call()
    {
        Ok(resp) => resp.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(401, _)) => Err("key rejected (401)".into()),
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
