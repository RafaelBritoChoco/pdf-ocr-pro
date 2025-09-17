# Pre-commit hook (PowerShell) - copy to .git/hooks/pre-commit and set execution policy if needed
Param()

$ErrorActionPreference = 'Stop'

Write-Host "[pre-commit] Executando verificação de segredos..." -ForegroundColor Yellow
node scripts/secret-scan.js

# Block large PDFs (>2MB)
$max = 2000000
$files = git diff --cached --name-only --diff-filter=ACM | Where-Object { $_ -match "\.pdf$" }
foreach ($f in $files) {
  if (Test-Path $f) {
    $size = (Get-Item $f).Length
    if ($size -gt $max) {
      Write-Host "[pre-commit] PDF grande detectado (>2MB): $f ($size bytes). Use samples-local/ ou reduza o tamanho." -ForegroundColor Red
      exit 1
    }
  }
}

Write-Host "[pre-commit] OK" -ForegroundColor Green
