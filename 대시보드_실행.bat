@echo off
cd /d "%~dp0"
echo Starting INVENI dashboard...
start "INVENI Dashboard Server" /min cmd /c "node server.js"
timeout /t 3 /nobreak >nul
start "" http://localhost:8787
echo.
echo Server is running in the background window (keep it open for auto-refresh).
echo To stop it, close the "INVENI Dashboard Server" window.
echo.
pause
