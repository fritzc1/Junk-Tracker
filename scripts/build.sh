#!/bin/bash
# Wrapper for build.mjs - production frontend build (Mac/Linux)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$SCRIPT_DIR/build.mjs" "$@"
