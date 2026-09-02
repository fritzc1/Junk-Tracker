@echo off
REM Wrapper for create-github-release.mjs (Windows)
REM Usage: create-github-release.cmd --version 1.0.0 [--notes "Release notes"]

node "%~dp0create-github-release.mjs" %*
