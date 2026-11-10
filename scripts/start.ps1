$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $root

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Created .env from .env.example. Review the local passwords/secrets before continuing.'
}

$missing = 1..10 | Where-Object { -not (Test-Path "public/seeds/q$_.png") }
if ($missing.Count -gt 0) {
  Write-Error "Add the missing PNG files to public/seeds/: $($missing -join ', ')"
}

docker compose up --build -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose ps
