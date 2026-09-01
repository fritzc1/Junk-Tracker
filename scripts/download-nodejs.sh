#!/bin/bash

# Script to download portable Node.js binaries based on platform
# This script is used by both Install.cmd and Install.sh scripts

set -e  # Exit immediately if a command exits with a non-zero status

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load release manifest
RELEASE_MANIFEST="${SCRIPT_DIR}/../release-manifest.json"

if [ ! -f "$RELEASE_MANIFEST" ]; then
    echo -e "${RED}Error: release-manifest.json not found at ${RELEASE_MANIFEST}${NC}"
    exit 1
fi

# Determine platform-specific information
detect_platform() {
    local OS_TYPE=$(uname -s)
    local ARCH=$(uname -m)
    
    case "$OS_TYPE" in
        "Darwin")
            echo "macos"
            ;;
        "Linux")
            echo "linux"
            ;;
        "Windows"|"MINGW"*|"MSYS"*|"CYGWIN"*)
            echo "windows"
            ;;
        *)
            echo -e "${RED}Unsupported operating system: ${OS_TYPE}${NC}"
            exit 1
            ;;
    esac
}

detect_architecture() {
    local ARCH=$(uname -m)
    
    case "$ARCH" in
        "x86_64")
            echo "x64"
            ;;
        "arm64"|"aarch64")
            echo "arm64"
            ;;
        *)
            echo -e "${RED}Unsupported architecture: ${ARCH}${NC}"
            exit 1
            ;;
    esac
}

# Get Node.js version from manifest
get_nodejs_version() {
    local PLATFORM=$1
    local ARCH=$2
    
    NODE_VERSION=$(jq -r ".dependencies.nodejs.version" "$RELEASE_MANIFEST")
    
    # Find the matching platform and architecture
    DOWNLOADED=0
    jq -c ".dependencies.nodejs.platforms[]" "$RELEASE_MANIFEST" | while read -r PLATFORM_CONFIG; do
        PLATFORM_OS=$(echo "$PLATFORM_CONFIG" | jq -r ".os")
        PLATFORM_ARCH=$(echo "$PLATFORM_CONFIG" | jq -r ".arch")
        
        if [ "$PLATFORM_OS" == "$PLATFORM" ] && [ "$PLATFORM_ARCH" == "$ARCH" ]; then
            DOWNLOAD_URL=$(echo "$PLATFORM_CONFIG" | jq -r ".downloadUrl")
            
            if [ -n "$DOWNLOAD_URL" ]; then
                echo "${NODE_VERSION}|${DOWNLOAD_URL}"
                DOWNLOADED=1
                break
            fi
        fi
    done
    
    if [ $DOWNLOADED -eq 0 ]; then
        echo -e "${RED}Error: No download URL found for ${PLATFORM}/${ARCH}${NC}"
        exit 1
    fi
}

# Verify checksum (returns 0 if checksum is null or matches, returns 1 if mismatch)
verify_checksum() {
    local FILE=$1
    local EXPECTED_SHA256=$2
    
    # If checksum is null or empty, skip verification (for development/testing)
    if [ -z "$EXPECTED_SHA256" ] || [ "$EXPECTED_SHA256" == "null" ]; then
        echo -e "${YELLOW}Checksum not provided in manifest, skipping verification${NC}"
        return 0
    fi
    
    # Calculate the SHA256 hash of the downloaded file
    if command -v sha256sum &> /dev/null; then
        ACTUAL_SHA256=$(sha256sum "$FILE" | cut -d' ' -f1)
    elif command -v shasum &> /dev/null; then
        # macOS uses different syntax for shasum
        ACTUAL_SHA256=$(shasum -a 256 "$FILE" | cut -d' ' -f1)
    else
        echo -e "${YELLOW}Warning: No checksum verification tool found${NC}"
        return 0
    fi
    
    if [ "$ACTUAL_SHA256" == "$EXPECTED_SHA256" ]; then
        echo -e "${GREEN}Checksum verified successfully${NC}"
        return 0
    else
        echo -e "${RED}Error: Checksum mismatch! Expected ${EXPECTED_SHA256}, got ${ACTUAL_SHA256}${NC}"
        rm -f "$FILE"
        exit 1
    fi
}

# Download Node.js based on platform
download_nodejs() {
    local PLATFORM=$1
    local ARCH=$2
    
    echo -e "${YELLOW}Detecting platform: ${PLATFORM}/${ARCH}${NC}"
    
    # Get version and download URL from manifest
    IFS='|' read -r NODE_VERSION DOWNLOAD_URL <<< "$(get_nodejs_version $PLATFORM $ARCH)"
    
    if [ -z "$NODE_VERSION" ] || [ -z "$DOWNLOAD_URL" ]; then
        echo -e "${RED}Error: Could not determine Node.js version or download URL${NC}"
        exit 1
    fi
    
    # Create output directory
    local NODE_DIR="${SCRIPT_DIR}/../nodejs-${PLATFORM}-${ARCH}-${NODE_VERSION}"
    
    if [ -d "$NODE_DIR" ]; then
        echo -e "${YELLOW}Node.js already downloaded for ${PLATFORM}/${ARCH}${NC}"
        return 0
    fi
    
    # Download the file
    local DOWNLOAD_FILE="${SCRIPT_DIR}/tmp-nodejs-${PLATFORM}-${ARCH}.tar.gz"
    
    echo -e "${YELLOW}Downloading Node.js v${NODE_VERSION} for ${PLATFORM}/${ARCH}...${NC}"
    echo "From: $DOWNLOAD_URL"
    
    if command -v curl &> /dev/null; then
        curl -L "$DOWNLOAD_URL" -o "$DOWNLOAD_FILE"
    elif command -v wget &> /dev/null; then
        wget "$DOWNLOAD_URL" -O "$DOWNLOAD_FILE"
    else
        echo -e "${RED}Error: No download tool found (curl or wget required)${NC}"
        exit 1
    fi
    
    # Get expected checksum from manifest
    local EXPECTED_SHA256=$(jq -r ".dependencies.nodejs.platforms[] | select(.os==\"$PLATFORM\" and .arch==\"$ARCH\") | .checksum" "$RELEASE_MANIFEST")
    
    echo -e "${YELLOW}Verifying checksum...${NC}"
    verify_checksum "$DOWNLOAD_FILE" "$EXPECTED_SHA256"
    
    # Extract the file
    local EXTRACT_DIR="${SCRIPT_DIR}/../nodejs-${PLATFORM}-${ARCH}-${NODE_VERSION}"
    mkdir -p "$EXTRACT_DIR"
    
    echo -e "${YELLOW}Extracting Node.js...${NC}"
    tar -xzf "$DOWNLOAD_FILE" -C "$EXTRACT_DIR"
    
    # Clean up
    rm -f "$DOWNLOAD_FILE"
    
    echo -e "${GREEN}Node.js v${NODE_VERSION} downloaded and extracted successfully to ${EXTRACT_DIR}${NC}"
}

# Main execution
PLATFORM=$(detect_platform)
ARCH=$(detect_architecture)

download_nodejs $PLATFORM $ARCH