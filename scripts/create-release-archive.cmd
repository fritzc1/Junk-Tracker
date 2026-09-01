@echo off

REM Release Archive Creator for Cinema Control App
REM Creates ZIP files for Windows, Mac, and Linux distributions

setlocal enabledelayedexpansion

if not exist "release\release-manifest.json" (
    echo ERROR: Release manifest not found!
    exit /b 1
)

echo Creating distributable archives...
echo.

cd release

REM Get version from manifest (need to parse it)
for /f "tokens=2 delims=:, " %%V in ('findstr "version" "release-manifest.json"') do (
    set VERSION=%%~nV
)

echo Version: %VERSION%
echo.

REM Create Windows archive
echo [1/3] Creating Windows archive...
if exist "Cinema-Control-App-Windows-%VERSION%.zip" del "Cinema-Control-App-Windows-%VERSION%.zip"
7za a -tzip "Cinema-Control-App-Windows-%VERSION%.zip" "Cinema-Control-App\*" > nul

REM Create Mac archive (excluding Windows-specific files)
echo [2/3] Creating Mac archive...
xcopy "Cinema-Control-App\*" "temp-mac\" /E /I /Y
del "temp-mac\Start.cmd"
del "temp-mac\runnpmi.cmd"
7za a -tzip "Cinema-Control-App-Mac-%VERSION%.zip" "temp-mac\*" > nul
rmdir /s /q temp-mac

REM Create Linux archive (excluding Windows-specific files)
echo [3/3] Creating Linux archive...
xcopy "Cinema-Control-App\*" "temp-linux\" /E /I /Y
del "temp-linux\Start.cmd"
del "temp-linux\runnpmi.cmd"
7za a -tzip "Cinema-Control-App-Linux-%VERSION%.zip" "temp-linux\*" > nul
rmdir /s /q temp-linux

echo.
echo Archives created successfully!
echo   - Cinema-Control-App-Windows-%VERSION%.zip
echo   - Cinema-Control-App-Mac-%VERSION%.zip  
echo   - Cinema-Control-App-Linux-%VERSION%.zip
echo.

endlocal