"""Daemon config file — mirror of `config.rs`.

`{backend_url, access_key, account_id?, machine_id?, thresholds}` stored as TOML
with 0600 permissions. Thresholds are refreshed from the backend on startup,
falling back to these cached/default values when offline.

Read uses stdlib `tomllib`; write uses a tiny local emitter (the schema is fixed
and small, so no third-party TOML writer is pulled in).
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .state_machine import Thresholds


@dataclass
class ThresholdCfg:
    poll_sec: int = 15
    min_inactivity_sec: int = 600
    min_activity_sec: int = 30
    heartbeat_sec: int = 300

    def to_thresholds(self) -> Thresholds:
        return Thresholds(
            poll_ms=self.poll_sec * 1000,
            min_inactivity_ms=self.min_inactivity_sec * 1000,
            min_activity_ms=self.min_activity_sec * 1000,
            heartbeat_ms=self.heartbeat_sec * 1000,
        )


@dataclass
class Config:
    backend_url: str = ""
    access_key: str = ""
    account_id: Optional[str] = None
    machine_id: Optional[str] = None
    thresholds: ThresholdCfg = field(default_factory=ThresholdCfg)

    @staticmethod
    def default_path() -> Path:
        override = os.environ.get("FLEXITRACKER_CONFIG")
        if override:
            return Path(override)
        base = os.environ.get("HOME") or os.environ.get("APPDATA") or "."
        return Path(base) / ".config" / "flexitracker" / "config.toml"

    @classmethod
    def load(cls, path: Path) -> "Config":
        with open(path, "rb") as fh:
            data = tomllib.load(fh)
        th = data.get("thresholds", {})
        return cls(
            backend_url=data.get("backend_url", ""),
            access_key=data.get("access_key", ""),
            account_id=data.get("account_id"),
            machine_id=data.get("machine_id"),
            thresholds=ThresholdCfg(
                poll_sec=th.get("poll_sec", 15),
                min_inactivity_sec=th.get("min_inactivity_sec", 600),
                min_activity_sec=th.get("min_activity_sec", 30),
                heartbeat_sec=th.get("heartbeat_sec", 300),
            ),
        )

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self._to_toml(), encoding="utf-8")
        _restrict_permissions(path)

    def _to_toml(self) -> str:
        lines = [
            f'backend_url = "{_esc(self.backend_url)}"',
            f'access_key = "{_esc(self.access_key)}"',
        ]
        if self.account_id is not None:
            lines.append(f'account_id = "{_esc(self.account_id)}"')
        if self.machine_id is not None:
            lines.append(f'machine_id = "{_esc(self.machine_id)}"')
        lines += [
            "",
            "[thresholds]",
            f"poll_sec = {self.thresholds.poll_sec}",
            f"min_inactivity_sec = {self.thresholds.min_inactivity_sec}",
            f"min_activity_sec = {self.thresholds.min_activity_sec}",
            f"heartbeat_sec = {self.thresholds.heartbeat_sec}",
            "",
        ]
        return "\n".join(lines)


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def _restrict_permissions(path: Path) -> None:
    # No-op on Windows (POSIX modes do not apply); mirror the Rust cfg(unix) gate.
    if os.name == "posix":
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
