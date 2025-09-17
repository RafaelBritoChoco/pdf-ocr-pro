Param(
  [string]$BindHost = "127.0.0.1",
  [int]$BindPort = 8008
)

Write-Host "Starting Docling service on http://${BindHost}:${BindPort} ..." -ForegroundColor Cyan

# Try to activate a venv if exists
$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvActivate = Join-Path -Path $rootPath -ChildPath ".venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
  Write-Host "Activating Python venv (.venv)" -ForegroundColor DarkCyan
  . $venvActivate
}

try {
  # Ensure deps (optional, comment out if you prefer manual install)
  # python -m pip install --upgrade pip | Out-Null
  # $req = Join-Path -Path $rootPath -ChildPath 'requirements.txt'
  # pip install -r $req | Out-Null
} catch {}

python -m uvicorn docling_service:app --host $BindHost --port $BindPort --reload
