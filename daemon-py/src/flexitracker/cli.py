"""CLI + daemon loop.

Fail-fast: unexpected conditions exit with a clear message rather than being
silently absorbed. Subcommands: `login` (authorize + self-test, browser by
default or `--key` for headless/scripted setups), `test` (connectivity check,
sends no data), and the default daemon run.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import sys
import time
from pathlib import Path
from typing import Optional

from ._backend import default_backend_url
from .config import Config
from .core import EventKind, machine_descriptor
from .idle import Sample, platform_source
from .logging_setup import LOGGER_NAME, configure_logging
from .login import LoginError, browser_login
from .outbox import Outbox
from .sender import SenderError, fetch_thresholds, post_batch, whoami
from .state_machine import Persisted, StateMachine, Tick
from .version import get_version

logger = logging.getLogger(LOGGER_NAME)

HELP = """flexitracker — activity tracking daemon

USAGE:
    flexitracker login [--name LABEL] [--backend-url URL]    Authorize this machine (opens a browser)
    flexitracker login --key KEY [--backend-url URL]         Authorize with a pasted key (no browser)
    flexitracker test                                        Check connectivity (sends no data)
    flexitracker [OPTIONS]                                   Run the daemon

OPTIONS:
    --key, --account-key KEY   Per-machine access key for `login --key` (saved to config)
    --name LABEL        Machine label for the browser `login` flow (default: hostname)
    --backend-url URL   Backend base URL (defaults to the built-in one)
    --config PATH       Config file path (default: ~/.config/flexitracker/config.toml)
    --simulate          Post a synthetic day through the real pipeline and exit
    --once              Take a single reading, flush, and exit
    --check             Alias for `test`
    -V, --version       Print version
    -h, --help          Print this help"""


def now_ms() -> int:
    return int(time.time() * 1000)


def _os_name() -> str:
    # Match the Rust std::env::consts::OS values used on the wire.
    return {"linux": "linux", "win32": "windows", "darwin": "macos"}.get(
        sys.platform, sys.platform
    )


def machine_desc() -> dict:
    hostname = os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or socket.gethostname() or "unknown"
    return machine_descriptor(hostname, _os_name())


class Args:
    def __init__(self) -> None:
        self.cmd = "daemon"  # daemon | login | test
        self.account_key: Optional[str] = None
        self.name: Optional[str] = None
        self.backend_url: Optional[str] = None
        self.config_path: Optional[Path] = None
        self.simulate = False
        self.once = False


def parse_args(argv: list) -> Args:
    a = Args()
    it = iter(argv)

    def take(flag: str) -> str:
        try:
            return next(it)
        except StopIteration:
            raise ValueError(f"{flag} requires a value")

    for arg in it:
        if arg == "login":
            a.cmd = "login"
        elif arg in ("test", "--check"):
            a.cmd = "test"
        elif arg in ("--account-key", "--key"):
            a.account_key = take(arg)
        elif arg == "--name":
            a.name = take(arg)
        elif arg == "--backend-url":
            a.backend_url = take(arg)
        elif arg == "--config":
            a.config_path = Path(take(arg))
        elif arg == "--simulate":
            a.simulate = True
        elif arg == "--once":
            a.once = True
        elif arg in ("--version", "-V"):
            print(f"flexitracker {get_version()}")
            sys.exit(0)
        elif arg in ("--help", "-h"):
            print(HELP)
            sys.exit(0)
        else:
            raise ValueError(f"unknown argument: {arg}")
    return a


def self_test(cfg: Config) -> int:
    print(f"Contacting {cfg.backend_url} …")
    try:
        w = whoami(cfg.backend_url, cfg.access_key)
    except SenderError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print("  ✓ Reachable")
    print(f"  ✓ Key valid — account: {w.email}")
    if w.machine_label:
        print(f'  ✓ This machine: "{w.machine_label}"')
    if w.active:
        print("  ✓ Account active — no activity data was sent.")
        return 0
    print(f"error: account is {w.status} — not active yet (nothing was sent)", file=sys.stderr)
    return 1


def flush(cfg: Config, ob: Outbox) -> None:
    batch = ob.next_batch()
    if batch is None:
        return
    try:
        post_batch(cfg.backend_url, cfg.access_key, batch)
        ob.ack()
    except SenderError as e:
        logger.warning("flush deferred (%d pending): %s", ob.pending_len(), e)


def log_events(events: list) -> None:
    """INFO for a work/idle span start or end; DEBUG for a heartbeat, so a
    default-level log stays small no matter how long the daemon runs."""
    for e in events:
        if e["kind"] == EventKind.HEARTBEAT:
            logger.debug("heartbeat ts=%s", e["ts"])
        else:
            logger.info("%s ts=%s", e["kind"], e["ts"])


def load_state(path: Path) -> Optional[Persisted]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return Persisted(
        reported_state=data.get("reported_state", "Idle"),
        last_active_time=data.get("last_active_time"),
        last_heartbeat=data.get("last_heartbeat"),
        pending_active_since=data.get("pending_active_since"),
        last_emitted_ts=data.get("last_emitted_ts"),
        last_seen_wall=data.get("last_seen_wall"),
    )


def save_state(path: Path, p: Persisted) -> None:
    # Temp + rename: this file is the sole basis for reconstructing the end of a
    # span after an ungraceful shutdown, so a torn write would corrupt exactly
    # the record that exists to survive one.
    data = {
        "reported_state": p.reported_state,
        "last_active_time": p.last_active_time,
        "last_heartbeat": p.last_heartbeat,
        "pending_active_since": p.pending_active_since,
        "last_emitted_ts": p.last_emitted_ts,
        "last_seen_wall": p.last_seen_wall,
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data), encoding="utf-8")
    os.replace(tmp, path)


def simulate(cfg: Config, ob: Outbox) -> int:
    n = now_ms()
    day = n - (n % 86_400_000)
    h = 3_600_000
    events = [
        {"ts": day + 8 * h, "kind": "active"},
        {"ts": day + 10 * h, "kind": "idle"},
        {"ts": day + 13 * h, "kind": "active"},
        {"ts": day + 16 * h, "kind": "idle"},
    ]
    ob.append(events)
    try:
        post_batch(cfg.backend_url, cfg.access_key, ob.next_batch())
        ob.ack()
    except SenderError as e:
        print(f"error: simulate post failed: {e}", file=sys.stderr)
        return 1
    print(f"simulated day posted ({len(events)} events)")
    return 0


def run(argv: list) -> int:
    try:
        args = parse_args(argv)
    except ValueError as e:
        print(HELP)
        print(f"error: {e}", file=sys.stderr)
        return 1

    config_path = args.config_path or Config.default_path()

    try:
        cfg = Config.load(config_path)
    except Exception:  # noqa: BLE001 — any load failure falls back to a fresh config (mirrors the Rust `.ok().unwrap_or_else`)
        cfg = Config()

    if args.account_key:
        cfg.access_key = args.account_key
    if args.backend_url:
        cfg.backend_url = args.backend_url
    if not cfg.backend_url:
        cfg.backend_url = default_backend_url()

    if args.cmd == "login":
        if not cfg.backend_url:
            print("error: no backend url (pass --backend-url; releases have one built in)", file=sys.stderr)
            return 1
        if args.account_key:
            # Manual/headless form: cfg.access_key is already set above from
            # args.account_key. No browser involved.
            cfg.save(config_path)
            print(f"Saved config to {config_path}.")
            return self_test(cfg)
        # Default: browser-based device authorization. No key is ever entered
        # or displayed — a failure here leaves config untouched (nothing is
        # saved until browser_login returns successfully).
        label = args.name or machine_desc()["hostname"]
        try:
            access_key, machine_id = browser_login(cfg.backend_url, label)
        except LoginError as e:
            print(f"error: login failed: {e}", file=sys.stderr)
            return 1
        cfg.access_key = access_key
        cfg.machine_id = machine_id
        cfg.save(config_path)
        print(f"Saved config to {config_path}.")
        return self_test(cfg)

    if args.cmd == "test":
        if not cfg.access_key or not cfg.backend_url:
            print("error: not configured — run `flexitracker login` first", file=sys.stderr)
            return 1
        return self_test(cfg)

    # Daemon
    if not cfg.access_key or not cfg.backend_url:
        print("error: missing access key or backend url (run `flexitracker login`)", file=sys.stderr)
        return 1
    cfg.save(config_path)

    configure_logging(config_path)
    machine = machine_desc()
    logger.info(
        "flexitracker %s starting (backend=%s, config=%s)", get_version(), cfg.backend_url, config_path
    )
    logger.info("machine: hostname=%s os=%s", machine["hostname"], machine["os"])

    try:
        return _run_daemon(args, cfg, config_path, machine)
    except Exception:
        # No console to see a traceback on under the windowed/no-console build
        # — the rotating log file is the only place this can land.
        logger.exception("daemon loop crashed")
        return 1


def _run_daemon(args: Args, cfg: Config, config_path: Path, machine: dict) -> int:
    # Refresh thresholds; fall back to cached/defaults offline.
    try:
        cfg.thresholds = fetch_thresholds(cfg.backend_url, cfg.access_key, cfg.thresholds.poll_sec)
        cfg.save(config_path)
    except SenderError as e:
        logger.warning("using cached thresholds (%s)", e)
    thresholds = cfg.thresholds.to_thresholds()

    state_path = config_path.with_name("state.json")
    outbox_path = config_path.with_name("outbox.json")
    ob = Outbox.open(outbox_path)
    dropped = ob.trim_expired(now_ms())
    if dropped > 0:
        logger.warning("dropped %d outbox event(s) older than the backend edit window", dropped)
    ob.set_machine(machine)

    if args.simulate:
        return simulate(cfg, ob)

    persisted = load_state(state_path) or Persisted()
    sm = StateMachine(thresholds, persisted)

    recovered = sm.recover(now_ms())
    log_events(recovered)
    ob.append(recovered)
    save_state(state_path, sm.p)
    flush(cfg, ob)

    try:
        source = platform_source()
    except OSError as e:
        logger.error("idle source: %s", e)
        return 1

    last_mono: Optional[float] = None
    while True:
        s: Sample = source.sample()
        logger.debug("sample idle_ms=%s locked=%s", s.idle_ms, s.locked)
        mono_now = time.monotonic()
        mono_elapsed_ms = None if last_mono is None else int((mono_now - last_mono) * 1000)
        last_mono = mono_now
        events = sm.step(
            Tick(now=now_ms(), idle_ms=s.idle_ms, locked=s.locked, mono_elapsed_ms=mono_elapsed_ms)
        )
        log_events(events)
        ob.append(events)
        save_state(state_path, sm.p)
        flush(cfg, ob)
        if args.once:
            return 0
        time.sleep(thresholds.poll_ms / 1000)


def main(argv: Optional[list] = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    return run(argv)
