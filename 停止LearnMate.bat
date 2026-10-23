@echo off
REM 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
setlocal
cd /d "%~dp0"
title Stop LearnMate
echo ================================================
echo   Stopping LearnMate web services
echo ================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local-app.ps1" -Stop
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
