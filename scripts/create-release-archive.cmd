@echo off
REM Wrapper for create-release-archive.mjs (Windows)
REM Usage: create-release-archive.cmd <version>

node "%~dp0create-release-archive.mjs" %*
