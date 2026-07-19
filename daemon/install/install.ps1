# Portable install for the flexi-worker daemon (Windows).
# Copies the binary to %LOCALAPPDATA%\flexi-worker, optionally configures it with
# your access key, and registers a login task that starts it with NO visible
# window. No administrator rights required.
#
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Key <ACCESS_KEY>
#
# The binary is unsigned, so Windows SmartScreen may warn on first run:
# click "More info" -> "Run anyway".
param([string]$Key)
$ErrorActionPreference = 'Stop'

$dest = Join-Path $Env:LOCALAPPDATA 'flexi-worker'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$exe = Join-Path $dest 'flexi-worker.exe'
Copy-Item -Path (Join-Path $PSScriptRoot 'flexi-worker.exe') -Destination $exe -Force

if ($Key) {
    & $exe configure --key $Key
}

# A launcher that runs the console daemon fully hidden (window style 0).
$vbs = Join-Path $dest 'launch.vbs'
Set-Content -Path $vbs -Encoding ASCII -Value ('CreateObject("WScript.Shell").Run """' + $exe + '""", 0, False')

# Auto-start at login (per-user, hidden).
schtasks /Create /TN flexi-worker /SC ONLOGON /RL LIMITED /TR "wscript.exe `"$vbs`"" /F | Out-Null

Write-Host "Installed to $dest and set to auto-start at login (hidden)."
if (-not $Key) {
    Write-Host "Next: & '$exe' configure --key <ACCESS_KEY>   then   & '$exe' test"
}
