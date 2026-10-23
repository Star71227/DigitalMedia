@echo off
REM 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
setlocal
cd /d "%~dp0"
title Restart LearnMate
echo ================================================
echo   Restarting LearnMate web services
echo ================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local-app.ps1" -Restart -Open
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" echo [OK] Student 5173, teacher 5174, backend 5800 are ready.
if not "%RC%"=="0" echo [FAILED] Check logs in .local-runtime\logs
echo.
pause
exit /b %RC%
