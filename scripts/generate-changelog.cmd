@echo off

REM Changelog Generator for Cinema Control App
REM Creates release notes from git history

setlocal enabledelayedexpansion

if "%1"=="" (
    echo ERROR: Version number required!
    echo Usage: scripts\generate-changelog.cmd x.x.x
    exit /b 1
)

set VERSION=%~1

echo Generating changelog for version %VERSION%...
echo.

REM Get all commits since last release (or from beginning if no previous releases)
git log --pretty=format:"* %%h %%s" --date=short --since="2026-07-31" > changelog.tmp

if errorlevel 1 (
    echo ERROR: Failed to generate changelog!
    exit /b 1
)

REM Format the changelog
echo. > "%~dp0..\docs\CHANGELOG.md"
echo # Cinema Control App Changelog >> "%~dp0..\docs\CHANGELOG.md"  
echo. >> "%~dp0..\docs\CHANGELOG.md"
echo ## Version %VERSION% - %date% >> "%~dp0..\docs\CHANGELOG.md"
echo. >> "%~dp0..\docs\CHANGELOG.md"

REM Add release date and version info
echo **Release Date:** %date% >> "%~dp0..\docs\CHANGELOG.md"
echo "**Version:** %VERSION%" >> "%~dp0..\docs\CHANGELOG.md"
echo. >> "%~dp0..\docs\CHANGELOG.md"

REM Read git log output
set first=1
for /f "delims=" %%L in (changelog.tmp) do (
    if !first! equ 0 (
        echo. >> "%~dp0..\docs\CHANGELOG.md"
    )
    set first=0
    
    REM Parse commit hash and message
    for /f "tokens=1,*" %%A in ("%%L") do (
        echo - Commit %%A: %%B >> "%~dp0..\docs\CHANGELOG.md"
    )
)

echo. >> "%~dp0..\docs\CHANGELOG.md"

REM Clean up temp file
del changelog.tmp

echo Changelog generated successfully!
echo Location: docs/CHANGELOG.md

endlocal