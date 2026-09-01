@echo off
REM Wrapper for release-build.mjs
REM Usage: release-build.cmd [version] [--publish]

node "%~dp0release-build.mjs" %*