@echo off
setlocal
cd /d "%~dp0"
title Alaslee Operations Studio - First-time setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Setup stopped with exit code %EXIT_CODE%.
  echo Read WINDOWS-11-REQUIREMENTS.md for troubleshooting.
  pause
  exit /b %EXIT_CODE%
)
echo.
pause
