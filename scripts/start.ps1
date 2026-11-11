$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $root

node scripts/setup-local.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker compose up --build -d --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose ps
