import logging

import pytest

from flexitracker import cli as cli_mod
from flexitracker.cli import log_events, parse_args, run
from flexitracker.config import Config
from flexitracker.login import LoginError


def test_configure_is_no_longer_a_recognized_command():
    with pytest.raises(ValueError, match="unknown argument: configure"):
        parse_args(["configure"])


def test_login_with_key_writes_config_without_a_browser(tmp_path, monkeypatch):
    called = []
    monkeypatch.setattr(cli_mod, "browser_login", lambda *a, **k: called.append(1) or ("AK", "MID"))
    monkeypatch.setattr(cli_mod, "self_test", lambda cfg: 0)
    config_path = tmp_path / "config.toml"
    rc = run(
        [
            "login",
            "--key",
            "PASTED-KEY",
            "--backend-url",
            "https://backend.example",
            "--config",
            str(config_path),
        ]
    )
    assert rc == 0
    assert called == []  # the browser flow was never invoked
    saved = Config.load(config_path)
    assert saved.access_key == "PASTED-KEY"
    assert saved.backend_url == "https://backend.example"


def test_login_browser_flow_writes_config_and_runs_self_test(tmp_path, monkeypatch):
    monkeypatch.setattr(cli_mod, "browser_login", lambda backend_url, label: ("BROWSER-KEY", "BROWSER-MID"))
    ran_self_test = []
    monkeypatch.setattr(cli_mod, "self_test", lambda cfg: ran_self_test.append(cfg.access_key) or 0)
    config_path = tmp_path / "config.toml"
    rc = run(["login", "--backend-url", "https://backend.example", "--config", str(config_path)])
    assert rc == 0
    assert ran_self_test == ["BROWSER-KEY"]
    saved = Config.load(config_path)
    assert saved.access_key == "BROWSER-KEY"
    assert saved.machine_id == "BROWSER-MID"


def test_login_name_flag_is_passed_as_the_label(tmp_path, monkeypatch):
    seen = []

    def fake_browser_login(backend_url, label):
        seen.append(label)
        return "K", "M"

    monkeypatch.setattr(cli_mod, "browser_login", fake_browser_login)
    monkeypatch.setattr(cli_mod, "self_test", lambda cfg: 0)
    config_path = tmp_path / "config.toml"
    run(
        [
            "login",
            "--name",
            "Work laptop",
            "--backend-url",
            "https://backend.example",
            "--config",
            str(config_path),
        ]
    )
    assert seen == ["Work laptop"]


def test_login_browser_failure_writes_no_config(tmp_path, monkeypatch):
    def boom(*a, **k):
        raise LoginError("timed out after 180s waiting for browser approval")

    monkeypatch.setattr(cli_mod, "browser_login", boom)
    config_path = tmp_path / "config.toml"
    rc = run(["login", "--backend-url", "https://backend.example", "--config", str(config_path)])
    assert rc == 1
    assert not config_path.exists()


def test_log_events_logs_spans_at_info_and_heartbeat_at_debug(caplog):
    events = [
        {"ts": 1000, "kind": "active"},
        {"ts": 2000, "kind": "heartbeat"},
        {"ts": 3000, "kind": "idle"},
    ]
    with caplog.at_level(logging.DEBUG, logger="flexitracker"):
        log_events(events)
    info_messages = [r.message for r in caplog.records if r.levelno == logging.INFO]
    debug_messages = [r.message for r in caplog.records if r.levelno == logging.DEBUG]
    assert any("active" in m for m in info_messages)
    assert any("idle" in m for m in info_messages)
    assert any("heartbeat" in m for m in debug_messages)
    assert not any("heartbeat" in m for m in info_messages)
