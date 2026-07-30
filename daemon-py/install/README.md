# Installing the FlexiTracker daemon

The daemon is a pure-Python program. The **recommended** install on every OS is
with [uv](https://docs.astral.sh/uv/) — no administrator rights, no compiler, and
it works on managed machines that block unsigned executables and installer
scripts alike.

Every auto-start step below is a single command you run yourself and can read
before pasting — **no installer script (PowerShell, VBScript, or shell) is
downloaded or executed for you.** This also renders on the web app's Machines
tab, matching your detected OS, with a copy button.

## Recommended: uv (all platforms)

```bash
uv tool install flexitracker
flexitracker login
flexitracker test
```

`login` opens your browser to authorize the machine — sign in, approve, and the
key lands in the config automatically; you never see or paste it. On a
headless or scripted box, use `flexitracker login --key <YOUR_ACCESS_KEY>`
with a key from the web UI's "Add machine" button instead.

`uv tool install` places two commands on `PATH`: the console `flexitracker`
used above (for `login`/`test`, where you want to see the output), and a
second, windowless `flexitracker-daemon` command for auto-start below — it runs
the identical daemon with no console window.

### Auto-start on login

- **Windows** — run this once in `cmd.exe` or PowerShell (no admin rights
  needed; it only touches your own user's registry):

  ```
  reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v FlexiTracker /t REG_SZ /d "\"%USERPROFILE%\.local\bin\flexitracker-daemon.exe\"" /f
  ```

  To undo it: `reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v FlexiTracker /f`

- **Linux** — systemd *user* service:

  ```bash
  mkdir -p ~/.config/systemd/user
  cp flexitracker.service ~/.config/systemd/user/
  systemctl --user daemon-reload
  systemctl --user enable --now flexitracker.service
  ```

  (`flexitracker.service` is the unit file in this directory — it's a plain
  declarative unit, not a script.) Check status/logs with
  `systemctl --user status flexitracker` / `journalctl --user -u flexitracker -f`.
  If the machine doesn't keep a session open past logout, also run
  `loginctl enable-linger "$USER"` once so the user service can still start.
  To undo it: `systemctl --user disable --now flexitracker.service`.

## Alternative: standalone executables (machines that allow exes)

If your machine permits running executables, download from the project's
GitHub **Releases** page — it bundles its own Python runtime, so nothing else
is needed. Windows ships **two** executables; use the right one for the job:

| File | Use it for |
|------|------------|
| `flexitracker-windows-x86_64.exe` | `login` and `test`, run from a terminal — it has a console, so you see the output. |
| `flexitracker-daemon-windows-x86_64.exe` | Auto-start only — a windowless build with no console window, ever. |

Linux has one binary, `flexitracker-linux-x86_64`, used for everything.

```bat
flexitracker-windows-x86_64.exe login
flexitracker-windows-x86_64.exe test
```

### Auto-start on login (standalone executable)

Save `flexitracker-daemon-windows-x86_64.exe` somewhere permanent (e.g.
`%LOCALAPPDATA%\flexitracker\flexitracker-daemon.exe`), then register it the
same way as the `uv` path, pointed at that path instead:

```
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v FlexiTracker /t REG_SZ /d "\"<path to flexitracker-daemon-windows-x86_64.exe>\"" /f
```

On Linux, use the same `flexitracker.service` + `systemctl --user` steps
above, pointing `ExecStart` at wherever you saved `flexitracker-linux-x86_64`.

### Windows SmartScreen (unsigned executables)

Both standalone executables are **not code-signed**, so Windows SmartScreen may
warn on first run. To allow one: click **More info → Run anyway**, or
right-click the file → **Properties** → tick **Unblock** → **OK**. If your
organization blocks unsigned executables entirely, use the **uv** path above
instead — it does not run a downloaded executable.
