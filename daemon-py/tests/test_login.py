import threading
import urllib.request
from urllib.parse import parse_qs, urlparse

import pytest

from flexitracker import login as login_mod
from flexitracker.login import LoginError, browser_login


def _fake_open_browser(*, state_override=None, hit=True):
    """An open_browser stand-in that (optionally) hits the loopback callback
    URL embedded in the authorize URL it's given, from a background thread —
    mimicking the browser completing (or not completing) the approval."""

    def opener(url: str) -> bool:
        if not hit:
            return True  # pretend the browser opened, but the user never approves
        qs = parse_qs(urlparse(url).query)
        cb = qs["cb"][0]
        state = state_override if state_override is not None else qs["state"][0]
        callback_url = f"http://{cb}/?code=the-code&state={state}"

        def hit_callback() -> None:
            try:
                urllib.request.urlopen(callback_url, timeout=5)  # noqa: S310
            except OSError:
                pass

        threading.Thread(target=hit_callback, daemon=True).start()
        return True

    return opener


def test_successful_exchange_returns_key_and_machine_id(monkeypatch):
    monkeypatch.setattr(
        login_mod.sender,
        "device_token",
        lambda base, code: {"access_key": "AK", "machine_id": "MID"} if code == "the-code" else {},
    )
    access_key, machine_id = browser_login(
        "https://backend.example", "Work laptop", open_browser=_fake_open_browser(), timeout_sec=5
    )
    assert access_key == "AK"
    assert machine_id == "MID"


def test_state_mismatch_is_rejected(monkeypatch):
    exchanged = []
    monkeypatch.setattr(login_mod.sender, "device_token", lambda *a: exchanged.append(a) or {})
    with pytest.raises(LoginError, match="state mismatch"):
        browser_login(
            "https://backend.example",
            "Work laptop",
            open_browser=_fake_open_browser(state_override="wrong-state"),
            timeout_sec=5,
        )
    assert exchanged == []  # a rejected callback must never reach the token exchange


def test_timeout_raises_and_never_exchanges(monkeypatch):
    exchanged = []
    monkeypatch.setattr(login_mod.sender, "device_token", lambda *a: exchanged.append(a) or {})
    with pytest.raises(LoginError, match="timed out"):
        browser_login(
            "https://backend.example",
            "Work laptop",
            open_browser=_fake_open_browser(hit=False),
            timeout_sec=0.3,
        )
    assert exchanged == []


def test_malformed_token_response_raises(monkeypatch):
    monkeypatch.setattr(login_mod.sender, "device_token", lambda base, code: {})
    with pytest.raises(LoginError, match="malformed"):
        browser_login(
            "https://backend.example", "Work laptop", open_browser=_fake_open_browser(), timeout_sec=5
        )
