@echo off
echo =====================================
echo   PDF OCR Pro - Startup Script
echo =====================================
echo.

echo [1/2] Starting Backend Server (port 3001)...
start "Backend Server" cmd /k "cd /d %~dp0 && node server.cjs"
timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend Server (port 5173)...
start "Frontend Server" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ✅ Both servers started!
echo.
echo 🔗 Frontend: http://localhost:5173
echo 🔗 Backend:  http://localhost:3001
echo 🔍 Debug:    http://localhost:3001/api/debug/status
echo.
echo Close the command windows to stop the servers.
echo.
pause
