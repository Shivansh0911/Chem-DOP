# pI Predictor - start the whole app locally on http://localhost:8000
# Usage:  .\run-local.ps1          (normal start)
#         .\run-local.ps1 -Rebuild (re-train models + rebuild the UI first)

param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host "pI Predictor - local start" -ForegroundColor Cyan

# --- 1. dependencies -------------------------------------------------------
if (-not (Test-Path "$root\backend\models\rf.pkl") -or $Rebuild) {
    Write-Host "`n[1/3] Installing Python packages..." -ForegroundColor Yellow
    python -m pip install -q -r "$root\backend\requirements.txt"

    Write-Host "[2/3] Training models (~40 s, downloads the dataset itself)..." -ForegroundColor Yellow
    Push-Location "$root\backend"; python model.py; Pop-Location
} else {
    Write-Host "`n[1/3] Models already trained - skipping (use -Rebuild to force)" -ForegroundColor DarkGray
}

# --- 2. frontend build -----------------------------------------------------
if (-not (Test-Path "$root\frontend\dist\index.html") -or $Rebuild) {
    Write-Host "[3/3] Building the UI..." -ForegroundColor Yellow
    Push-Location "$root\frontend"
    if (-not (Test-Path "node_modules")) { npm install }
    npm run build
    Pop-Location
} else {
    Write-Host "[3/3] UI already built - skipping (use -Rebuild to force)" -ForegroundColor DarkGray
}

# --- 3. serve --------------------------------------------------------------
if (-not (Test-Path "$root\backend\.env")) {
    Write-Host "`nNote: backend\.env not found. Everything works except the 3 AI features." -ForegroundColor DarkYellow
}

Write-Host "`nServing on http://localhost:8000   (Ctrl+C to stop)" -ForegroundColor Green
Set-Location "$root\backend"
python -m uvicorn main:app --host 0.0.0.0 --port 8000
