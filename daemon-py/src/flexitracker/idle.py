"""Idle-time and session-lock detection — mirror of `idle.rs`, via ctypes.

No input content is ever captured — only "how long since any input" and whether
the session is locked. Platform sources are selected at runtime; a simulated
source drives scripted runs and tests. Using ctypes (stdlib) means no compiled
extension and so no C toolchain at install time.
"""

from __future__ import annotations

import ctypes
import sys
from dataclasses import dataclass


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
        return Sample(idle_ms=int(idle_ptr.contents.value), locked=False)


class _LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


class WindowsIdle:
    def __init__(self) -> None:
        self._user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        self._kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]

    def sample(self) -> Sample:
        info = _LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(_LASTINPUTINFO)
        if self._user32.GetLastInputInfo(ctypes.byref(info)) == 0:
            raise OSError("GetLastInputInfo failed")
        tick = self._kernel32.GetTickCount() & 0xFFFFFFFF
        idle_ms = (tick - info.dwTime) & 0xFFFFFFFF  # wrapping_sub, as u32
        return Sample(idle_ms=idle_ms, locked=False)


def platform_source():
    """Construct the real platform idle source, or fail fast with a clear message."""
    if sys.platform.startswith("linux"):
        return LinuxIdle()
    if sys.platform == "win32":
        return WindowsIdle()
    raise OSError(f"no idle source for platform {sys.platform!r}; use --simulate")
