# Script to download portable Node.js binaries based on platform (Windows version)
# This script is used by Install.cmd to ensure we have the correct Node.js version

$ErrorActionPreference = "Stop"  # Stop immediately if a command fails
$ProgressPreference = "SilentlyContinue"

# Colors for output
$RED = "`e[31m"
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$NC = "`e[0m"  # No Color

# Get the directory where this script is located
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# Load release manifest (JSON parsing in PowerShell)
$RELEASE_MANIFEST_PATH = Join-Path $SCRIPT_DIR "..\release-manifest.json"
if (-not (Test-Path $RELEASE_MANIFEST_PATH)) {
    Write-Host "${RED}Error: release-manifest.json not found at $RELEASE_MANIFEST_PATH${NC}" -ForegroundColor Red
    exit 1
}

# Parse JSON using PowerShell's ConvertFrom-Json
$RELEASE_MANIFEST = Get-Content $RELEASE_MANIFEST_PATH | ConvertFrom-Json

# Determine platform-specific information
function Detect-Platform {
    if ($IsWindows) {
        return "windows"
    } elseif ($IsMacOS) {
        return "macos"
    } elseif ($IsLinux) {
        return "linux"
    } else {
        Write-Host "${RED}Unsupported operating system${NC}" -ForegroundColor Red
        exit 1
    }
}

function Detect-Architecture {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture
    switch ($arch) {
        "X64" { return "x64" }
        "Arm64" { return "arm64" }
        default {
            Write-Host "${RED}Unsupported architecture: $arch${NC}" -ForegroundColor Red
            exit 1
        }
    }
}

# Get Node.js version from manifest
function Get-NodeJsVersion {
    param (
        [string]$Platform,
        [string]$Architecture
    )
    
    # Find the matching platform and architecture
    foreach ($platformConfig in $RELEASE_MANIFEST.dependencies.nodejs.platforms) {
        if ($platformConfig.os -eq $Platform -and $platformConfig.arch -eq $Architecture) {
            return @{
                Version = $RELEASE_MANIFEST.dependencies.nodejs.version
                DownloadUrl = $platformConfig.downloadUrl
                Checksum = $platformConfig.checksum
            }
        }
    }
    
    Write-Host "${RED}Error: No download URL found for ${Platform}/${Architecture}${NC}" -ForegroundColor Red
    exit 1
}

# Verify checksum using PowerShell's built-in cmdlets
function Verify-Checksum {
    param (
        [string]$FilePath,
        [string]$ExpectedSha256
    )
    
    $actualSha256 = Get-FileHash -Path $FilePath -Algorithm SHA256 | Select-Object -ExpandProperty Hash
    
    if ($actualSha256 -eq $ExpectedSha256) {
        Write-Host "${GREEN}Checksum verified successfully${NC}" -ForegroundColor Green
        return $true
    } else {
        Write-Host "${RED}Error: Checksum mismatch! Expected ${ExpectedSha256}, got ${actualSha256}${NC}" -ForegroundColor Red
        Remove-Item $FilePath -Force
        return $false
    }
}

# Download Node.js based on platform
function Download-NodeJs {
    param (
        [string]$Platform,
        [string]$Architecture
    )
    
    Write-Host "${YELLOW}Detecting platform: ${Platform}/${Architecture}${NC}" -ForegroundColor Yellow
    
    # Get version and download URL from manifest
    $nodeInfo = Get-NodeJsVersion -Platform $Platform -Architecture $Architecture
    
    if (-not $nodeInfo.Version -or -not $nodeInfo.DownloadUrl) {
        Write-Host "${RED}Error: Could not determine Node.js version or download URL${NC}" -ForegroundColor Red
        exit 1
    }
    
    # Create output directory
    $NODE_DIR = Join-Path $SCRIPT_DIR "..\nodejs-${Platform}-${Architecture}-$($nodeInfo.Version)"
    
    if (Test-Path $NODE_DIR) {
        Write-Host "${YELLOW}Node.js already downloaded for ${Platform}/${Architecture}${NC}" -ForegroundColor Yellow
        return
    }
    
    # Download the file
    $DOWNLOAD_FILE = Join-Path $SCRIPT_DIR "tmp-nodejs-${Platform}-${Architecture}.zip"
    
    Write-Host "${YELLOW}Downloading Node.js v$($nodeInfo.Version) for ${Platform}/${Architecture}...${NC}" -ForegroundColor Yellow
    Write-Host "From: $($nodeInfo.DownloadUrl)"
    
    try {
        # Use PowerShell's Invoke-WebRequest to download the file
        Invoke-WebRequest -Uri $nodeInfo.DownloadUrl -OutFile $DOWNLOAD_FILE
        
        # Get expected checksum from manifest
        $EXPECTED_SHA256 = $nodeInfo.Checksum
        
        Write-Host "${YELLOW}Verifying checksum...${NC}" -ForegroundColor Yellow
        if (-not (Verify-Checksum -FilePath $DOWNLOAD_FILE -ExpectedSha256 $EXPECTED_SHA256)) {
            exit 1
        }
        
        # Extract the file using PowerShell's Expand-Archive
        Write-Host "${YELLOW}Extracting Node.js...${NC}" -ForegroundColor Yellow
        
        # Create target directory if it doesn't exist
        New-Item -ItemType Directory -Path $NODE_DIR -Force | Out-Null
        
        # Extract the archive (handle both .zip and .tar.gz)
        if ($nodeInfo.DownloadUrl -like "*.tar.gz") {
            # For tar.gz files, we'll use 7z if available, otherwise PowerShell's Expand-Archive won't work
            Write-Host "${YELLOW}Note: This is a .tar.gz file. Manual extraction may be required.${NC}" -ForegroundColor Yellow
            
            # Create a simple extraction script for Windows users to handle .tar.gz files manually
            $EXTRACT_SCRIPT = Join-Path $NODE_DIR "extract-nodejs.ps1"
            @"
# Extract Node.js from tar.gz file
# This script will extract the Node.js binaries you downloaded

`$SOURCE_FILE = "$($DOWNLOAD_FILE)"
`$TARGET_DIR = "$($NODE_DIR)"

# Check if 7z is available
if (Test-Path "${env:ProgramFiles}\7-Zip\7z.exe") {
    &"${env:ProgramFiles}\7-Zip\7z.exe" x "`$SOURCE_FILE" -o"`$TARGET_DIR"
} elseif (Get-Command "tar" -ErrorAction SilentlyContinue) {
    tar -xzf "`$SOURCE_FILE" -C "`$TARGET_DIR"
} else {
    Write-Host "${RED}Error: No extraction tool found. Please install 7-Zip or use tar command.${NC}" -ForegroundColor Red
    exit 1
}

Remove-Item "`$SOURCE_FILE"

Write-Host "${GREEN}Node.js extracted successfully to `$TARGET_DIR${NC}" -ForegroundColor Green
"@ | Out-File $EXTRACT_SCRIPT
            
            Write-Host "${YELLOW}Created extraction script at ${EXTRACT_SCRIPT}${NC}" -ForegroundColor Yellow
        } else {
            # For .zip files, use PowerShell's built-in extraction
            Expand-Archive -Path $DOWNLOAD_FILE -DestinationPath $NODE_DIR
            
            Remove-Item $DOWNLOAD_FILE
            
            Write-Host "${GREEN}Node.js v$($nodeInfo.Version) downloaded and extracted successfully to ${NODE_DIR}${NC}" -ForegroundColor Green
        }
    } catch {
        Write-Host "${RED}Error during download: $_${NC}" -ForegroundColor Red
        
        # Clean up partially downloaded file
        if (Test-Path $DOWNLOAD_FILE) {
            Remove-Item $DOWNLOAD_FILE -Force
        }
        
        exit 1
    }
}

# Main execution
try {
    $PLATFORM = Detect-Platform
    $ARCHITECTURE = Detect-Architecture
    
    Download-NodeJs -Platform $PLATFORM -Architecture $ARCHITECTURE
} catch {
    Write-Host "${RED}An error occurred: $_${NC}" -ForegroundColor Red
    exit 1
}