# Restart Helium so the patched shortcut (with --load-extension) takes effect,
# with a temporary debug port so the extension can be verified live.
$ErrorActionPreference = 'Stop'

$exe = "$env:LOCALAPPDATA\imput\Helium\Application\chrome.exe"
$profile = "$env:LOCALAPPDATA\HeliumBrowser\User Data"
$ext = 'C:\Users\user\Documents\smth-new\helium-ext\discord-agegate'
$port = 9222

Write-Host "closing Helium (graceful first)..."
$procs = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*imput*' }
foreach ($p in $procs) { try { $null = $p.CloseMainWindow() } catch {} }
Start-Sleep -Seconds 6
$left = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*imput*' }
if ($left) {
  Write-Host "  $($left.Count) still alive, forcing"
  foreach ($p in $left) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 3
}

Write-Host "relaunching with extension + debug port $port ..."
Start-Process -FilePath $exe -ArgumentList @(
  "--user-data-dir=`"$profile`"",
  "--restore-last-session",
  "--load-extension=$ext",
  "--remote-debugging-port=$port",
  "--remote-allow-origins=*"
)
Start-Sleep -Seconds 8
Write-Host "up. checking the debug endpoint..."
try {
  $v = Invoke-RestMethod "http://127.0.0.1:$port/json/version" -TimeoutSec 10
  Write-Host "  $($v.Browser)"
} catch {
  Write-Host "  debug endpoint not answering yet: $($_.Exception.Message)"
}
