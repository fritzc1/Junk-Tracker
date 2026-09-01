@echo off

REM GitHub Release Creator for Cinema Control App
REM Creates GitHub releases with all assets and changelog

setlocal enabledelayedexpansion

if not exist "release\release-manifest.json" (
    echo ERROR: Release manifest not found!
    exit /b 1
)

if not exist "GITHUB_TOKEN" (
    echo ERROR: GITHUB_TOKEN environment variable not set!
    echo Please set your GitHub personal access token in the environment.
    exit /b 1
)

REM Get version from manifest
for /f "tokens=2 delims=:, " %%V in ('findstr "version" "release\release-manifest.json"') do (
    set VERSION=%%~nV
)

set TAG=v%VERSION%

echo Creating GitHub release for version %TAG%...
echo.

REM Generate changelog
call scripts\generate-changelog.cmd %VERSION%
if errorlevel 1 (
    echo ERROR: Failed to generate changelog!
    exit /b 1
)

echo Changelog generated successfully!
echo.

REM Create release on GitHub using curl (requires GitHub token)
curl -X POST ^
  -H "Authorization: token %GITHUB_TOKEN%" ^
  -H "Accept: application/vnd.github.v3+json" ^
  https://api.github.com/repos/fritzc1/Cinema-Control-App/releases ^
  -d "{\"tag_name\":\"%TAG%\",\"target_commitish\":\"install-update-process\",\"name\":\"Version %VERSION%\",\"body\":\"%changelog%\",\"draft\":false,\"prerelease\":false}"

if errorlevel 1 (
    echo ERROR: Failed to create GitHub release!
    exit /b 1
)

echo.
echo Release created successfully on GitHub!
echo.

REM Upload assets (ZIP files)
for %%F in ("release\Cinema-Control-App-Windows-%VERSION%.zip" "release\Cinema-Control-App-Mac-%VERSION%.zip" "release\Cinema-Control-App-Linux-%VERSION%.zip") do (
    if exist "%%F" (
        echo Uploading %%~nxF...
        
        REM Get file size
        for %%G in ("%%F") do set FILESIZE=%%~zG
        
        REM Upload asset to GitHub
        curl -X POST ^
          --data-binary @"%%F" ^
          -H "Authorization: token %GITHUB_TOKEN%" ^
          -H "Content-Type: application/zip" ^
          -H "Content-Length: !FILESIZE!" ^
          https://uploads.github.com/repos/fritzc1/Cinema-Control-App/releases/%RELEASE_ID%/assets?name=%%~nxF
          
        if errorlevel 1 (
            echo ERROR: Failed to upload %%~nxF!
        ) else (
            echo Successfully uploaded %%~nxF!
        )
    ) else (
        echo Warning: %%F not found, skipping upload.
    )
)

echo.
echo All assets uploaded successfully!

endlocal