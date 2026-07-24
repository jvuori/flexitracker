"""Browser-based device-authorization login (the `login` command's default flow).

Loopback pattern (`gh auth login --web` / `wrangler login`): bind an ephemeral
listener on 127.0.0.1, open the backend's /device/authorize in the system
browser, and receive a one-time authorization code back over the loopback
redirect. The code is then exchanged for the access key at /device/token — the
key itself never appears in a URL, not even a loopback one.
"""

from __future__ import annotations

import http.server
import secrets
import threading
import webbrowser
from typing import Callable, Optional
from urllib.parse import parse_qs, urlencode, urlparse

from . import sender

LOGIN_TIMEOUT_SEC = 180


class LoginError(Exception):
    pass


class _Result:
    def __init__(self) -> None:
        self.code: Optional[str] = None
        self.error: Optional[str] = None


def _handler_factory(result: _Result, expected_state: str, done: threading.Event):
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 (stdlib-mandated method name)
            qs = parse_qs(urlparse(self.path).query)
            state = (qs.get("state") or [None])[0]
            code = (qs.get("code") or [None])[0]
            if state != expected_state:
                result.error = "callback state mismatch"
            elif not code:
                result.error = "no authorization code in callback"
            else:
                result.code = code
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            msg = (
                "Authorization failed — you can close this tab."
                if result.error
                else "FlexiTracker authorized — you can close this tab."
            )
            self.wfile.write(msg.encode("utf-8"))
            done.set()

        def log_message(self, *args) -> None:  # silence default stderr request logging
            pass

    return Handler


def browser_login(
    backend_url: str,
    label: str,
    *,
    open_browser: Callable[[str], bool] = webbrowser.open,
    timeout_sec: int = LOGIN_TIMEOUT_SEC,
) -> tuple[str, str]:
    """Run the loopback authorization handshake. Returns (access_key, machine_id).

    Raises LoginError on timeout, a state mismatch, a missing/failed callback,
    or a bad token exchange — in every failure case, no config has been
    written (the caller only writes config on a successful return).
    """
    state = secrets.token_urlsafe(24)
    result = _Result()
    done = threading.Event()
    server = http.server.HTTPServer(("127.0.0.1", 0), _handler_factory(result, state, done))
    port = server.server_address[1]
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()

    url = (
        f"{backend_url.rstrip('/')}/device/authorize?"
        + urlencode({"label": label, "cb": f"127.0.0.1:{port}", "state": state})
    )
    print(f"Opening browser to authorize: {url}")
    if not open_browser(url):
        print("Could not open a browser automatically — open this URL manually:")
        print(url)

    finished = done.wait(timeout_sec)
    server.server_close()
    if not finished:
        raise LoginError(f"timed out after {timeout_sec}s waiting for browser approval")
    if result.error:
        raise LoginError(result.error)
    assert result.code is not None  # error is always set above when code is falsy

    data = sender.device_token(backend_url, result.code)
    access_key = data.get("access_key")
    machine_id = data.get("machine_id")
    if not access_key or not machine_id:
        raise LoginError("malformed token response from backend")
    return access_key, machine_id
