#:::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
#:
#: Automatic Install script for Junk Tracker (Mac).
#:
#: - Downloads and extracts MongoDB to ./MongoDB/ (skipped if already present)
#: - Creates the database directory ./MongoDB/data/db
#: - Installs npm dependencies for backend/ and frontend/
#:
#:::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

cd "$(dirname "$0")"

echo "============================================"
echo "Junk Tracker — Install Script (Mac)"
echo "============================================"
echo ""

# --- Node.js check -------------------------------------------------------
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in PATH."
    echo ""
    echo "Please install Node.js LTS from https://nodejs.org/"
    echo "  or run: brew install node"
    echo ""
    echo "After installing, re-run this script."
    exit 1
fi
NODE_VERSION=$(node --version)
echo "[OK] Node.js detected: $NODE_VERSION"
echo ""

# --- MongoDB ------------------------------------------------------------
if [ -f "./MongoDB/bin/mongod" ]; then
    echo "[OK] MongoDB already installed in ./MongoDB/ — skipping download."
else
    echo "[INFO] Downloading MongoDB..."
    wget -O mdb.tgz https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-4.4.4.tgz
    rm -rf "MongoDB/_temp"
    mkdir -p "MongoDB/_temp"

    echo "[INFO] Extracting MongoDB..."
    tar -xzf "mdb.tgz" -C "MongoDB/_temp"

    # Move contents of versioned folder up one level to remove version from path
    VERSIONED_FOLDER=$(ls "MongoDB/_temp")
    cp -R "MongoDB/_temp/$VERSIONED_FOLDER/." "MongoDB/"

    rm -rf "MongoDB/_temp"
    rm "mdb.tgz"
    echo "[OK] MongoDB installed."
fi

# Create database data directory
if [ ! -d "./MongoDB/data/db" ]; then
    mkdir -p "./MongoDB/data/db"
    echo "[OK] Created ./MongoDB/data/db"
else
    echo "[OK] Database directory already exists — skipping."
fi

echo ""

# --- npm dependencies ---------------------------------------------------
echo "[INFO] Installing backend dependencies..."
cd "./backend"
npm install || { echo "[ERROR] Failed to install backend dependencies!"; exit 1; }
echo "[OK] Backend dependencies installed."

cd ".."

echo ""

# Only install frontend dependencies if the frontend source exists (development mode).
# In release packages, the frontend is pre-built — no package.json present.
if [ -f "./frontend/package.json" ]; then
    echo "[INFO] Installing frontend dependencies..."
    cd "./frontend"
    npm install --legacy-peer-deps || { echo "[ERROR] Failed to install frontend dependencies!"; exit 1; }
    echo "[OK] Frontend dependencies installed."
    cd ".."
else
    echo "[INFO] Skipping frontend install — pre-built release detected (no frontend/package.json)."
fi

echo ""
echo "============================================"
echo "Installation complete!"
echo "Run ./Start.sh to launch the app in dev mode."
echo "============================================"
