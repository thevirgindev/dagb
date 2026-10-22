$procs = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.ExecutablePath -like '*imput*' }
$out = foreach ($p in $procs) {
  [PSCustomObject]@{
    Pid  = $p.ProcessId
    Cmd  = $p.CommandLine
  }
}
$out | ConvertTo-Json -Depth 3 | Out-File -Encoding utf8 'C:\Users\user\Documents\smth-new\discord-agegate\recon\helium-procs.json'
"wrote $($procs.Count) procs"
"--- ports ---"
foreach ($p in 9222,9223,9224) {
  try { $c = Test-NetConnection -ComputerName 127.0.0.1 -Port $p -WarningAction SilentlyContinue; "$p open=$($c.TcpTestSucceeded)" } catch { "$p err" }
}
"--- profile dirs ---"
foreach ($d in "$env:LOCALAPPDATA\HeliumBrowser\User Data","$env:LOCALAPPDATA\imput\Helium\User Data") {
  "$d -> $(Test-Path $d)"
}
