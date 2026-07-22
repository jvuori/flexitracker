# Installing the FlexiTracker daemon

The daemon is a pure-Python program. The **recommended** install on every OS is
with [uv](https://docs.astral.sh/uv/) — no administrator rights, no compiler, and
it works on managed machines that block unsigned executables.

## Recommended: uv (all platforms)

```bash
uv tool install flexitracker
flexitracker configure --key <YOUR_ACCESS_KEY>
flexitracker test
```

Then enable auto-start on login:

- **Linux:** `./install.sh` (installs a systemd *user* service).
- **Windows:** `powershell -ExecutionPolicy Bypass -File install.ps1` (registers a
  login task).

## Alternative: standalone executable (machines that allow exes)

If your machine permits running executables, download the standalone
`flexitracker.exe` (Windows) or `flexitracker` (Linux) from the project's GitHub
**Releases** page — it bundles its own Python runtime, so nothing else is needed.

```bat
flexitracker.exe configure --key <YOUR_ACCESS_KEY>
flexitracker.exe test
```

### Windows SmartScreen (unsigned executable)

The standalone executable is **not code-signed**, so Windows SmartScreen may warn
on first run. To allow it: click **More info → Run anyway**, or right-click the
file → **Properties** → tick **Unblock** → **OK**. If your organization blocks
unsigned executables entirely, use the **uv** path above instead — it does not run
an executable.
