#!/usr/bin/env node

/**
 * Create Release Archive
 * Packages the release directory into platform-specific distribution archives:
 *   - Cinema-Control-App-Windows-{version}.zip
 *   - Cinema-Control-App-Mac-{version}.zip
 *   - Cinema-Control-App-Linux-{version}.zip
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Check 7za availability
let sevenZip = null;

const localSevenZip = join(rootDir, '7za', '7za.exe');
if (existsSync(localSevenZip)) {
    sevenZip = localSevenZip;
} else {
    try {
        execSync('where 7z', { stdio: 'pipe' });
        sevenZip = '7z';
    } catch {
        try {
            execSync('which 7z', { stdio: 'pipe' });
            sevenZip = '7z';
        } catch {
            // Fall back to PowerShell tar
        }
    }
}

function run(cmd, opts = {}) {
    try {
        return execSync(cmd, { stdio: 'inherit', ...opts });
    } catch (e) {
        console.error(`ERROR: Command failed: ${cmd}`);
        process.exit(1);
    }
}

const version = process.argv[2];

if (!version) {
    console.error('ERROR: Version number required!');
    console.error(`Usage: node ${import.meta.url} x.x.x`);
    process.exit(1);
}

console.log(`Cinema Control App - Release Archive Creator`);
console.log(`=============================================`);
console.log();

// Check release directory
const releaseRoot = join(rootDir, 'release');
if (!existsSync(releaseRoot)) {
    console.error('ERROR: release/ directory not found!');
    console.error('Run scripts/release-build.cmd first to create the release package.');
    process.exit(1);
}

// Find the release package directory (Cinema-Control-App-{version})
const releaseDirName = readdirSync(releaseRoot).find(f => f.startsWith('Cinema-Control-App'));
if (!releaseDirName) {
    console.error('ERROR: No release package directory found in release/');
    process.exit(1);
}

const releaseDir = join(releaseRoot, releaseDirName);

// Platform-specific archive configurations
// Each platform gets a temp staging directory where we copy the base release
// and then remove files not needed for that platform.
const platforms = [
    {
        name: 'Windows',
        // Files to exclude (non-Windows specific)
        exclude: ['Start.sh', 'Install.sh'],
    },
    {
        name: 'Mac',
        exclude: ['Start.cmd', 'Start.ps1', 'Install.cmd', 'runnpmi.cmd'],
    },
    {
        name: 'Linux',
        exclude: ['Start.cmd', 'Start.ps1', 'Install.cmd', 'runnpmi.cmd'],
    },
];

const tempRoot = join(releaseRoot, '_staging');

// Create archives
console.log(`Creating distribution archives...`);
console.log();

for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    const archName = `Cinema-Control-App-${platform.name}-${version}`;
    const stagingDir = join(tempRoot, platform.name);
    const outputPath = join(releaseRoot, `${archName}.zip`);

    console.log(`[${i + 1}/${platforms.length}] Creating ${platform.name} archive...`);

    // Clean and create staging directory
    if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
    }
    mkdirSync(stagingDir, { recursive: true });

    // Copy the entire release directory to staging
    cpSync(releaseDir, stagingDir, { recursive: true, force: true });

    // Remove excluded files for this platform
    for (const file of platform.exclude) {
        const filePath = join(stagingDir, file);
        if (existsSync(filePath)) {
            rmSync(filePath, { force: true });
        }
    }

    // Create ZIP archive using 7za or fallback to PowerShell tar
    if (sevenZip) {
        run(`${sevenZip} a "${outputPath}" "${stagingDir}\\*" -tzip -mx=9`);
    } else {
        // Fallback: use PowerShell tar
        run(`powershell -Command "tar -cf '${outputPath}' -C '${stagingDir}' ."`, { stdio: 'inherit' });
    }

    console.log(`Created: ${archName}.zip`);
}

// Clean up staging directory
if (existsSync(tempRoot)) {
    rmSync(tempRoot, { recursive: true, force: true });
}

console.log();
console.log(`=============================================`);
console.log(`Release archives created successfully!`);
console.log(`Location: ${releaseRoot}/`);
console.log();

// Show file sizes
try {
    for (const platform of platforms) {
        const archName = `Cinema-Control-App-${platform.name}-${version}`;
        const p = join(releaseRoot, `${archName}.zip`);
        if (existsSync(p)) {
            const s = statSync(p);
            const sizeMB = (s.size / (1024 * 1024)).toFixed(2);
            console.log(`  ${archName}.zip: ${sizeMB} MB`);
        }
    }
} catch {
    // Ignore errors showing sizes
}

console.log();