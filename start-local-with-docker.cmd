@echo off
setlocal
cd /d "%~dp0"
title Alaslee Operations Studio - Full CRM

where node.exe >nul 2>nul || goto :missing_setup
where docker.exe >nul 2>nul || goto :missing_setup
if not exist ".env" goto :missing_setup
if not exist "node_modules" goto :missing_setup

docker info >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" /min "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  echo Waiting for Docker Desktop...
  for /l %%I in (1,1,48) do (
    docker info >nul 2>nul && goto :docker_ready
    timeout /t 5 /nobreak >nul
  )
  echo Docker Desktop did not start. Open it manually and try again.
  pause
  exit /b 1
)

:docker_ready
call npm.cmd run crm:db:up || goto :failed
call npm.cmd run crm:migrate || goto :failed
echo.
echo Starting Alaslee Operations Studio with the full CRM database...
set "NODE_ENV=development"
set "CRM_SECURE_COOKIE=false"
set "CRM_LOGIN_RATE_LIMIT_DISABLED=true"
set "LOCAL_DEV_CLIENT_ORIGIN=http://localhost:5173"
echo Open http://localhost:5173
echo Press Ctrl+C here to stop the application.
call npm.cmd run dev
exit /b %ERRORLEVEL%

:missing_setup
echo Full CRM setup is incomplete. Run setup-windows.cmd first.
pause
exit /b 1

:failed
echo A startup step failed. Review the message above.
pause
exit /b 1
