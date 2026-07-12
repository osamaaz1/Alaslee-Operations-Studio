@echo off
setlocal
cd /d "%~dp0"
title Alaslee Operations Studio - Local

where node.exe >nul 2>nul || goto :missing_setup
if not exist ".env" goto :missing_setup
if not exist "node_modules" goto :missing_setup

echo.
echo Starting Alaslee Operations Studio without Docker...
echo Open http://localhost:5173
echo CRM database features require start-local-with-docker.cmd.
echo Press Ctrl+C here to stop the application.
call npm.cmd run dev
exit /b %ERRORLEVEL%

:missing_setup
echo First-time setup is incomplete.
echo Run setup-windows-no-docker.cmd first.
pause
exit /b 1
