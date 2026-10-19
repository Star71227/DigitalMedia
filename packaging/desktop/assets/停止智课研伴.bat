@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0scripts\stop-learnmate.ps1" (
  echo [LearnMate] scripts\stop-learnmate.ps1 not found.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-learnmate.ps1" %*
echo.
pause
endlocal
