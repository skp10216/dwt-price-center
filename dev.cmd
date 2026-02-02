@echo off
REM DWT Price Center - 개발 스크립트 래퍼
REM 사용법: dev [command] [target] [extra]
powershell -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
