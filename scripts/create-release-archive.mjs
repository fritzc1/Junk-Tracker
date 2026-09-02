#!/usr/bin/env node

/**
 * Create Release Archive - Junk Tracker
 * Packages the staged release directory into a single universal distribution
 * archive. The package is platform-independent (no bundled binaries), so one
 * archive works everywhere:
 *   - Windows:  Junk-Tracker-{version}.zip      (PowerShell Compress-Archive)
 *   - Mac/Linux: Junk-Tracker-{version}.tar.gz  (system tar)
 * No third-party tools required.
 */

import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function run(cmd) {
    try {
        return execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
        console.error(`ERROR: Command failed: ${cmd}`);
        process.exit(1);
    }
}

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('ERROR: A valid version number is required (e.g. 1.0.0)');
    console.error(`Usage: node ${import.meta.url} x.x.x`);
    process.exit(1);
}

console.log('Junk Tracker - Release Archive Creator');
console.log('============================================');
console.log();

// --- Locate the staged release package ---------------------------------------

const releaseRoot = join(rootDir, 'release');
if (!existsSync(releaseRoot)) {
    console.error('ERROR: release/ directory not found!');
    console.error('Run scripts/release-build.cmd (or .sh) first to stage the release.');
    process.exit(1);
}

const releaseDirName = `Junk-Tracker-${version}`;
const releaseDir = join(releaseRoot, releaseDirName);
if (!existsSync(releaseDir)) {
    console.error(`ERROR: Release package not found at release/${releaseDirName}/`);
    process.exit(1);
}

// --- Create the archive --------------------------------------------------------

const isWindows = process.platform === 'win32';
let outputPath;

if (isWindows) {
    // PowerShell's Compress-Archive ships with Windows 10+ / PowerShell 5+.
    // -C <dir> archives the CONTENTS of the directory, so extracting yields
    // Junk-Tracker-{version}/... directly.
    outputPath = join(releaseRoot, `Junk-Tracker-${version}.zip`);
    const psCmd = `Compress-Archive -Path '${releaseDir}\\*' -DestinationPath '${outputPath}' -CompressionLevel Optimal`;
    console.log('Creating ZIP archive (PowerShell Compress-Archive)...');
    run(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);
} else {
    // System tar: gzip-compressed, contents at the top level of the archive.
    outputPath = join(releaseRoot, `Junk-Tracker-${version}.tar.gz`);
    console.log('Creating TAR.GZ archive (system tar)...');
    run(`tar -czf "${outputPath}" -C "${releaseDir}" .`);
}

// --- Report ---------------------------------------------------------------------

if (!existsSync(outputPath)) {
    console.error('ERROR: Archive was not created.');
    process.exit(1);
}

const sizeMB = (statSync(outputPath).size / (1024 * 1024)).toFixed(2);
console.log();
console.log('============================================');
console.log('Release archive created successfully!');
console.log(`  ${outputPath} (${sizeMB} MB)`);
console.log('============================================');
