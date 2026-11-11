@echo off
setlocal
cd /d "%~dp0.."

node scripts/setup-local.cjs
if errorlevel 1 exit /b %errorlevel%

docker compose up --build -d --wait --wait-timeout 180
if errorlevel 1 exit /b %errorlevel%
docker compose ps
