@echo off
echo Starting WhoRU Chat Application...
echo.

echo [1/2] Starting Backend Server...
start "Backend Server" cmd /k "cd server && npm start"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Client...
start "Frontend Client" cmd /k "cd client && npm start"

echo.
echo ✅ Both servers are starting!
echo.
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Press any key to exit this window...
pause >nul
