# --------------------------------------------------------------------------
# Automatic Install script for Junk Tracker (Windows).
#
# - Downloads and extracts MongoDB to ./MongoDB/ (skipped if already present)
# - Creates the database directory ./MongoDB/data/db
# - Installs npm dependencies for backend/ and frontend/
# --------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition

Set-Location $ScriptRoot

Write-Host '============================================'
Write-Host 'Junk Tracker — Install Script (Win)'
Write-Host '============================================'
Write-Host ''

# --- Node.js check -------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '[ERROR] Node.js is not installed or not in PATH.'
    Write-Host ''
    Write-Host 'Please install Node.js LTS from https://nodejs.org/'
    Write-Host '  or run: winget install OpenJS.NodeJS.LTS'
    Write-Host ''
    Write-Host 'After installing, re-run this script.'
    Pause
    exit 1
}
$nodeVersion = node --version
Write-Host "[OK] Node.js detected: $nodeVersion"
Write-Host ''

# --- MongoDB -----------------------------------------------------------

if (-not (Test-Path 'MongoDB')) {
    New-Item -ItemType Directory -Path 'MongoDB' | Out-Null
}

if (Test-Path 'MongoDB\bin\mongod.exe') {
    Write-Host '[OK] MongoDB already installed in .\MongoDB\ — skipping download.'
} else {
    Write-Host '[INFO] Downloading MongoDB...'

    $mongoZip = Join-Path $ScriptRoot 'mdb.zip'
    if (Test-Path $mongoZip) { Remove-Item $mongoZip -Force }

    $mongoUrl = 'http://fastdl.mongodb.org/win32/mongodb-win32-x86_64-2012plus-4.2.2.zip'
    Write-Host "[INFO] Downloading from: $mongoUrl"

    # Use Invoke-WebRequest to download MongoDB
    try {
        Invoke-WebRequest -Uri $mongoUrl -OutFile $mongoZip -UseBasicParsing
    } catch {
        Write-Host "[ERROR] Failed to download MongoDB: $_"
        exit 1
    }

    Write-Host '[INFO] Extracting MongoDB...'

    # Remove any leftover versioned MongoDB subdirectories (e.g. mongodb-win32-x86_64-2012plus-4.2.2)
    # from failed previous installs, preserving data/ and other legitimate folders
    if (Test-Path 'MongoDB') {
        Get-ChildItem -Path 'MongoDB' -Directory | Where-Object { $_.Name -match '^mongodb-win32' } | Remove-Item -Recurse -Force
    }

    # MongoDB zip contains a versioned subdirectory (e.g. mongodb-win32-x86_64-2012plus-4.2.2)
    # Extract to a temp folder first, then flatten into ./MongoDB/
    $tmpDir = Join-Path $ScriptRoot 'mdb-tmp'
    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tmpDir | Out-Null

    Expand-Archive -Path $mongoZip -DestinationPath $tmpDir -Force

    # Find the versioned subdirectory (the single folder inside the archive)
    $versionedDir = Get-ChildItem -Path $tmpDir -Directory | Select-Object -First 1

    if (-not $versionedDir) {
        Write-Host '[ERROR] Unexpected MongoDB archive structure — could not find versioned subdirectory.'
        Remove-Item $mongoZip -Force
        Remove-Item $tmpDir -Recurse -Force
        exit 1
    }

    # Move the contents (bin/, README*, THIRDPARTYNOTICES, etc.) up into ./MongoDB/
    Copy-Item -Path (Join-Path $versionedDir.FullName '*') -Destination 'MongoDB\' -Recurse -Force

    # Clean up temp files
    Remove-Item $mongoZip -Force
    Remove-Item $tmpDir -Recurse -Force
    Write-Host '[OK] MongoDB extracted to .\MongoDB\'
}

# Create database data directory
$dbDir = Join-Path $ScriptRoot '.\MongoDB\data\db'
if (-not (Test-Path $dbDir)) {
    New-Item -ItemType Directory -Path $dbDir | Out-Null
    Write-Host '[OK] Created .\MongoDB\data\db'
} else {
    Write-Host '[OK] Database directory already exists — skipping.'
}

Write-Host ''

# --- npm dependencies --------------------------------------------------

Write-Host '[INFO] Installing backend dependencies...'
Push-Location (Join-Path $ScriptRoot 'backend')
try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[ERROR] Failed to install backend dependencies!'
        Pause
        exit 1
    }
    Write-Host '[OK] Backend dependencies installed.'
} catch {
    Write-Host "[ERROR] Failed to install backend dependencies: $_"
    Pause
    exit 1
} finally {
    Pop-Location
}

Write-Host ''

# Only install frontend dependencies if the frontend source exists (development mode).
# In release packages, the frontend is pre-built — no package.json present.
if (Test-Path (Join-Path $ScriptRoot 'frontend\package.json')) {
    Write-Host '[INFO] Installing frontend dependencies...'
    Push-Location (Join-Path $ScriptRoot 'frontend')
    try {
        npm install --legacy-peer-deps
        if ($LASTEXITCODE -ne 0) {
            Write-Host '[ERROR] Failed to install frontend dependencies!'
            Pause
            exit 1
        }
        Write-Host '[OK] Frontend dependencies installed.'
    } catch {
        Write-Host "[ERROR] Failed to install frontend dependencies: $_"
        Pause
        exit 1
    } finally {
        Pop-Location
    }
} else {
    Write-Host '[INFO] Skipping frontend install — pre-built release detected (no frontend/package.json).'
}

Write-Host ''
Write-Host '============================================'
Write-Host 'Installation complete!'
Write-Host 'Run Start.ps1 to launch the app in dev mode.'
Write-Host '============================================'
Pause
