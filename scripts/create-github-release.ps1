# create-github-release.ps1
# Cross-platform wrapper (Windows PowerShell) for creating a GitHub release.
# Delegates all logic to the Node.js core script.
#
# Usage:
#   .\scripts\create-github-release.ps1 -Version 1.0.0 [-Notes "Release notes"]

param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$Notes
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mjs = Join-Path $scriptDir 'create-github-release.mjs'

$args = @("--version", $Version)
if ($Notes) {
    $args += "--notes", $Notes
}

& node $mjs @args