Param(
  [string]$BindHost = "127.0.0.1",
  [int]$BindPort = 8008,
  [string]$LogDir = "logs",
  # Optional: use an external virtual environment (ASCII-only path recommended on Windows)
  [string]$VenvPath
)

$ErrorActionPreference = 'Stop'

Write-Host "Starting Docling (detached) on http://${BindHost}:${BindPort} ..." -ForegroundColor Cyan

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# Warn if project path contains non-ASCII, which can break some native libs on Windows
if ([System.Text.Encoding]::ASCII.GetString([System.Text.Encoding]::ASCII.GetBytes($rootPath)) -ne $rootPath) {
  Write-Warning "Project path contains non-ASCII characters. Consider using -VenvPath to an ASCII-only folder (e.g., C:\docling-venv) to avoid native library path issues."
}

# Activate virtual environment
if ($VenvPath) {
  $venvActivate = Join-Path -Path $VenvPath -ChildPath "Scripts\Activate.ps1"
  if (-not (Test-Path $venvActivate)) { throw "Venv activation script not found at: $venvActivate" }
  Write-Host "Activating Python venv ($VenvPath)" -ForegroundColor DarkCyan
  . $venvActivate
} else {
  $venvActivate = Join-Path -Path $rootPath -ChildPath ".venv\Scripts\Activate.ps1"
  if (Test-Path $venvActivate) {
    Write-Host "Activating Python venv (.venv)" -ForegroundColor DarkCyan
    . $venvActivate
  }
}

New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot $LogDir) | Out-Null
$logBase = Join-Path $PSScriptRoot ("$LogDir\docling-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$logOut = "$logBase.out.log"
$logErr = "$logBase.err.log"
$pidFile = Join-Path $rootPath ".docling.pid"

# Ensure any previous PID file pointing to a dead process is removed
if (Test-Path $pidFile) {
  try {
    $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($oldPid) {
      $proc = Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue
      if (-not $proc) { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }
    }
  } catch {}
}

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { throw 'Python not found in PATH (ensure venv activation succeeded)' }
Write-Host "Using Python: $python" -ForegroundColor DarkCyan

$args = @('-m','uvicorn','docling_service:app','--host', $BindHost, '--port', $BindPort)

# Start detached (no --reload to avoid reloader lifecycle flakiness)
$p = Start-Process -FilePath $python -ArgumentList $args -PassThru -WindowStyle Minimized -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WorkingDirectory $rootPath

if (-not $p) { throw 'Failed to start uvicorn process' }

Set-Content -Path $pidFile -Value $p.Id -Encoding ascii

# Wait for port to open (allow up to ~30s for cold start)
$ok = $false
for ($i=0; $i -lt 120; $i++) {
  Start-Sleep -Milliseconds 250
  $conn = Test-NetConnection -ComputerName $BindHost -Port $BindPort -InformationLevel Quiet
  if ($conn) { $ok = $true; break }
}

if ($ok) {
  Write-Host ("Docling listening on http://{0}:{1} (PID={2}) | Logs: {3}, {4}" -f $BindHost, $BindPort, $p.Id, $logOut, $logErr) -ForegroundColor Green
  exit 0
} else {
  Write-Warning "Docling did not open port in time; see logs for details: $logOut, $logErr"
  try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
  exit 1
}
