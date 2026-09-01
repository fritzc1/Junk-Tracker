#!/usr/bin/env node

/**
 * Clean - Remove regenerable build artifacts and caches.
 * Cross-platform: works on Windows, macOS, and Linux.
 *
 * Usage:
 *   node scripts/clean.mjs [targets...] [--all]
 *
 * Targets (positional; default = client-build release):
 *   client-build    Remove client/build/ (Vite output)
 *   release         Remove the entire release/ tree (package dir, _staging/, zips)
 *   logs            Remove runtime log files/directories
 *   node-modules    Remove node_modules in root, client/, and server/
 *
 * Flags:
 *   --all           Add node-modules to the target set
 *
 * SAFETY: This script uses an explicit allowlist of paths. Anything not listed
 * here is never touched — in particular MongoDB/ (contains user DB data), MPV/,
 * server/public/{uploads,settings-store,users}, and .env files.
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// --- Argument parsing ---------------------------------------------------

const args = process.argv.slice(2);
const allFlag = args.includes('--all');
const positional = args.filter(a => !a.startsWith('--'));
const unknownFlags = args.filter(a => a.startsWith('--') && a !== '--all');

if (unknownFlags.length > 0) {
    console.error(`ERROR: Unknown flag(s): ${unknownFlags.join(', ')}`);
    process.exit(1);
}

const VALID_TARGETS = ['client-build', 'release', 'logs', 'node-modules'];
const invalidTargets = positional.filter(t => !VALID_TARGETS.includes(t));

if (invalidTargets.length > 0) {
    console.error(`ERROR: Unknown target(s): ${invalidTargets.join(', ')}`);
    console.error(`Valid targets: ${VALID_TARGETS.join(', ')}`);
    process.exit(1);
}

let targets = positional.length > 0 ? [...positional] : ['client-build', 'release'];
if (allFlag && !targets.includes('node-modules')) {
    targets.push('node-modules');
}

// --- Target definitions ---------------------------------------------------
// Explicit allowlist only. Paths are resolved relative to the repo root so the
// script works regardless of the current working directory.

const clientDir = join(rootDir, 'client');
const serverDir = join(rootDir, 'server');

function collectDebugLogFiles(dir) {
    if (!existsSync(dir)) return [];
    const files = [];
    for (const entry of readdirSync(dir)) {
        if (/^(npm-debug|yarn-debug|yarn-error)\.log/.test(entry)) {
            files.push(join(dir, entry));
        }
    }
    return files;
}

function pathsFor(target) {
    switch (target) {
        case 'client-build':
            return [join(clientDir, 'build')];
        case 'release':
            return [join(rootDir, 'release')];
        case 'logs':
            // Configured log location is <root>/logs/app.log (see server/config/production-config.js)
            return [
                join(rootDir, 'logs'),
                ...collectDebugLogFiles(rootDir),
                ...collectDebugLogFiles(clientDir),
                ...collectDebugLogFiles(serverDir),
            ];
        case 'node-modules':
            return [
                join(rootDir, 'node_modules'),
                join(clientDir, 'node_modules'),
                join(serverDir, 'node_modules'),
            ];
        default:
            return [];
    }
}

// --- Run -------------------------------------------------------------------

console.log('Cinema Control App - Clean');
console.log('==========================');
console.log(`Targets: ${targets.join(', ')}`);
console.log();

let removedCount = 0;
const failures = [];

for (const target of targets) {
    for (const p of pathsFor(target)) {
        const rel = relative(rootDir, p).split('\\').join('/');
        if (!existsSync(p)) {
            console.log(`Skipped (not present): ${rel}`);
            continue;
        }
        try {
            rmSync(p, { recursive: true, force: true });
            console.log(`Removed: ${rel}`);
            removedCount++;
        } catch (err) {
            // e.g. EBUSY/EPERM if a dev server or editor holds the path open on Windows
            console.error(`FAILED: ${rel} (${err.code || err.message})`);
            failures.push(rel);
        }
    }
}

console.log();

if (failures.length > 0) {
    console.error(`Clean finished with ${failures.length} failure(s). Close any running dev servers and retry.`);
    process.exit(1);
}

if (removedCount === 0) {
    console.log('Nothing to clean.');
} else {
    console.log(`Clean complete: ${removedCount} path(s) removed.`);
    if (targets.includes('node-modules')) {
        console.log('Reinstall dependencies by running Install.cmd / Install.sh, or npm install in server/ and client/.');
    }
}
