//! Idle-time and session-lock detection. No input content is ever captured —
//! only "how long since any input" and whether the session is locked
//! (activity-daemon spec). Platform impls are selected at build time; a
//! simulated source drives local runs and tests.

pub struct Sample {
    pub idle_ms: i64,
    pub locked: bool,
}

pub trait IdleSource {
    fn sample(&mut self) -> std::io::Result<Sample>;
}

/// Replays a scripted sequence of samples (local simulation / tests).
pub struct SimulatedIdle {
    samples: Vec<Sample>,
    i: usize,
}

impl SimulatedIdle {
    pub fn new(samples: Vec<Sample>) -> Self {
        Self { samples, i: 0 }
    }
}

impl IdleSource for SimulatedIdle {
    fn sample(&mut self) -> std::io::Result<Sample> {
        let s = self
            .samples
            .get(self.i)
            .map(|s| Sample { idle_ms: s.idle_ms, locked: s.locked })
            .unwrap_or(Sample { idle_ms: i64::MAX, locked: false });
        self.i += 1;
        Ok(s)
    }
}

/// Construct the real platform idle source, or fail fast with a clear message.
pub fn platform_source() -> std::io::Result<Box<dyn IdleSource>> {
    #[cfg(target_os = "linux")]
    {
        Ok(Box::new(linux::LinuxIdle::new()?))
    }
    #[cfg(windows)]
    {
        Ok(Box::new(windows_impl::WindowsIdle::new()))
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    {
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "no idle source for this platform; use --simulate",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simulated_replays_then_reports_idle() {
        let mut s = SimulatedIdle::new(vec![
            Sample { idle_ms: 0, locked: false },
            Sample { idle_ms: 5000, locked: false },
        ]);
        assert_eq!(s.sample().unwrap().idle_ms, 0);
        assert_eq!(s.sample().unwrap().idle_ms, 5000);
        assert_eq!(s.sample().unwrap().idle_ms, i64::MAX, "exhausted → very idle");
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::{IdleSource, Sample};
    use libloading::{Library, Symbol};
    use std::os::raw::{c_int, c_ulong, c_void};

    // XScreenSaverInfo: idle (unsigned long) is at byte offset 24 on LP64
    // (window u64, state i32, kind i32, since u64, idle u64, ...).
    const IDLE_OFFSET: usize = 24;

    pub struct LinuxIdle {
        _x11: Library,
        _xss: Library,
        display: *mut c_void,
        root: c_ulong,
        info: *mut c_void,
        query: unsafe extern "C" fn(*mut c_void, c_ulong, *mut c_void) -> c_int,
    }

    impl LinuxIdle {
        pub fn new() -> std::io::Result<Self> {
            unsafe {
                let err = |m: &str| std::io::Error::new(std::io::ErrorKind::Other, m.to_string());
                let x11 = Library::new("libX11.so.6").map_err(|e| err(&e.to_string()))?;
                let xss = Library::new("libXss.so.1").map_err(|e| err(&e.to_string()))?;

                let open: Symbol<unsafe extern "C" fn(*const i8) -> *mut c_void> =
                    x11.get(b"XOpenDisplay").map_err(|e| err(&e.to_string()))?;
                let root_fn: Symbol<unsafe extern "C" fn(*mut c_void) -> c_ulong> =
                    x11.get(b"XDefaultRootWindow").map_err(|e| err(&e.to_string()))?;
                let alloc: Symbol<unsafe extern "C" fn() -> *mut c_void> =
                    xss.get(b"XScreenSaverAllocInfo").map_err(|e| err(&e.to_string()))?;
                let query: Symbol<
                    unsafe extern "C" fn(*mut c_void, c_ulong, *mut c_void) -> c_int,
                > = xss.get(b"XScreenSaverQueryInfo").map_err(|e| err(&e.to_string()))?;

                let display = open(std::ptr::null());
                if display.is_null() {
                    return Err(err("cannot open X display (set DISPLAY, or use --simulate)"));
                }
                let root = root_fn(display);
                let info = alloc();
                let query = *query;
                Ok(Self { _x11: x11, _xss: xss, display, root, info, query })
            }
        }
    }

    impl IdleSource for LinuxIdle {
        fn sample(&mut self) -> std::io::Result<Sample> {
            unsafe {
                (self.query)(self.display, self.root, self.info);
                let idle_ptr = (self.info as *const u8).add(IDLE_OFFSET) as *const c_ulong;
                Ok(Sample { idle_ms: *idle_ptr as i64, locked: false })
            }
        }
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::{IdleSource, Sample};
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    pub struct WindowsIdle;

    impl WindowsIdle {
        pub fn new() -> Self {
            Self
        }
    }

    impl IdleSource for WindowsIdle {
        fn sample(&mut self) -> std::io::Result<Sample> {
            unsafe {
                let mut info = LASTINPUTINFO {
                    cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                    dwTime: 0,
                };
                if GetLastInputInfo(&mut info) == 0 {
                    return Err(std::io::Error::last_os_error());
                }
                let idle_ms = GetTickCount().wrapping_sub(info.dwTime) as i64;
                Ok(Sample { idle_ms, locked: false })
            }
        }
    }
}
