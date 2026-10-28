@echo off
setlocal
title FLORA

cd /d "%~dp0fingertip-bloom"

if not exist "server.mjs" (
  echo Server file not found.
  pause
  exit /b 1
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  pause
  exit /b 1
)

netstat -ano | findstr /C:":5173 " | findstr /C:"LISTENING" >nul
if not errorlevel 1 (
  start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process 'http://localhost:5173/'"
  exit /b 0
)

echo Starting FLORA...
echo Keep this window open while viewing the page.
echo Close this window to stop the server.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:5173/'"
node server.mjs

echo.
echo FLORA server stopped.
pause
