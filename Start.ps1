# --------------------------------------------------------------------------
# Start script for Junk Tracker (Windows).
#
# Usage:
#   .\Start.ps1                # Development mode (backend + frontend)
#   .\Start.ps1 --production   # Build frontend, then run backend in production
#   .\Start.ps1 --debug        # Development mode with Node inspector
# --------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition

Set-Location $ScriptRoot

$productionMode = $false
$debugMode      = $false

# Parse arguments (order-independent)
foreach ($arg in $args) {
    switch ($arg) {
        '--production' { $productionMode = $true }
        { $_ -in '-d', '--debug' } { $debugMode = $true }
    }
}

# Auto-detect production mode: if frontend source does not exist, force production mode.
# In release packages, the frontend is pre-built and there is no package.json.
if (-not (Test-Path (Join-Path $ScriptRoot 'frontend\package.json'))) {
    $productionMode = $true
}

Write-Host '============================================'
Write-Host 'Junk Tracker — Start Script (Win)'
Write-Host '============================================'
Write-Host ''

# --- MongoDB -----------------------------------------------------------

Push-Location (Join-Path $ScriptRoot 'MongoDB')
try {
    Write-Host "MongoDB Server directory: $(Get-Location)"
    Write-Host 'Starting MongoDB Local instance...'

    Start-Process powershell -ArgumentList "-NoExit", "-Command",
        "& { Set-Location '$PWD'; .\bin\mongod.exe --dbpath `".\data\db`" }"

    Write-Host '[OK] MongoDB started.'
} catch {
    Write-Host "[ERROR] Failed to start MongoDB: $_"
    exit 1
} finally {
    Pop-Location
}

# --- Node.js Backend ---------------------------------------------------

Push-Location (Join-Path $ScriptRoot 'backend')
try {
    Write-Host "NodeJS Backend directory: $(Get-Location)"

    if ($productionMode) {
        # Only build the frontend if the source exists (development installation).
        # In release packages, the frontend is pre-built and already in the output directory.
        if (Test-Path (Join-Path $ScriptRoot 'frontend\package.json')) {
            Write-Host 'Building React frontend for production...'
            Push-Location (Join-Path $ScriptRoot 'frontend')
            try {
                npm run build
                if ($LASTEXITCODE -ne 0) {
                    Write-Host '[ERROR] Failed to build React frontend!'
                    exit 1
                }
                Write-Host '[OK] React frontend built.'
            } catch {
                Write-Host "[ERROR] Failed to build React frontend: $_"
                exit 1
            } finally {
                Pop-Location
            }
        } else {
            Write-Host '[INFO] Skipping frontend build — pre-built release detected (no frontend/package.json).'
        }

        Write-Host 'Starting Node backend in PRODUCTION mode (single process)...'
        $env:JUNK_TRACKER_ROOT = Join-Path $ScriptRoot '.'
        $env:NODE_ENV = 'production'

        Start-Process powershell -ArgumentList "-NoExit", "-Command",
            "& { Set-Location '$PWD'; npm start }"

    } elseif ($debugMode) {
        Write-Host 'Node backend started with --inspect for debugging in browser:'
        Write-Host '  chrome://inspect/#devices'
        Start-Process powershell -ArgumentList "-NoExit", "-Command",
            "& { Set-Location '$PWD'; npm run debugserver }"

    } else {
        Write-Host 'Starting Node backend in DEVELOPMENT mode...'
        Start-Process powershell -ArgumentList "-NoExit", "-Command",
            "& { Set-Location '$PWD'; npm start }"
    }

    Write-Host '[OK] Node backend started.'
} catch {
    Write-Host "[ERROR] Failed to start Node backend: $_"
    exit 1
} finally {
    Pop-Location
}

# --- React Frontend ----------------------------------------------------

Push-Location (Join-Path $ScriptRoot 'frontend')
try {
    Write-Host "React Frontend directory: $(Get-Location)"

    if ($productionMode) {
        Write-Host 'React frontend is served directly by the Node.js backend in PRODUCTION mode (no separate Vite process)...'
    } else {
        Write-Host 'Starting React frontend in DEVELOPMENT mode...'
        Start-Process powershell -ArgumentList "-NoExit", "-Command",
            "& { Set-Location '$PWD'; npm start }"
        Write-Host '[OK] React frontend started.'
    }
} catch {
    Write-Host "[ERROR] Failed to start React frontend: $_"
    exit 1
} finally {
    Pop-Location
}

Write-Host ''
Write-Host '============================================'
Write-Host 'All services started!'
Write-Host '============================================'
