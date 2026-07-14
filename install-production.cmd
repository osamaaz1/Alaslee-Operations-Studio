@echo off
setlocal
cd /d "%~dp0"
title Alaslee Operations Studio - Production Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-production-windows.ps1" -EnvironmentFile "%~dp0.env"
set "INSTALL_EXIT_CODE=%ERRORLEVEL%"
if not "%INSTALL_EXIT_CODE%"=="0" pause
exit /b %INSTALL_EXIT_CODE%
