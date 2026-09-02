#!/usr/bin/env node

/**
 * Release Manifest Generator - Junk Tracker
 * Creates checksums and version information for all files in the release package.
 * Cross-platform: works on Windows, macOS, and Linux.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function hashFile(filePath) {
    try {
        const content = readFileSync(filePath);
        return createHash('sha256').update(content).digest('hex');
    } catch (e) {
        console.warn(`WARNING: Could not hash file: ${filePath}`);
        return '';
    }
}

function listFilesRecursive(dir, result = []) {
    if (!existsSync(dir)) return result;
    
    for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
            listFilesRecursive(fullPath, result);
        } else {
            result.push(fullPath);
        }
    }
    
    return result;
}

function toForwardSlash(path) {
    return path.replace(/\\/g, '/');
}

const cliVersion = process.argv[2];

if (!cliVersion || !/^\d+\.\d+\.\d+$/.test(cliVersion)) {
    console.error('ERROR: A valid version number is required (e.g. 1.0.0)');
    console.error(`Usage: node ${import.meta.url} x.x.x`);
    process.exit(1);
}

const releaseDirName = `Junk-Tracker-${cliVersion}`;
const releaseDir = join(rootDir, 'release', releaseDirName);

if (!existsSync(releaseDir)) {
    console.error(`ERROR: Release package not found at release/${releaseDirName}!`);
    process.exit(1);
}

console.log('Generating release manifest...');
console.log();

// Version comes from the CLI argument (the version being released).
const version = cliVersion;

// Generate timestamp
const timestamp = new Date().toISOString();

console.log('[Step 1/2] Generating file checksums...');

// Collect all files in the release directory
const allFiles = listFilesRecursive(releaseDir);
const manifestFiles = [];

for (const filePath of allFiles) {
    const relPath = toForwardSlash(relative(releaseDir, filePath));
    const stat = statSync(filePath);
    const hash = hashFile(filePath);
    
    manifestFiles.push({
        path: relPath,
        hash: hash,
        size: stat.size
    });
}

// Sort files by path for consistent output
manifestFiles.sort((a, b) => a.path.localeCompare(b.path));

console.log(`  Processed ${manifestFiles.length} files`);

// Create manifest
const manifest = {
    version: version,
    timestamp: timestamp,
    files: manifestFiles
};

// Write manifest inside the release package directory
const manifestPath = join(releaseDir, 'release-manifest.json');

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

console.log();
console.log('Release manifest generated successfully!');
console.log(`Location: release/${releaseDirName}/release-manifest.json`);
