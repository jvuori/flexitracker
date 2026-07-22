import os
import stat

from flexitracker.config import Config, ThresholdCfg


def test_round_trip_and_defaults(tmp_path):
    path = tmp_path / "config.toml"
    cfg = Config(backend_url="https://x.example", access_key="KEY", account_id="acc-1")
    cfg.save(path)
    back = Config.load(path)
    assert back.backend_url == "https://x.example"
    assert back.access_key == "KEY"
    assert back.account_id == "acc-1"
    assert back.machine_id is None
    assert back.thresholds.poll_sec == 15
    assert back.thresholds.min_inactivity_sec == 600


def test_absent_optionals_are_omitted(tmp_path):
    path = tmp_path / "config.toml"
    Config(backend_url="u", access_key="k").save(path)
    text = path.read_text()
    assert "account_id" not in text
    assert "machine_id" not in text
    assert "[thresholds]" in text


def test_permissions_restricted_on_posix(tmp_path):
    if os.name != "posix":
        return
    path = tmp_path / "config.toml"
    Config(backend_url="u", access_key="k").save(path)
    mode = stat.S_IMODE(path.stat().st_mode)
    assert mode == 0o600


def test_thresholds_to_ms():
    t = ThresholdCfg().to_thresholds()
    assert t.poll_ms == 15_000
    assert t.min_inactivity_ms == 600_000
    assert t.min_activity_ms == 30_000
    assert t.heartbeat_ms == 300_000
