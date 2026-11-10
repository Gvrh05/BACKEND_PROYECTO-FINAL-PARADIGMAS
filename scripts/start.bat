@echo off
setlocal
cd /d "%~dp0.."

if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example. Review the local passwords/secrets before continuing.
)

for /L %%N in (1,1,10) do (
  if not exist "public\seeds\q%%N.png" (
    echo Missing public\seeds\q%%N.png. Add all ten PNG seed images, then run this script again.
    exit /b 1
  )
)

docker compose up --build -d
if errorlevel 1 exit /b %errorlevel%
docker compose ps
