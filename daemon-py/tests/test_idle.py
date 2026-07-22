from flexitracker.idle import Sample, SimulatedIdle


def test_simulated_replays_then_reports_idle():
    s = SimulatedIdle([Sample(0, False), Sample(5000, False)])
    assert s.sample().idle_ms == 0
    assert s.sample().idle_ms == 5000
    # Exhausted -> very idle (matches the Rust i64::MAX sentinel).
    assert s.sample().idle_ms == 2**63 - 1
