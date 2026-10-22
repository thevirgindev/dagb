# Install the Discord Age Gate Bypass extension into Helium.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-helium.ps1
#
# Stages the unpacked extension into the workspace staging dir that
# oc-tools\helium\persist.ps1 already knows about, then lets that tool patch
# Helium's shortcuts with --load-extension. Helium honours --load-extension
# without any extra feature flag (verified on 0.19.4.1 / Chromium 155), so the
# extension loads on every launch from the shortcut and needs no developer mode.
#
# Uninstall: re-run oc-tools\helium\persist.ps1 with an empty helium-ext dir,
# or strip the flag by hand (both shortcuts are backed up next to the .lnk).

$ErrorActionPreference = 'Stop'

$Project   = Split-Path -Parent $PSScriptRoot
$Extension = Join-Path $Project 'extension'
$Stage     = 'C:\Users\user\Documents\smth-new\helium-ext'
$Target    = Join-Path $Stage 'discord-agegate'
$Persist   = 'C:\Users\user\Documents\smth-new\oc-tools\helium\persist.ps1'

if (-not (Test-Path (Join-Path $Extension 'manifest.json'))) {
  throw "extension manifest not found at $Extension"
}

New-Item -ItemType Directory -Force $Stage | Out-Null
if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
Copy-Item $Extension $Target -Recurse -Force
Write-Host "staged: $Target" -ForegroundColor Cyan

# sanity: the manifest must survive the copy
$mf = Get-Content (Join-Path $Target 'manifest.json') -Raw | ConvertFrom-Json
Write-Host "  name    : $($mf.name) v$($mf.version)"
Write-Host "  content_scripts: $($mf.content_scripts.Count) (world: $(($mf.content_scripts | ForEach-Object { $_.world }) -join ','))"

if (Test-Path $Persist) {
  & $Persist
} else {
  throw "persist.ps1 not found at $Persist"
}

Write-Host ""
Write-Host "Now relaunch Helium from the shortcut. Verify with:" -ForegroundColor Green
Write-Host "  node tools\verify-live.mjs" -ForegroundColor Green
