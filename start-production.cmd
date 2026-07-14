@echo off
setlocal
cd /d "%~dp0"
title Alaslee Operations Studio - Production
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-production.ps1" -EnvironmentFile ".env"
if errorlevel 1 pause
exit /b %ERRORLEVEL%
