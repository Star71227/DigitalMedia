@echo off
REM 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-preserve-local.ps1"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo Sync stopped. Your recovery backup is retained.
pause
exit /b %RC%
