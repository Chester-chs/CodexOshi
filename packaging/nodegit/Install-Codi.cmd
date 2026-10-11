@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Codi.ps1"
echo.
if errorlevel 1 (
  echo Installation stopped. Read the message above.
) else (
  echo Restart Codex and open a new chat to see Codi.
)
pause
