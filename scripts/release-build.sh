#!/bin/bash
# Cross-platform wrapper for release-build.mjs
# Runs the Node.js build generator script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$SCRIPT_DIR/release-build.mjs" "$@"