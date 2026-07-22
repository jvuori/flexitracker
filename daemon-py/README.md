# FlexiTracker daemon (Python)

The FlexiTracker activity daemon: a pure-Python program that captures idle/active
transitions and ships back-dated events to the backend. Pure stdlib, no compiled
extension, so it installs with `uv` into a user profile — no admin rights and no
compiler — which is what lets it run on managed machines that block unsigned
executables. OS idle detection is done through `ctypes` (Windows
`GetLastInputInfo`, Linux XScreenSaver).

## Install

Recommended (all platforms):

```bash
uv tool install flexitracker
```

Or, on a machine that allows executables, download the standalone
`flexitracker` / `flexitracker.exe` from the GitHub **Releases** page (it bundles
its own Python runtime). See `install/README.md` for per-OS auto-start and the
Windows SmartScreen trust step.

## Use

```bash
flexitracker configure --key <ACCESS_KEY>   # authorize this machine, then self-test
flexitracker test                            # connectivity check, sends no data
flexitracker                                 # run the daemon
```

## Develop

```bash
uv sync
uv run pytest        # unit tests + the 24 behavioural vectors (tests/vectors/)
```

The behavioural vectors in `tests/vectors/` are the oracle for the state machine
(back-dating, suspend reconciliation, the emit watermark, the return-to-work
clock). Any change to that logic must be reflected in a vector.
