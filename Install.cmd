@echo off
REM Wrapper script — runs Install.ps1 via PowerShell
powershell -ExecutionPolicy Bypass -File "%~dp0Install.ps1"