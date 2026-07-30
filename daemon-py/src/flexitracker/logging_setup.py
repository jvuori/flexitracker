"""Rotating file logging for the background daemon loop.

Only the daemon loop uses this — `login`, `test`, `--version`, `--help`, and
`--simulate` stay on plain `print()`, since those are explicit, human-invoked,
foreground commands, not the silent background loop this exists for.

INFO records lifecycle events only (startup, the detected machine descriptor,
work/idle span start+end). Per-tick sampling and heartbeats are DEBUG-only, so
a default-level log stays small no matter how long the daemon runs. A
`StreamHandler` on `stderr` is added only when `stderr` is actually attached
(interactive `login`/`test`/foreground runs) — a `--windowed` frozen build has
no console, so `sys.stderr` is `None` there and must not be touched.
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import sys
from pathlib import Path
from typing import Optional

LOGGER_NAME = "flexitracker"

# ~8MB worst case (current + 3 backups) — generous for INFO-level lifecycle
# logging across many days, bounded enough to never become a disk concern.
MAX_BYTES = 2_000_000
BACKUP_COUNT = 3


def configure_logging(
    config_path: Path,
    level: Optional[str] = None,
    max_bytes: int = MAX_BYTES,
    backup_count: int = BACKUP_COUNT,
) -> logging.Logger:
    """Attach a rotating file handler (plus an optional stderr mirror) to the
    module logger. Idempotent: a second call is a no-op so re-entrant daemon
    code paths and tests can call it freely."""
    logger = logging.getLogger(LOGGER_NAME)
    if logger.handlers:
        return logger

    resolved_level = (level or os.environ.get("FLEXITRACKER_LOG_LEVEL") or "INFO").upper()
    logger.setLevel(resolved_level)

    log_path = config_path.with_name("flexitracker.log")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(file_handler)

    # None under a --windowed frozen build (no console attached) — never a
    # closed/broken stream, so this is the correct, sufficient guard.
    if sys.stderr is not None:
        stream_handler = logging.StreamHandler(sys.stderr)
        stream_handler.setLevel(logging.WARNING)
        stream_handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
        logger.addHandler(stream_handler)

    return logger
