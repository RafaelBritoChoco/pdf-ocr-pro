$ErrorActionPreference = 'Stop'

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pidFile = Join-Path $rootPath ".docling.pid"

if (-not (Test-Path $pidFile)) {
  Write-Host "No PID file found ($pidFile). Nothing to stop." -ForegroundColor Yellow
  exit 0
}

try {
  $doclingPid = Get-Content $pidFile -ErrorAction Stop | Select-Object -First 1
  if (-not $doclingPid) { Write-Host "Empty PID file." -ForegroundColor Yellow; exit 0 }
  $proc = Get-Process -Id ([int]$doclingPid) -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Host ("Stopping Docling process PID={0} ..." -f $doclingPid) -ForegroundColor Cyan
    Stop-Process -Id ([int]$doclingPid) -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300
  } else {
    Write-Host "Process not running. Cleaning up." -ForegroundColor Yellow
  }
} catch {
  Write-Warning $_
} finally {
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Docling stopped." -ForegroundColor Green
