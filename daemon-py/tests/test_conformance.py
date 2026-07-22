"""Behavioural regression tests: the 24 hand-verified vectors, run through the
real state machine.

These began as the language-neutral conformance vectors that validated the
Python port against the Rust reference. Rust is gone; the vectors remain as the
daemon's own oracle for the trickiest behaviour — back-dating exactness, suspend
reconciliation, the emit watermark, the return-to-work clock. Each vector is one
`vectors/*.json` file (see the format at the top of a vector).
"""

from __future__ import annotations

import json
import pathlib

import pytest

from flexitracker.state_machine import Persisted, StateMachine, Thresholds, Tick

VECTORS = sorted((pathlib.Path(__file__).parent / "vectors").glob("*.json"))

_PATCH_FIELDS = (
    "reported_state",
    "last_active_time",
    "last_heartbeat",
    "pending_active_since",
    "last_emitted_ts",
    "last_seen_wall",
)


def _apply_patch(p: Persisted, patch: dict) -> None:
    for field in _PATCH_FIELDS:
        if field in patch:
            setattr(p, field, patch[field])


def _run(spec: dict):
    th = spec.get("thresholds")
    thresholds = Thresholds(**th) if th else Thresholds()
    p = Persisted()
    _apply_patch(p, spec.get("initial", {}))
    sm = StateMachine(thresholds, p)

    events: list = []
    for step in spec["steps"]:
        op = step["op"]
        if op == "tick":
            events.extend(
                sm.step(
                    Tick(
                        now=step["now"],
                        idle_ms=step["idle_ms"],
                        locked=step.get("locked", False),
                        mono_elapsed_ms=step.get("mono_elapsed_ms"),
                    )
                )
            )
        elif op == "recover":
            events.extend(sm.recover(step["now"]))
        elif op == "patch":
            _apply_patch(sm.p, {k: v for k, v in step.items() if k != "op"})
        else:
            raise AssertionError(f"unknown op {op!r}")
    return events, sm.p


@pytest.mark.parametrize("path", VECTORS, ids=[p.stem for p in VECTORS])
def test_vector(path: pathlib.Path):
    spec = json.loads(path.read_text())
    events, final = _run(spec)

    got = [(e["kind"], e["ts"]) for e in events]
    expected = [(e["kind"], e["ts"]) for e in spec.get("expected", [])]
    assert got == expected, f"{path.name}: events\n  expected {expected}\n  got      {got}"

    for key, want in spec.get("expected_final", {}).items():
        assert getattr(final, key) == want, f"{path.name}: final.{key} != {want!r}"


def test_vectors_present():
    assert len(VECTORS) >= 24, "expected the full seed vector set"
