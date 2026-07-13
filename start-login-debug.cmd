@echo off
setlocal
cd /d "%~dp0"
title Alaslee CRM Login Debug

where node.exe >nul 2>nul || goto :missing_setup
if not exist ".env" goto :missing_setup
if not exist "node_modules" goto :missing_setup
if not exist "diagnostics" mkdir "diagnostics"

set "NODE_ENV=development"
set "CRM_LOGIN_RATE_LIMIT_DISABLED=true"

echo.
echo Starting login diagnostics with PIN throttling disabled...
echo Reproduce the correct-PIN error, then press Ctrl+C.
echo Log: diagnostics\crm-login-debug.log
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& { npm.cmd run dev 2^>^&1 ^| Tee-Object -FilePath '.\diagnostics\crm-login-debug.log' }"
exit /b %ERRORLEVEL%

:missing_setup
echo Setup is incomplete. Confirm .env and node_modules exist.
pause
exit /b 1
