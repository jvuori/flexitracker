"""Idle-time and session-lock detection — mirror of `idle.rs`, via ctypes.

No input content is ever captured — only "how long since any input" and whether
the session is locked. Platform sources are selected at runtime; a simulated
source drives scripted runs and tests. Using ctypes (stdlib) means no compiled
extension and so no C toolchain at install time.

Lock detection matters independently of idle_ms: a locked session is an
authoritative "the user is not present" signal that OS idle-time counters can
get wrong around suspend/resume (observed: a corporate laptop's idle-time API
underreporting elapsed time across a sleep/wake cycle kept `idle_ms` looking
fresh for hours). It is best-effort — any failure to query it (missing
`loginctl`/logind on Linux, an unexpected WTS response on Windows) falls back
to `locked=False`, i.e. today's idle_ms-only behavior, rather than crashing the
daemon; a wrong-but-safe default beats an unhandled exception in the poll loop.
"""

from __future__ import annotations

import ctypes
import os
import subprocess
import sys
from dataclasses import dataclass
from typing import Optional


@dataclass
class Sample:
    idle_ms: int
    locked: bool


class SimulatedIdle:
    """Replays a scripted sequence of samples (scripted runs / tests)."""

    def __init__(self, samples: list) -> None:
        self._samples = samples
        self._i = 0

    def sample(self) -> Sample:
        if self._i < len(self._samples):
            s = self._samples[self._i]
        else:
            s = Sample(idle_ms=2**63 - 1, locked=False)  # exhausted -> very idle
        self._i += 1
        return s


# XScreenSaverInfo: idle (unsigned long) is at byte offset 24 on LP64
# (window u64, state i32, kind i32, since u64, idle u64, ...).
_IDLE_OFFSET = 24


def _parse_locked_hint(returncode: int, stdout: str) -> Optional[bool]:
    """Interpret `loginctl show-session <id> -p LockedHint --value` output.
    None means "couldn't tell" (missing binary, no session id, non-systemd
    session, ...) — the caller must treat that as "assume not locked" rather
    than erroring, since this is a best-effort signal on top of idle_ms."""
    if returncode != 0:
        return None
    value = stdout.strip()
    if value not in ("yes", "no"):
        return None
    return value == "yes"


def linux_session_locked() -> Optional[bool]:
    """logind's `LockedHint` — set the moment a lock screen (gnome-screensaver,
    light-locker, systemd-triggered lid lock, ...) engages, unlike the X11 idle
    timer which some lockers/compositors can keep nudging. Requires
    `$XDG_SESSION_ID` (present on any systemd-logind desktop session) and the
    `loginctl` binary (part of systemd, not a new dependency to install)."""
    session_id = os.environ.get("XDG_SESSION_ID")
    if not session_id:
        return None
    try:
        proc = subprocess.run(
            ["loginctl", "show-session", session_id, "-p", "LockedHint", "--value"],
            capture_output=True, text=True, timeout=2,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return _parse_locked_hint(proc.returncode, proc.stdout)


class LinuxIdle:
    def __init__(self) -> None:
        try:
            x11 = ctypes.CDLL("libX11.so.6")
            xss = ctypes.CDLL("libXss.so.1")
        except OSError as e:
            raise OSError(f"cannot load X libraries ({e}); set them up or use --simulate") from e

        x11.XOpenDisplay.restype = ctypes.c_void_p
        x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
        x11.XDefaultRootWindow.restype = ctypes.c_ulong
        x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
        xss.XScreenSaverAllocInfo.restype = ctypes.c_void_p
        xss.XScreenSaverQueryInfo.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p]
        xss.XScreenSaverQueryInfo.restype = ctypes.c_int

        self._display = x11.XOpenDisplay(None)
        if not self._display:
            raise OSError("cannot open X display (set DISPLAY, or use --simulate)")
        self._root = x11.XDefaultRootWindow(self._display)
        self._info = xss.XScreenSaverAllocInfo()
        self._query = xss.XScreenSaverQueryInfo

    def sample(self) -> Sample:
        self._query(self._display, self._root, self._info)
        idle_ptr = ctypes.cast(self._info + _IDLE_OFFSET, ctypes.POINTER(ctypes.c_ulong))
        locked = linux_session_locked()
        return Sample(idle_ms=int(idle_ptr.contents.value), locked=bool(locked))


class _LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


# WTSQuerySessionInformationW(..., WTSSessionInfoEx, ...) fills a WTSINFOEXW:
#   DWORD Level;                    // offset 0 — union variant selector (1 == Level1)
#   <4 bytes padding>                // offset 4 — see below
#   union { WTSINFOEX_LEVEL1_W L1;  // offset 8
#     ULONG SessionId;              //   +0  (offset 8)
#     WTS_CONNECTSTATE_CLASS State; //   +4  (offset 12; C enum, 4 bytes)
#     LONG  SessionFlags;           //   +8  (offset 16; WTS_SESSIONSTATE_LOCK=0 / _UNLOCK=1 / _UNKNOWN=-1)
#     ... (session addresses, latency — unused, and version-sensitive) ...
#   }
# The padding is NOT in Microsoft's field list (which just shows Level then
# the union) — it exists because WTSINFOEX_LEVEL1_W contains several 8-byte
# LARGE_INTEGER fields further down (LogonTime etc.), which gives the whole
# struct — and the union wrapping it — 8-byte alignment on a 64-bit process,
# pushing the union from offset 4 to offset 8. A first version of this code
# used offset 12 for SessionFlags, reasoned from the field list without
# accounting for this, and it landed on SessionState instead (0 = WTSActive
# for a normal local console session — which numerically collides with
# WTS_SESSIONSTATE_LOCK, so it read "locked" 100% of the time in production;
# see CLAUDE.md). Offset 16 was confirmed empirically — not just reasoned —
# via `tools/wts_lock_diagnostic.py`: [8] exactly matched an independently
# fetched WTSGetActiveConsoleSessionId() (proving SessionId's real offset),
# and [16] was the one that actually flipped 1↔0 on real lock/unlock.
# Reading just these two ints by fixed offset (rather than modeling the full,
# larger union) mirrors the same trick already used for X11's
# XScreenSaverInfo above.
_WTS_LEVEL_OFFSET = 0
_WTS_SESSION_FLAGS_OFFSET = 16
WTS_SESSIONSTATE_LOCK = 0
WTS_CURRENT_SERVER_HANDLE = 0
WTS_CURRENT_SESSION = -1  # cast to DWORD below; WTS_CURRENT_SESSION is (DWORD)-1
_WTS_SESSION_INFO_EX = 25  # WTS_INFO_CLASS.WTSSessionInfoEx


def _locked_from_session_flags(level: int, session_flags: int) -> Optional[bool]:
    """Pure interpretation of a WTSINFOEXW's Level/SessionFlags, split out from
    the ctypes plumbing so it's unit-testable without a real Windows session."""
    if level != 1:
        return None  # unrecognized variant — don't guess
    if session_flags not in (0, 1):
        return None  # WTS_SESSIONSTATE_UNKNOWN (-1) or an unexpected value
    return session_flags == WTS_SESSIONSTATE_LOCK


def windows_session_locked(wtsapi32) -> Optional[bool]:
    buf = ctypes.c_void_p()
    length = ctypes.c_uint()
    ok = wtsapi32.WTSQuerySessionInformationW(
        WTS_CURRENT_SERVER_HANDLE,
        ctypes.c_uint(WTS_CURRENT_SESSION & 0xFFFFFFFF),
        _WTS_SESSION_INFO_EX,
        ctypes.byref(buf),
        ctypes.byref(length),
    )
    if not ok or not buf.value:
        return None
    try:
        level = ctypes.cast(buf.value + _WTS_LEVEL_OFFSET, ctypes.POINTER(ctypes.c_uint32)).contents.value
        flags = ctypes.cast(
            buf.value + _WTS_SESSION_FLAGS_OFFSET, ctypes.POINTER(ctypes.c_int32)
        ).contents.value
    finally:
        wtsapi32.WTSFreeMemory(buf)
    return _locked_from_session_flags(level, flags)


class WindowsIdle:
    def __init__(self) -> None:
        self._user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        self._kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        # windows_session_locked() (WTSQuerySessionInformationW/WTSSessionInfoEx)
        # was disabled in v0.5.1 after shipping an unverified struct offset
        # that read "locked" permanently in production (see CLAUDE.md). The
        # corrected offset (16, not 12) is now confirmed by direct
        # measurement on real hardware, not just reasoning — see the offset
        # comment above and `tools/wts_lock_diagnostic.py`. Re-enabled.
        try:
            self._wtsapi32 = ctypes.windll.wtsapi32  # type: ignore[attr-defined]
        except OSError:
            self._wtsapi32 = None  # lock detection unavailable; idle_ms-only, as before

    def sample(self) -> Sample:
        info = _LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(_LASTINPUTINFO)
        if self._user32.GetLastInputInfo(ctypes.byref(info)) == 0:
            raise OSError("GetLastInputInfo failed")
        tick = self._kernel32.GetTickCount() & 0xFFFFFFFF
        idle_ms = (tick - info.dwTime) & 0xFFFFFFFF  # wrapping_sub, as u32
        locked = False
        if self._wtsapi32 is not None:
            try:
                locked = bool(windows_session_locked(self._wtsapi32))
            except OSError:
                locked = False
        return Sample(idle_ms=idle_ms, locked=locked)


def platform_source():
    """Construct the real platform idle source, or fail fast with a clear message."""
    if sys.platform.startswith("linux"):
        return LinuxIdle()
    if sys.platform == "win32":
        return WindowsIdle()
    raise OSError(f"no idle source for platform {sys.platform!r}; use --simulate")
