@echo off
setlocal enableextensions

REM Start-all: sets up external venv (if needed), starts Docling service detached, launches Vite dev, and opens browser.
REM Requirements: Windows CMD; Node.js 18+; PowerShell available; Python 3.10+ installed.

set VENV=C:\docling-venv
set PS=powershell -NoProfile -ExecutionPolicy Bypass -Command

REM Determine project root (this file is in scripts\)
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set ROOT=%%~fI

REM 1) Ensure external venv exists and is populated
if not exist "%VENV%\Scripts\python.exe" (
  echo [setup] External venv not found. Creating at %VENV% ...
  %PS% "& '%ROOT%\scripts\setup-external-venv.ps1' -VenvPath '%VENV%'" || goto :fail
) else (
  echo [setup] External venv found at %VENV%.
)

REM 2) Start Docling service (detached)
%PS% "& '%ROOT%\scripts\run-docling-detached.ps1' -BindHost 127.0.0.1 -BindPort 8008 -VenvPath '%VENV%'"
if errorlevel 1 (
  echo [warn] Docling failed to start. The frontend will still open; check scripts\logs\*.err.log and retry.
)

REM 3) Start Vite dev in a new window
pushd "%ROOT%"
start "vite" cmd /c npm run dev
popd

REM 4) Open the app in the default browser
start "" http://localhost:5173/

REM 5) Optional: print a quick health check instruction
echo.
echo [info] Docling health: http://127.0.0.1:8008/health  (should return {"status":"ok"})
echo [info] If the app says "Docling Offline", open DevTools (F12) and run:
echo        localStorage.setItem('docling_endpoint','http://127.0.0.1:8008')
echo.
echo [done] Frontend opened. If Docling shows offline, check logs and run again:
echo        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-docling-detached.ps1 -VenvPath '%VENV%'
exit /b 0

:fail
echo [error] Startup failed. Check logs under scripts\logs and try again.
exit /b 1
@echo off
setlocal enableextensions

REM Start-all: sets up external venv (if needed), starts Docling service detached, launches Vite dev, and opens browser.
REM Requirements: Git Bash or Windows CMD; Node.js 18+; PowerShell available; Python 3.10+ installed.

set VENV=C:\docling-venv
set PS=powershell -NoProfile -ExecutionPolicy Bypass -Command

REM Determine project root (this file is in scripts\)
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set ROOT=%%~fI

REM 1) Ensure external venv exists and is populated
if not exist "%VENV%\Scripts\python.exe" (
  echo [setup] External venv not found. Creating at %VENV% ...
  %PS% "& '%ROOT%\scripts\setup-external-venv.ps1' -VenvPath '%VENV%'" || goto :fail
) else (
  echo [setup] External venv found at %VENV%.
)

REM 2) Start Docling service (detached)
%PS% "& '%ROOT%\scripts\run-docling-detached.ps1' -BindHost 127.0.0.1 -BindPort 8008 -VenvPath '%VENV%'" || goto :fail

REM 3) Start Vite dev in a new window
pushd "%ROOT%"
start "vite" cmd /c npm run dev
popd

REM 4) Open the app in the default browser
start "" http://localhost:5173/

REM 5) Optional: print a quick health check instruction
echo.
echo [info] Docling health: http://127.0.0.1:8008/health  (should return {"status":"ok"})
echo [info] If the app says "Docling Offline", open DevTools (F12) and run:
echo        localStorage.setItem('docling_endpoint','http://127.0.0.1:8008')
echo.
echo [done] All set. Close this window if not needed.
exit /b 0

:fail
echo [error] Startup failed. Check logs under scripts\logs and try again.
exit /b 1
