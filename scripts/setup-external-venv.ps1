Param(
  [string]$VenvPath = 'C:\docling-venv'
)

$ErrorActionPreference = 'Stop'

Write-Host "Creating external venv at $VenvPath ..." -ForegroundColor Cyan

if (-not (Test-Path $VenvPath)) {
  New-Item -ItemType Directory -Force -Path $VenvPath | Out-Null
}

# Create venv
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { throw 'Python not found in PATH. Install Python 3.10+ first.' }

& $py -m venv "$VenvPath" | Out-Null

$activate = Join-Path $VenvPath 'Scripts/Activate.ps1'
if (-not (Test-Path $activate)) { throw "Failed to create venv at $VenvPath" }

. $activate

# Upgrade pip and install wheel (safer for binary deps)
python -m pip install --upgrade pip wheel setuptools

# Install requirements from project root
$rootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$req = Join-Path $rootPath 'requirements.txt'
if (-not (Test-Path $req)) { throw "requirements.txt not found at $req" }

python -m pip install -r "$req"

Write-Host "External venv ready: $VenvPath" -ForegroundColor Green
Write-Host "Tip: Start service using: scripts/run-docling-detached.ps1 -VenvPath '$VenvPath'" -ForegroundColor DarkCyan
