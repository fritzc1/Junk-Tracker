###############################################################################
#
# Start script for Junk Tracker (Mac/Linux).
#
# Usage:
#  .\Start.sh                # Development mode (backend + frontend)
#  .\Start.sh --production   # Build frontend, then run backend in production
#  .\Start.sh --debug        # Development mode with Node inspector
#
###############################################################################

# Parse all arguments in any order
PRODUCTION_MODE=false
DEBUG_MODE=false

for arg in "$@"; do
    case $arg in
        --production)
            PRODUCTION_MODE=true
            ;;
        -d|--debug)
            DEBUG_MODE=true
            ;;
    esac
done

# Auto-detect production mode: if frontend source does not exist, force production mode.
# In release packages, the frontend is pre-built and there is no package.json.
if [ ! -f "./frontend/package.json" ]; then
    PRODUCTION_MODE=true
fi

cd "./MongoDB"
echo "MongoDB Server directory:"
pwd
mongod.exe  &

cd "../backend"
echo "NodeJS Backend directory:"
pwd

if [ "$PRODUCTION_MODE" = true ]; then
    # Only build the frontend if the source exists (development installation).
    # In release packages, the frontend is pre-built and already in the output directory.
    if [ -f "../frontend/package.json" ]; then
        echo "Building React frontend for production..."
        cd "../frontend"
        npm run build
        cd "../backend"
    else
        echo "[INFO] Skipping frontend build — pre-built release detected (no frontend/package.json)."
    fi

    echo "Starting Node backend in PRODUCTION mode (single process)..."
    export NODE_ENV=production
    export JUNK_TRACKER_ROOT=$(pwd)/..
    npm "start" &
elif [ "$DEBUG_MODE" = true ]; then
    echo "Node backend started with --inspect for debugging in browser: goto ===> chrome://inspect/#devices <=== for backend debugging session"
    npm run "debugserver" &
else
    npm "start" &
fi

cd "../frontend"

if [ "$PRODUCTION_MODE" = true ]; then
    echo "React Frontend directory:"
    pwd
    echo "React frontend is served directly by the Node.js backend in PRODUCTION mode (no separate Vite process)..."
else
    echo "React Frontend directory:"
    pwd
    echo "Starting React frontend in DEVELOPMENT mode..."
    npm "start" &
fi

#: return us to starting dir
cd ".."
