Param(
  [string]$Endpoint = "http://127.0.0.1:8008/health",
  [int]$IntervalSeconds = 30,
  [string]$VenvPath = "C:\docling-venv"
)

$ErrorActionPreference = 'SilentlyContinue'
Write-Host "[watchdog] Monitoring Docling at $Endpoint every $IntervalSeconds s (venv=$VenvPath)" -ForegroundColor Cyan

while ($true) {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $Endpoint -TimeoutSec 5
    if ($resp.StatusCode -eq 200 -and $resp.Content -match 'status' -and $resp.Content -match 'ok') {
      Write-Host ("[watchdog] OK {0} ({1})" -f (Get-Date), $resp.StatusCode) -ForegroundColor DarkGreen
    } else {
      Write-Warning "[watchdog] Health check returned non-OK. Attempting restart..."
      powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\run-docling-detached.ps1" -BindHost 127.0.0.1 -BindPort 8008 -VenvPath "$VenvPath" | Out-Null
    }
  } catch {
    Write-Warning "[watchdog] Health check failed: $_. Restarting Docling..."
    powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\run-docling-detached.ps1" -BindHost 127.0.0.1 -BindPort 8008 -VenvPath "$VenvPath" | Out-Null
  }
  Start-Sleep -Seconds $IntervalSeconds
}
