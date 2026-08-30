@echo off
REM Wrapper script — runs Start.ps1 via PowerShell, passing through all arguments
powershell -ExecutionPolicy Bypass -File "%~dp0Start.ps1" %*