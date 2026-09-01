#!/usr/bin/env node

/**
 * Release Build - Full Release Pipeline
 * Runs the complete release process: changelog, build, archive, and optional GitHub release.
 * Cross-platform: works on Windows, macOS, and Linux.
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function exec(cmd, opts = {}) {
    try {
        return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit', ...opts });
    } catch (e) {
        console.error(`ERROR: Command failed: ${cmd}`);
        process.exit(1);
    }
}

function isWindows() {
    return process.platform === 'win32';
}

// Determine shell for running scripts
const shell = isWindows() ? 'powershell.exe' : '/bin/bash';
const shellFlag = isWindows() ? '-Command' : '';

function runScript(scriptPath, ...args) {
    if (isWindows()) {
        exec(`node "${join(__dirname, scriptPath)}" ${args.join(' ')}`);
    } else {
        exec(`node "${join(__dirname, scriptPath)}" ${args.join(' ')}`);
    }
}

const version = process.argv[2];
const publishFlag = process.argv[3];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('ERROR: A valid version number is required (e.g. 1.0.0)');
    console.error('');
    console.error('Usage:');
    console.error('  release-build.cmd <version> [--publish]');
    console.error('  node release-build.mjs <version> [--publish]');
    console.error('');
    console.error('Examples:');
    console.error('  release-build.cmd 1.0.0');
    console.error('  release-build.cmd 2.3.1 --publish');
    process.exit(1);
}

console.log(`Cinema Control App - Release Build`);
console.log(`====================================`);
console.log(`Version: ${version}`);
console.log();

// Validate required files before building
const requiredFiles = [
    { path: join(rootDir, 'client', 'package.json'), desc: 'client/package.json' },
    { path: join(rootDir, 'server', 'package.json'), desc: 'server/package.json' },
];

for (const { path, desc } of requiredFiles) {
    if (!existsSync(path)) {
        console.error(`ERROR: Required file not found: ${desc}`);
        process.exit(1);
    }
}

// Step 1: Generate Changelog
console.log('Step 1: Generating changelog...');
runScript('generate-changelog.mjs', version);
console.log();

// Step 2: Build Client (npm run build in client/)
console.log('Step 2: Building client...');
const clientDir = join(rootDir, 'client');
if (existsSync(join(clientDir, 'package.json'))) {
    exec('npm run build', { cwd: clientDir });
} else {
    console.warn('WARNING: client/package.json not found, skipping client build');
}
console.log();

// Step 3: Create release directory structure
const releaseDir = join(rootDir, 'release', `Cinema-Control-App-${version}`);

// Clean previous release
const releaseRoot = join(rootDir, 'release');
if (existsSync(releaseRoot)) {
    console.log('Cleaning previous release...');
    rmSync(releaseRoot, { recursive: true, force: true });
}

mkdirSync(releaseDir, { recursive: true });

// Copy server
console.log('Copying server to release...');
const srcServer = join(rootDir, 'server');
const dstServer = join(releaseDir, 'server');
cpSync(srcServer, dstServer, { recursive: true, force: true });

// Remove server/node_modules from release (will be installed on target)
const srvNodeModules = join(dstServer, 'node_modules');
if (existsSync(srvNodeModules)) {
    rmSync(srvNodeModules, { recursive: true, force: true });
}

// Copy client build to release/.../client/build/ (server expects client/build/index.html)
console.log('Copying client to release...');
const clientBuild = join(rootDir, 'client', 'build');
const dstClientBuild = join(releaseDir, 'client', 'build');
if (!existsSync(clientBuild)) {
    console.error('ERROR: client/build not found - client build failed or build directory is missing');
    process.exit(1);
}
cpSync(clientBuild, dstClientBuild, { recursive: true, force: true });

// Copy 7za if exists
const srcSevenZip = join(rootDir, '7za');
if (existsSync(srcSevenZip)) {
    console.log('Copying 7za to release...');
    cpSync(srcSevenZip, join(releaseDir, '7za'), { recursive: true, force: true });
}

// Copy mpv if exists (check common locations)
const mpvDirs = [
    join(rootDir, 'mpv'),
    join(rootDir, 'mpv', 'windows-x86_64'),
];
for (const mpvSrc of mpvDirs) {
    if (existsSync(mpvSrc)) {
        console.log(`Copying mpv from ${mpvSrc}...`);
        cpSync(mpvSrc, join(releaseDir, 'mpv'), { recursive: true, force: true });
        break;
    }
}

// Copy config templates
const configDir = join(rootDir, 'server', 'config');
if (existsSync(configDir)) {
    console.log('Copying config to release...');
    cpSync(configDir, join(releaseDir, 'server', 'config'), { recursive: true, force: true });
}

// Copy root-level files
for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE', 'Install.sh', 'Install.ps1', 'Install.cmd', 'Start.sh', 'Start.ps1', 'Start.cmd']) {
    const src = join(rootDir, file);
    if (existsSync(src)) {
        copyFileSync(src, join(releaseDir, file));
    }
}

console.log();
console.log('Release directory structure created.');
console.log();

// Step 5: Generate file checksum manifest
console.log('Step 5: Generating file checksum manifest...');
runScript('release-manifest.mjs', version);
console.log();

// Step 6: Create archives
console.log('Step 6: Creating distribution archives...');
runScript('create-release-archive.mjs', version);
console.log();

// Step 7: Optional GitHub release
if (publishFlag === '--publish') {
    console.log('Step 7: Publishing to GitHub...');
    runScript('create-github-release.mjs', version);
    console.log();
} else {
    console.log(`Skipping GitHub release. Use --publish flag to publish.`);
}

console.log(`====================================`);
console.log(`Release build complete for v${version}!`);
console.log();
console.log('Release artifacts:');
for (const platform of ['Windows', 'Mac', 'Linux']) {
    const p = join(releaseRoot, `Cinema-Control-App-${platform}-${version}.zip`);
    if (existsSync(p)) {
        console.log(`  ${p}`);
    }
}
