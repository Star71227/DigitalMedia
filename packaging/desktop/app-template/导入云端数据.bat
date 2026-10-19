@echo off
REM 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
setlocal
cd /d "%~dp0"
if not exist "%~dp0scripts\import-cloud-seed.ps1" (
  echo [LearnMate] scripts\import-cloud-seed.ps1 not found. Please re-install the package.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\import-cloud-seed.ps1" %*
echo.
pause
endlocal
