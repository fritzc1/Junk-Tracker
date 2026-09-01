#!/usr/bin/env bash
# create-github-release.sh
# Cross-platform wrapper (macOS / Linux) for creating a GitHub release.
# Delegates all logic to the Node.js core script.
#
# Usage:
#   ./scripts/create-github-release.sh --version 1.0.0 [--notes "Release notes"]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

exec node "$SCRIPT_DIR/create-github-release.mjs" "$@"