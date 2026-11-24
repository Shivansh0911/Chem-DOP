# Put the locally-running pI Predictor on a public URL via ngrok.
#
# Run .\run-local.ps1 in ANOTHER terminal first, then this one.
#
# Usage:  .\share.ps1                      -> random URL, changes every restart
#         .\share.ps1 -Domain my-app.ngrok-free.app   -> your permanent URL
#
# To get a permanent URL (free, one per account):
#   1. https://dashboard.ngrok.com/domains -> "New Domain"
#   2. Copy the name it gives you (e.g. chem-dop.ngrok-free.app)
#   3. Save it once:  .\share.ps1 -Domain chem-dop.ngrok-free.app -Save
#      After that plain .\share.ps1 always uses it.

param(
    [string]$Domain,
    [switch]$Save
)

$ErrorActionPreference = "Stop"
$store = Join-Path $PSScriptRoot ".ngrok-domain"

if ($Domain -and $Save) {
    Set-Content -Path $store -Value $Domain -Encoding utf8
    Write-Host "Saved. Plain .\share.ps1 will now use $Domain" -ForegroundColor Green
}
if (-not $Domain -and (Test-Path $store)) {
    $Domain = (Get-Content $store -Raw).Trim()
}

# Is the app actually up?
try {
    $null = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5
} catch {
    Write-Host "Nothing is serving on port 8000." -ForegroundColor Red
    Write-Host "Open another terminal and run  .\run-local.ps1  first." -ForegroundColor Red
    exit 1
}

if ($Domain) {
    Write-Host "Public URL: https://$Domain" -ForegroundColor Green
    Write-Host "This stays the same every time.  Ctrl+C to take it offline.`n" -ForegroundColor DarkGray
    ngrok http 8000 --url="https://$Domain"
} else {
    Write-Host "No permanent domain set - using a random one (changes on restart)." -ForegroundColor Yellow
    Write-Host "See the comment at the top of this file to reserve a free permanent URL.`n" -ForegroundColor DarkGray
    ngrok http 8000
}
