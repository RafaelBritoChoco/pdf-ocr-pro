Param(
  [string]$Endpoint = "http://127.0.0.1:8008/health",
  [int]$IntervalSeconds = 5,
  [string]$VenvPath = "C:\docling-venv"
)

$ErrorActionPreference = 'SilentlyContinue'
Write-Host "[watchdog] Monitoring Docling at $Endpoint every $IntervalSeconds s (venv=$VenvPath)" -ForegroundColor Cyan

function Test-PortOpen([string]$host, [int]$port) {
  try { return (Test-NetConnection -ComputerName $host -Port $port -InformationLevel Quiet) } catch { return $false }
}

$uri = [System.Uri]::new($Endpoint)
$host = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 8008 }

$failCount = 0
while ($true) {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $Endpoint -TimeoutSec 5
    if ($resp.StatusCode -eq 200 -and $resp.Content -match 'status' -and $resp.Content -match 'ok') {
      $failCount = 0
      Write-Host ("[watchdog] OK {0} ({1})" -f (Get-Date), $resp.StatusCode) -ForegroundColor DarkGreen
    } else {
      $failCount++
      Write-Warning "[watchdog] Health non-OK ($failCount)."
      if ($failCount -ge 2 -or -not (Test-PortOpen $host $port)) {
        Write-Warning "[watchdog] Restarting Docling..."
        powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\run-docling-detached.ps1" -BindHost $host -BindPort $port -VenvPath "$VenvPath" | Out-Null
      }
    }
  } catch {
    $failCount++
    Write-Warning "[watchdog] Health failed ($failCount): $_"
    if ($failCount -ge 2 -or -not (Test-PortOpen $host $port)) {
      Write-Warning "[watchdog] Restarting Docling..."
      powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\run-docling-detached.ps1" -BindHost $host -BindPort $port -VenvPath "$VenvPath" | Out-Null
    }
  }
  Start-Sleep -Seconds $IntervalSeconds
}
