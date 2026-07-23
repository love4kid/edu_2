@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo INVENI 그룹 통합 기업현황 대시보드를 시작합니다...
start "INVENI Dashboard Server" /min cmd /c "node server.js"
timeout /t 3 /nobreak >nul
start "" http://localhost:8787
echo.
echo 서버가 백그라운드 창에서 실행 중입니다 (자동 갱신을 위해 계속 켜두세요).
echo 종료하려면 작업 표시줄의 "INVENI Dashboard Server" 창을 닫으세요.
echo.
pause
