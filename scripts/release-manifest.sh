#!/bin/bash
# Cross-platform wrapper for release-manifest.mjs
# Runs the Node.js manifest generator script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$SCRIPT_DIR/release-manifest.mjs" "$@"