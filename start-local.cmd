@echo off
setlocal
cd /d "%~dp0"
title Alaslee Operations Studio - Local

where node.exe >nul 2>nul || goto :missing_setup
if not exist ".env" goto :missing_setup
if not exist "node_modules" goto :missing_setup

echo.
echo Checking native PostgreSQL and CRM migrations...
call npm.cmd run crm:migrate || goto :missing_database
echo.
echo Starting Alaslee Operations Studio with native PostgreSQL (no Docker)...
echo Open http://localhost:5173
echo Press Ctrl+C here to stop the application.
call npm.cmd run dev
exit /b %ERRORLEVEL%

:missing_database
echo.
echo Native PostgreSQL is not ready.
echo Run setup-windows-no-docker.cmd once as Administrator, then try again.
pause
exit /b 1

:missing_setup
echo First-time setup is incomplete.
echo Run setup-windows-no-docker.cmd first.
pause
exit /b 1
