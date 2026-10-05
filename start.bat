@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 exit /b 1
)
if not exist frontend\dist\index.html (
  call npm run build
  if errorlevel 1 exit /b 1
)
if not exist backend\artifacts\contracts\Partnership.sol\PartnershipFactory.json (
  call npm run compile
  if errorlevel 1 exit /b 1
)
echo.
echo Open http://127.0.0.1:4000 in your browser.
echo Keep this window open. Press Ctrl+C to stop the app.
echo.
node backend\scripts\start-local.cjs
