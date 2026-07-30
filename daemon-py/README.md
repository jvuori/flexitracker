# FlexiTracker daemon (Python)

The client half of [FlexiTracker](https://github.com/jvuori/flexitracker), a
flextime/saldo tracker: a pure-Python daemon that runs in the background on
your machine, watches only when you're active vs. idle (input timing and
screen-lock state — never keystrokes, window titles, or screenshots), and
**sends those timestamps over the network to the FlexiTracker cloud service**,
which turns them into trustworthy per-week working-time numbers in a web app.
This is not an offline/local-only tool — installing and running this package
means your activity data leaves the machine it's installed on. See the
[project README](https://github.com/jvuori/flexitracker#readme) for the full
picture, or self-host the backend if you'd rather not send data to someone
else's server.

Pure stdlib, no compiled extension, so it installs with `uv` into a user
profile — no admin rights and no compiler — which is what lets it run on
managed machines that block unsigned executables. OS idle detection is done
through `ctypes` (Windows `GetLastInputInfo`, Linux XScreenSaver).

## Install

Recommended (all platforms):

```bash
uv tool install flexitracker
```

Or, on a machine that allows executables, download the standalone build from
the GitHub **Releases** page (it bundles its own Python runtime): one binary
on Linux, or on Windows two — a console one for `login`/`test` and a
windowless one for auto-start. See `install/README.md` for per-OS auto-start
(a single copy-pasteable command, no installer script) and the Windows
SmartScreen trust step.

## Use

```bash
flexitracker login                          # authorize this machine in a browser, then self-test
flexitracker login --key <ACCESS_KEY>       # headless/scripted: authorize with a pasted key instead
flexitracker test                           # connectivity check, sends no data
flexitracker                                # run the daemon
```

## Develop

```bash
uv sync
uv run pytest        # unit tests + the 24 behavioural vectors (tests/vectors/)
```

The behavioural vectors in `tests/vectors/` are the oracle for the state machine
(back-dating, suspend reconciliation, the emit watermark, the return-to-work
clock). Any change to that logic must be reflected in a vector.
