@echo off
echo Starting Nexis application...
echo.

REM Start backend server
echo Starting backend server...
start cmd /k "cd /d %~dp0backend && npm start"

REM Wait a moment for backend to start
timeout /t 3 /nobreak > nul

REM Start frontend server
echo Starting frontend server...
start cmd /k "cd /d %~dp0frontend && npx http-server -p 8080"

echo.
echo Nexis is now running!
echo - Backend: http://localhost:3001
echo - Frontend: http://localhost:8080
echo.
echo Press any key to stop all servers...
pause > nul

REM Close all node processes
taskkill /f /im node.exe > nul 2>&1
taskkill /f /im http-server.exe > nul 2>&1

echo All servers stopped.
