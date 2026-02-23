@echo off
REM DWT Price Center - Server Startup (Double-click to run)
REM 재부팅 후 이 파일을 더블클릭하면 모든 서비스가 시작됩니다.
title DWT Price Center - Starting...
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
echo.
echo Press any key to close...
pause >nul
