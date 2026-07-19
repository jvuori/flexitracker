//! Daemon config file: `{account_id, machine_id, access_key, cached settings}`,
//! stored TOML with restricted permissions. Thresholds are refreshed from the
//! backend on startup, falling back to these cached/default values when offline.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::state_machine::Thresholds;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdCfg {
    pub poll_sec: i64,
    pub min_inactivity_sec: i64,
    pub min_activity_sec: i64,
    pub heartbeat_sec: i64,
}

impl Default for ThresholdCfg {
    fn default() -> Self {
        Self {
            poll_sec: 15,
            min_inactivity_sec: 600,
            min_activity_sec: 30,
            heartbeat_sec: 300,
        }
    }
}

impl ThresholdCfg {
    pub fn to_thresholds(&self) -> Thresholds {
        Thresholds {
            poll_ms: self.poll_sec * 1000,
            min_inactivity_ms: self.min_inactivity_sec * 1000,
            min_activity_ms: self.min_activity_sec * 1000,
            heartbeat_ms: self.heartbeat_sec * 1000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub backend_url: String,
    pub access_key: String,
    #[serde(default)]
    pub account_id: Option<String>,
    #[serde(default)]
    pub machine_id: Option<String>,
    #[serde(default)]
    pub thresholds: ThresholdCfg,
}

impl Config {
    pub fn default_path() -> PathBuf {
        if let Ok(p) = std::env::var("FLEXITRACKER_CONFIG") {
            return PathBuf::from(p);
        }
        let base = std::env::var("HOME")
            .or_else(|_| std::env::var("APPDATA"))
            .unwrap_or_else(|_| ".".into());
        Path::new(&base)
            .join(".config")
            .join("flexitracker")
            .join("config.toml")
    }

    pub fn load(path: &Path) -> std::io::Result<Config> {
        let text = std::fs::read_to_string(path)?;
        toml::from_str(&text).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text = toml::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        std::fs::write(path, text)?;
        restrict_permissions(path);
        Ok(())
    }
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        perms.set_mode(0o600);
        let _ = std::fs::set_permissions(path, perms);
    }
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) {}
