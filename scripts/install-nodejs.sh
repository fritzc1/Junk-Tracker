#!/bin/bash

# Comprehensive installation script that combines downloading, extracting, and configuring Node.js
# This script is called by Install.cmd and Install.sh scripts

set -e  # Exit immediately if a command exits with a non-zero status

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load release manifest (using jq for JSON parsing)
RELEASE_MANIFEST="${SCRIPT_DIR}/../release-manifest.json"

if [ ! -f "$RELEASE_MANIFEST" ]; then
    echo -e "${RED}Error: release-manifest.json not found at ${RELEASE_MANIFEST}${NC}"
    exit 1
fi

# Check prerequisites before proceeding
check_prerequisites() {
    local MISSING_TOOLS=()
    
    # Check for essential tools
    local REQUIRED_TOOLS=("curl" "wget" "jq")
    
    for TOOL in "${REQUIRED_TOOLS[@]}"; do
        if ! command -v "$TOOL" &> /dev/null; then
            echo -e "${YELLOW}Warning: ${TOOL} not found${NC}"
            MISSING_TOOLS+=("$TOOL")
        fi
    done
    
    # Check Node.js version (if already installed)
    local CURRENT_NODE_VERSION=""
    if command -v node &> /dev/null; then
        CURRENT_NODE_VERSION=$(node --version | sed 's/^v//')
        echo -e "${YELLOW}Current system Node.js version: ${CURRENT_NODE_VERSION}${NC}"
        
        # Check if we need to use bundled Node.js
        local MIN_NODE_VERSION=$(jq -r ".build.nodeMinVersion" "$RELEASE_MANIFEST")
        if [[ "$(printf '%s\n' "$MIN_NODE_VERSION" "$CURRENT_NODE_VERSION" | sort -V | head -n1)" != "$MIN_NODE_VERSION" ]]; then
            echo -e "${RED}Error: System Node.js version ${CURRENT_NODE_VERSION} is below minimum required ${MIN_NODE_VERSION}${NC}"
        fi
    else
        echo -e "${YELLOW}No system Node.js found, will use bundled version${NC}"
    fi
    
    if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
        echo -e "${RED}Missing tools: ${MISSING_TOOLS[*]}${NC}"
        exit 1
    fi
    
    # Check available disk space
    local AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}')
    if [[ "$AVAILABLE_SPACE" =~ ^[0-9]+ ]]; then
        local SPACE_MB=$AVAILABLE_SPACE
        local REQUIRED_SPACE=500  # MB
        
        if [ $SPACE_MB -lt $REQUIRED_SPACE ]; then
            echo -e "${RED}Error: Only ${SPACE_MB}MB available, need at least ${REQUIRED_SPACE}MB${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}Available disk space: ${AVAILABLE_SPACE}${NC}"
    fi
    
    # Create Node.js directory if it doesn't exist
    local NODE_DIR="${SCRIPT_DIR}/../nodejs"
    
    if [ ! -d "$NODE_DIR" ]; then
        mkdir -p "$NODE_DIR"
    fi
}

# Main execution with error handling
install_nodejs() {
    echo -e "${GREEN}Starting Node.js installation...${NC}"
    check_prerequisites
    
    # Source the download script and run it
    source "${SCRIPT_DIR}/download-nodejs.sh" || {
        echo -e "${RED}Error: Failed to source download-nodejs.sh${NC}"
        exit 1
    }
    
    # Set up Node.js path for subsequent npm commands
    echo -e "${YELLOW}Setting up Node.js environment...${NC}"
    
    local PLATFORM=$(detect_platform)
    local ARCH=$(detect_architecture)
    local NODE_VERSION=$(jq -r ".dependencies.nodejs.version" "$RELEASE_MANIFEST")
    
    local NODE_DIR_PATH="${SCRIPT_DIR}/../nodejs-${PLATFORM}-${ARCH}-${NODE_VERSION}"
    
    if [ ! -d "$NODE_DIR_PATH" ]; then
        echo -e "${RED}Error: Node.js not downloaded. Run download-nodejs.sh first.${NC}"
        install_nodejs() {
            echo -e "${GREEN}Starting Node.js installation...${NC}"
            check_prerequisites
            
            # Source the download script and run it
            source "${SCRIPT_DIR}/download-nodejs.sh" || {
                echo -e "${RED}Error: Failed to source download-nodejs.sh${NC}"
                exit 1
            }
            
            # Set up Node.js path for subsequent npm commands
            echo -e "${YELLOW}Setting up Node.js environment...${NC}"
            
            local PLATFORM=$(detect_platform)
            local ARCH=$(detect_architecture)
            local NODE_VERSION=$(jq -r ".dependencies.nodejs.version" "$RELEASE_MANIFEST")
            
            local NODE_DIR_PATH="${SCRIPT_DIR}/../nodejs-${PLATFORM}-${ARCH}-${NODE_VERSION}"
            
            if [ ! -d "$NODE_DIR_PATH" ]; then
                echo -e "${RED}Error: Node.js not downloaded. Run download-nodejs.sh first.${NC}"
                exit 1
            fi
            
            # Add Node.js to PATH temporarily for this session
            export NODE_HOME="${NODE_DIR_PATH}/bin"
            export PATH="${NODE_HOME}:${PATH}"
            
            echo -e "${GREEN}Node.js path set up successfully${NC}"
            echo "Node Home: ${NODE_HOME}"
            echo "Updated PATH: ${PATH}"
            
            # Test Node.js and npm
            if command -v node &> /dev/null; then
                local NODE_VERSION_INSTALLED=$(node --version)
                echo -e "${GREEN}Node version: ${NODE_VERSION_INSTALLED}${NC}"
                
                if command -v npm &> /dev/null; then
                    local NPM_VERSION_INSTALLED=$(npm --version)
                    echo -e "${GREEN}Npm version: ${NPM_VERSION_INSTALLED}${NC}"
                    
                    # Verify both are working
                    node -e "console.log('Node is working')"
                    npm config get registry > /dev/null
                    
                    return 0
                else
                    echo -e "${RED}Error: npm not found in bundled Node.js${NC}"
                    exit 1
                fi
            else
                echo -e "${RED}Error: node command not found${NC}"
                exit 1
            fi
            
            # Create a setup script for the current shell session
            local SETUP_SCRIPT="${SCRIPT_DIR}/../setup-nodejs-env.sh"
            cat > "$SETUP_SCRIPT" << 'EOF'
#!/bin/bash

# Script to set up Node.js environment (sourced by install scripts)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load release manifest (using jq for JSON parsing)
RELEASE_MANIFEST="${SCRIPT_DIR}/../release-manifest.json"

if [ ! -f "$RELEASE_MANIFEST" ]; then
    echo -e "${RED}Error: release-manifest.json not found${NC}"
    exit 1
fi

# Get platform and architecture information
PLATFORM=$(detect_platform)
ARCH=$(detect_architecture)
NODE_VERSION=$(jq -r ".dependencies.nodejs.version" "$RELEASE_MANIFEST")

# Set up Node.js path based on detected platform and architecture
NODE_DIR_PATH="${SCRIPT_DIR}/../nodejs-${PLATFORM}-${ARCH}-${NODE_VERSION}"

if [ ! -d "$NODE_DIR_PATH" ]; then
    echo -e "${RED}Error: Node.js not downloaded. Run download-nodejs.sh first.${NC}"
    exit 1
fi

# Add Node.js to PATH temporarily for this session
export NODE_HOME="${NODE_DIR_PATH}/bin"
export PATH="${NODE_HOME}:${PATH}"

echo -e "${GREEN}Node.js environment set up successfully${NC}"
echo "Node Home: ${NODE_HOME}"
echo "Updated PATH: ${PATH}"
EOF
            
            chmod +x "$SETUP_SCRIPT"
            
            return 0
        }
    }
    
    # Add Node.js to PATH temporarily for this session
    export NODE_HOME="${NODE_DIR_PATH}/bin"
    export PATH="${NODE_HOME}:${PATH}"
    
    echo -e "${GREEN}Node.js path set up successfully${NC}"
    echo "Node Home: ${NODE_HOME}"
    echo "Updated PATH: ${PATH}"
    
    # Test Node.js and npm
    if command -v node &> /dev/null; then
        local NODE_VERSION_INSTALLED=$(node --version)
        echo -e "${GREEN}Node version: ${NODE_VERSION_INSTALLED}${NC}"
        
        if command -v npm &> /dev/null; then
            local NPM_VERSION_INSTALLED=$(npm --version)
            echo -e "${GREEN}Npm version: ${NPM_VERSION_INSTALLED}${NC}"
            
            # Verify both are working
            node -e "console.log('Node is working')"
            npm config get registry > /dev/null
            
            return 0
        else
            echo -e "${RED}Error: npm not found in bundled Node.js${NC}"
            exit 1
        fi
    else
        echo -e "${RED}Error: node command not found${NC}"
        exit 1
    fi
    
    # Create a setup script for the current shell session
    local SETUP_SCRIPT="${SCRIPT_DIR}/../setup-nodejs-env.sh"
    cat > "$SETUP_SCRIPT" << 'EOF'
#!/bin/bash

# Script to set up Node.js environment (sourced by install scripts)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load release manifest (using jq for JSON parsing)
RELEASE_MANIFEST="${SCRIPT_DIR}/../release-manifest.json"

if [ ! -f "$RELEASE_MANIFEST" ]; then
    echo -e "${RED}Error: release-manifest.json not found${NC}"
    exit 1
fi

# Get platform and architecture information
PLATFORM=$(detect_platform)
ARCH=$(detect_architecture)
NODE_VERSION=$(jq -r ".dependencies.nodejs.version" "$RELEASE_MANIFEST")

# Set up Node.js path based on detected platform and architecture
NODE_DIR_PATH="${SCRIPT_DIR}/../nodejs-${PLATFORM}-${ARCH}-${NODE_VERSION}"

if [ ! -d "$NODE_DIR_PATH" ]; then
    echo -e "${RED}Error: Node.js not downloaded. Run download-nodejs.sh standalone scripts.${NC}"
    exit 1
fi

# Add Node.js to PATH temporarily for this session
export NODE_HOME="${NODE_DIR_PATH}/bin"
export PATH="${NODE_HOME}:${PATH}"

echo -e "${GREEN}Node.js environment set up successfully${NC}"
echo "Node Home: ${NODE_HOME}"
echo "Updated PATH: ${PATH}"
EOF
    
    chmod +x "$SETUP_SCRIPT"
    
    return 0
}

install_nodejs