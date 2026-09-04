from flexitracker.idle import (
    Sample,
    SimulatedIdle,
    _locked_from_session_flags,
    _parse_locked_hint,
)


def test_simulated_replays_then_reports_idle():
    s = SimulatedIdle([Sample(0, False), Sample(5000, False)])
    assert s.sample().idle_ms == 0
    assert s.sample().idle_ms == 5000
    # Exhausted -> very idle (matches the Rust i64::MAX sentinel).
    assert s.sample().idle_ms == 2**63 - 1


def test_parse_locked_hint_yes():
    assert _parse_locked_hint(0, "yes\n") is True


def test_parse_locked_hint_no():
    assert _parse_locked_hint(0, "no\n") is False


def test_parse_locked_hint_nonzero_exit_is_unknown():
    assert _parse_locked_hint(1, "") is None


def test_parse_locked_hint_unexpected_value_is_unknown():
    assert _parse_locked_hint(0, "maybe") is None


def test_locked_from_session_flags_lock():
    assert _locked_from_session_flags(level=1, session_flags=0) is True


def test_locked_from_session_flags_unlock():
    assert _locked_from_session_flags(level=1, session_flags=1) is False


def test_locked_from_session_flags_unknown_flag_value():
    assert _locked_from_session_flags(level=1, session_flags=-1) is None


def test_locked_from_session_flags_unrecognized_level():
    assert _locked_from_session_flags(level=0, session_flags=0) is None
