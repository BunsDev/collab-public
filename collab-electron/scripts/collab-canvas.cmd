@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0collab-canvas.ps1" %*
exit /b %ERRORLEVEL%
