@echo off
REM Wrapper for release-manifest.mjs (Windows)
REM Usage: release-manifest.cmd <version>

node "%~dp0release-manifest.mjs" %*
