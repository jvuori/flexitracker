"""Diagnostic that found the TRUE byte offset of SessionFlags (lock state)
inside the WTSINFOEXW buffer returned by WTSQuerySessionInformationW. Windows
only. Standalone -- does not import `flexitracker`, deliberately, so it
can't share whatever bug it's used to find.

RESOLVED (2026-09-29): offset 16, not the originally-shipped 12. Confirmed
by real output from this tool, two ways at once: [8] exactly matched an
independently fetched WTSGetActiveConsoleSessionId() every sample (pinning
SessionId's real offset), and [16] was the one that actually flipped 1<->0
in lockstep with real Win+L lock/unlock, matching the documented
WTS_SESSIONSTATE_UNLOCK=1 / _LOCK=0. [12] (the original offset) sat at a
constant 0 throughout -- SessionState (WTSActive), not SessionFlags. Fixed
in `idle.py`; kept here for the next time this class of bug needs
re-verifying, on a different Windows build or architecture.

Why this exists: `windows_session_locked()` in `flexitracker/idle.py` used
offset 12 (reasoned from the documented struct field order, assuming no
padding). In production it always read "locked" -- see CLAUDE.md. The
explanation, worked out from Microsoft's own struct definitions and then
confirmed by this script's actual output: WTSINFOEX_LEVEL1_W contains
several 8-byte LARGE_INTEGER fields, which gives the whole struct (and the
union wrapping it) 8-byte alignment, pushing the union 4 bytes later than
offset 12 assumed -- landing on SessionState (usually 0 = WTSActive)
instead of SessionFlags, and 0 also happens to mean WTS_SESSIONSTATE_LOCK.
Reasoning alone wasn't trusted a second time after the first offset guess
shipped wrong -- this script measured it instead.

Usage (from daemon-py/):
    uv run tools/wts_lock_diagnostic.py [poll_seconds] [total_seconds]

Run it, then deliberately lock (Win+L) and unlock the screen a few times
while it's running (default: every 2s for 3 minutes -- plenty of time for a
few lock/unlock cycles). Send back the full output.

How to read it:
  - `console_session_id` is fetched independently (WTSGetActiveConsoleSessionId)
    and is NOT the value we're trying to find -- it's a known-correct anchor.
    Whichever [offset]=value in the dump EXACTLY MATCHES it is the real
    SessionId field. SessionState is 4 bytes after that, SessionFlags 4
    bytes after that -- this pins down the whole layout without having to
    trust anyone's reasoning about padding, including the note above.
  - Independently, whichever offset's value changes exactly when you lock
    vs. unlock is SessionFlags by direct observation, regardless of the
    SessionId cross-check. The two should agree; if they don't, trust the
    lock/unlock toggle -- it's the more direct measurement.
"""

from __future__ import annotations

import sys
import time

WTS_CURRENT_SERVER_HANDLE = 0
WTS_CURRENT_SESSION = 0xFFFFFFFF
WTS_SESSION_INFO_EX = 25


def dump_once(wtsapi32, ctypes) -> None:
    buf = ctypes.c_void_p()
    length = ctypes.c_uint()
    ok = wtsapi32.WTSQuerySessionInformationW(
        WTS_CURRENT_SERVER_HANDLE,
        ctypes.c_uint(WTS_CURRENT_SESSION),
        WTS_SESSION_INFO_EX,
        ctypes.byref(buf),
        ctypes.byref(length),
    )
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    if not ok or not buf.value:
        print(f"{ts}  WTSQuerySessionInformationW FAILED (ok={ok}, len={length.value})")
        return
    try:
        console_session_id = wtsapi32.WTSGetActiveConsoleSessionId()
        n = min(length.value, 64)
        raw = ctypes.string_at(buf.value, n)
        hex_str = " ".join(f"{b:02x}" for b in raw)
        print(f"{ts}  console_session_id={console_session_id}  length={length.value}  bytes={hex_str}")
        fields = []
        for off in range(0, n - 3, 4):
            i32 = ctypes.cast(buf.value + off, ctypes.POINTER(ctypes.c_int32)).contents.value
            fields.append(f"[{off:2d}]={i32}")
        print("           " + "  ".join(fields))
    finally:
        wtsapi32.WTSFreeMemory(buf)


def main() -> None:
    if sys.platform != "win32":
        raise SystemExit("This diagnostic only runs on Windows.")

    import ctypes  # local: importing this on non-Windows is fine, but

    wtsapi32 = ctypes.windll.wtsapi32  # this line is Windows-only

    interval = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0
    total = float(sys.argv[2]) if len(sys.argv) > 2 else 180.0
    print(f"Polling every {interval}s for {total}s.")
    print("Lock (Win+L) and unlock the screen a few times while this runs, then")
    print("send back the full output (or at least the rows around each toggle).")
    print()
    deadline = time.monotonic() + total
    while time.monotonic() < deadline:
        dump_once(wtsapi32, ctypes)
        time.sleep(interval)


if __name__ == "__main__":
    main()
