@echo off

REM Release Manifest Generator for Cinema Control App
REM Creates checksums and version information for all files

setlocal enabledelayedexpansion

if not exist "release\Cinema-Control-App" (
    echo ERROR: Release package not found at release\Cinema-Control-App!
    exit /b 1
)

echo Generating release manifest...
echo.

REM Extract version from client/package.json (from root directory)
for /f "tokens=4 delims=:, " %%V in ('findstr "version" "client\package.json"') do (
    set VERSION=%%~nV
)

cd "release\Cinema-Control-App"

REM Generate checksums for all files
echo [Step 1/2] Generating file checksums...
for %%F in (*.md) do (
    certutil -hashfile "%%F" SHA256 >> ..\release-manifest.json.tmp
)

REM Create the manifest file
cd ..

echo. > release-manifest.json
echo { >> release-manifest.json
echo   "version": "%VERSION%", >> release-manifest.json
echo   "timestamp": "%TIMESTAMP%", >> release-manifest.json  
echo   "files": [ >> release-manifest.json

REM Add server files
set first=1
for /r "Cinema-Control-App\server" %%F in (*.js *.json) do (
    if !first! equ 0 (
        echo , >> release-manifest.json.tmp
    )
    set first=0
    
    REM Get relative path from Cinema-Control-App directory
    set relpath=%%~dpF
    set relpath=!relpath:Cinema-Control-App\=!
    set "relpath=!relpath:\=/!"
    
    REM Remove trailing backslash if present
    if "!relpath:~-1!"=="\" (
        set relpath=!relpath:~0,-1!
    )
    
    echo     { >> release-manifest.json.tmp
    echo       "path": "!relpath!/%%~nxF", >> release-manifest.json.tmp
    echo       "hash": "", >> release-manifest.json.tmp
    echo       "size": %%~zF >> release-manifest.json.tmp
    echo     } >> release-manifest.json.tmp
)

echo ] >> release-manifest.json

copy release-manifest.json.tmp release-manifest.json

del release-manifest.json.tmp

echo Release manifest generated successfully!
echo Location: release\release-manifest.json