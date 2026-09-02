#!/usr/bin/env node

/**
 * Production Build - Junk Tracker
 * Builds the React frontend for production (vite build -> frontend/dist).
 * Cross-platform: works on Windows, macOS, and Linux.
 *
 * Usage:
 *   scripts/build.cmd            # Windows
 *   ./scripts/build.sh           # Mac/Linux
 *   node scripts/build.mjs       # any platform
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const frontendDir = join(rootDir, 'frontend');
const distDir = join(frontendDir, 'dist');

function exec(cmd, opts = {}) {
    try {
        return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit', ...opts });
    } catch (e) {
        console.error(`ERROR: Command failed: ${cmd}`);
        process.exit(1);
    }
}

console.log('============================================');
console.log('Junk Tracker - Production Build');
console.log('============================================');
console.log();

// --- Prerequisites --------------------------------------------------------

if (!existsSync(join(frontendDir, 'package.json'))) {
    console.error(`ERROR: frontend/package.json not found at ${frontendDir}`);
    process.exit(1);
}

try {
    const nodeVersion = exec('node --version', { stdio: 'pipe' }).trim();
    console.log(`[OK] Node.js detected: ${nodeVersion}`);
} catch {
    console.error('[ERROR] Node.js is not installed or not in PATH.');
    process.exit(1);
}

// --- Build -----------------------------------------------------------------

console.log('Building React frontend for production...');
exec('npm run build', { cwd: frontendDir });

// --- Verify output ----------------------------------------------------------

const indexHtml = join(distDir, 'index.html');
if (!existsSync(indexHtml)) {
    console.error(`ERROR: Build finished but ${indexHtml} was not produced.`);
    process.exit(1);
}

console.log();
console.log('[OK] Production build complete.');
console.log(`     Output: ${distDir}`);
console.log('     The backend serves this directory when NODE_ENV=production');
console.log('     (see Start.* --production or the Docker image).');
