"""Thin HTTP client to the backend — mirror of `sender.rs`.

Post a batch, fetch thresholds, and the read-only whoami self-test. Uses stdlib
`urllib` so no HTTP dependency is pulled in. The wire form is exactly the schema
in `docs/wire-schema.md`; the black-box harness proves it matches the reference.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional

from .config import ThresholdCfg


class SenderError(Exception):
    pass


def _request(url: str, key: str, method: str, body: Optional[dict]) -> dict:
    data = None
    headers = {"authorization": f"Bearer {key}"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["content-type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:  # noqa: S310 (fixed backend URL)
        raw = resp.read()
    return json.loads(raw) if raw else {}


def _ingest_url(base: str) -> str:
    return f"{base.rstrip('/')}/ingest"


def post_batch(base: str, key: str, batch: dict) -> None:
    """Post a batch. 2xx (including a duplicate ack) is success; anything else
    raises so the caller keeps the batch queued for retry.

    `machine` is omitted from the body when absent (never sent as null), per the
    wire schema.
    """
    body = {"batch_seq": batch["batch_seq"], "events": batch["events"]}
    if batch.get("machine") is not None:
        body["machine"] = batch["machine"]
    try:
        _request(_ingest_url(base), key, "POST", body)
    except urllib.error.HTTPError as e:
        raise SenderError(f"server returned {e.code}") from e
    except urllib.error.URLError as e:
        raise SenderError(str(e.reason)) from e


@dataclass
class WhoAmI:
    email: str
    machine_label: Optional[str]
    status: str
    active: bool


def whoami(base: str, key: str) -> WhoAmI:
    """Read-only account echo for the self-test. Sends/stores no activity data."""
    url = f"{base.rstrip('/')}/whoami"
    try:
        data = _request(url, key, "GET", None)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise SenderError("key rejected (401)") from e
        raise SenderError(f"server returned {e.code}") from e
    except urllib.error.URLError as e:
        raise SenderError(str(e.reason)) from e
    return WhoAmI(
        email=data["email"],
        machine_label=data.get("machineLabel"),
        status=data["status"],
        active=data["active"],
    )


def fetch_thresholds(base: str, key: str, poll_sec: int) -> ThresholdCfg:
    """Fetch current thresholds from the backend (keeps the caller's poll)."""
    url = f"{base.rstrip('/')}/config"
    try:
        data = _request(url, key, "GET", None)
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        reason = getattr(e, "code", None) or getattr(e, "reason", e)
        raise SenderError(str(reason)) from e
    return ThresholdCfg(
        poll_sec=poll_sec,
        min_inactivity_sec=data["minInactivitySec"],
        min_activity_sec=data["minActivitySec"],
        heartbeat_sec=data["heartbeatSec"],
    )
