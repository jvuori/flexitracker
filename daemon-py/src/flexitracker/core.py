"""Shared wire types — mirrors `flexitracker-core/src/lib.rs` and
`docs/wire-schema.md`. Keep all in sync; the conformance harness proves it.

Events are represented as plain dicts ``{"ts": int, "kind": str}`` so their JSON
form is exactly the wire form. `kind` is one of the lowercase EventKind values.
"""

from __future__ import annotations


class EventKind:
    """The `kind` field values (serialize lowercase, per the wire schema)."""

    ACTIVE = "active"
    IDLE = "idle"
    LOCK = "lock"
    UNLOCK = "unlock"
    LOGIN = "login"
    LOGOUT = "logout"
    HEARTBEAT = "heartbeat"


def event(ts: int, kind: str) -> dict:
    """A single back-dated activity event. `ts` is unix epoch milliseconds."""
    return {"ts": ts, "kind": kind}


def machine_descriptor(hostname: str, os_name: str) -> dict:
    return {"hostname": hostname, "os": os_name}
