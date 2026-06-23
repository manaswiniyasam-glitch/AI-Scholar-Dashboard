@echo off
REM start-dev.bat - One-click launcher for Windows
REM This will prompt for elevation (UAC). Double-click this file to run.

set "SCRIPT_DIR=%~dp0scripts"
set "PS_SCRIPT=%SCRIPT_DIR%\start-dev-windows.ps1"
if not exist "%PS_SCRIPT%" (
  echo Could not find "%PS_SCRIPT%"
  pause
  exit /b 1
)

:: Launch elevated PowerShell and run the script (will prompt UAC)
powershell -Command "Start-Process -FilePath powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%PS_SCRIPT%' -Verb RunAs"
exit /b 0
