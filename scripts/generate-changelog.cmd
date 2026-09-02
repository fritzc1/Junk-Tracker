@echo off
REM Wrapper for generate-changelog.mjs (Windows)
REM Usage: generate-changelog.cmd <version>

node "%~dp0generate-changelog.mjs" %*
