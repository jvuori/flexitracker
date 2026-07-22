# FlexiTracker (Windows) — install the daemon into your user profile with uv
# (no admin, no compiler) and register a login task so it starts on sign-in.
#
# This is the recommended path on managed machines that block unsigned
# executables but permit a user-scope Python toolchain. If your machine allows
# executables, you can instead download the standalone flexitracker.exe from the
# GitHub Releases page (see install/README.md for the SmartScreen trust step).

$ErrorActionPreference = "Stop"

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Error "uv is required: https://docs.astral.sh/uv/ (run: irm https://astral.sh/uv/install.ps1 | iex)"
    exit 1
}

Write-Host "Installing flexitracker with uv…"
uv tool install --upgrade flexitracker

$bin = (Get-Command flexitracker -ErrorAction SilentlyContinue).Source
if (-not $bin) { $bin = Join-Path $env:USERPROFILE ".local\bin\flexitracker.exe" }

# Authorize this machine if not already configured.
$cfg = Join-Path $env:APPDATA ".config\flexitracker\config.toml"
if (-not (Test-Path $cfg)) {
    Write-Host "`nAuthorize this machine (paste the access key from the web app):"
    & $bin configure
}

# Register a login task that starts the daemon windowless.
$action  = New-ScheduledTaskAction -Execute $bin
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
Register-ScheduledTask -TaskName "FlexiTracker" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "`nInstalled and registered to start on login. Check with:  flexitracker test"
