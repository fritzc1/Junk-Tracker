#!/usr/bin/env node

/**
 * Release Build - Full Release Pipeline (Junk Tracker)
 * Runs the complete release process: changelog, production build, staging,
 * checksum manifest, archive creation, and optional GitHub release.
 * Cross-platform: works on Windows, macOS, and Linux.
 *
 * Usage:
 *   scripts/release-build.cmd <version> [--publish]     # Windows
 *   ./scripts/release-build.sh <version> [--publish]    # Mac/Linux
 *   node scripts/release-build.mjs <version> [--publish]
 *
 * The release package is a single universal archive (no platform-specific
 * binaries): app code + pre-built frontend + start/install scripts. MongoDB
 * itself is downloaded by Install.* on the user's machine at install time.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, copyFileSync, readdirSync } from 'node:fs';
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

function runScript(scriptPath, ...args) {
    exec(`node "${join(__dirname, scriptPath)}" ${args.join(' ')}`, { cwd: rootDir });
}

// --- Arguments ---------------------------------------------------------------

const version = process.argv[2];
const publishFlag = process.argv[3];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('ERROR: A valid version number is required (e.g. 1.0.0)');
    console.error('');
    console.error('Usage:');
    console.error('  release-build.cmd <version> [--publish]      (Windows)');
    console.error('  ./release-build.sh <version> [--publish]     (Mac/Linux)');
    console.error('');
    console.error('Examples:');
    console.error('  release-build.cmd 1.0.0');
    console.error('  release-build.cmd 2.3.1 --publish');
    process.exit(1);
}

console.log('Junk Tracker - Release Build');
console.log('====================================');
console.log(`Version: ${version}`);
console.log();

// --- Validate required files ---------------------------------------------------

const requiredFiles = [
    { path: join(rootDir, 'backend', 'package.json'), desc: 'backend/package.json' },
    { path: join(rootDir, 'frontend', 'package.json'), desc: 'frontend/package.json' },
];

for (const { path, desc } of requiredFiles) {
    if (!existsSync(path)) {
        console.error(`ERROR: Required file not found: ${desc}`);
        process.exit(1);
    }
}

// --- Step 1: Generate changelog --------------------------------------------------

console.log('Step 1/5: Generating changelog...');
runScript('generate-changelog.mjs', version);
console.log();

// --- Step 2: Production build (frontend -> frontend/dist) --------------------------

console.log('Step 2/5: Building production frontend...');
runScript('build.mjs');
const distDir = join(rootDir, 'frontend', 'dist');
if (!existsSync(join(distDir, 'index.html'))) {
    console.error('ERROR: Frontend build did not produce frontend/dist/index.html');
    process.exit(1);
}
console.log();

// --- Step 3: Stage the release package ----------------------------------------------

const releaseRoot = join(rootDir, 'release');
const releaseDirName = `Junk-Tracker-${version}`;
const releaseDir = join(releaseRoot, releaseDirName);

if (existsSync(releaseRoot)) {
    console.log('Cleaning previous release...');
    rmSync(releaseRoot, { recursive: true, force: true });
}
mkdirSync(releaseDir, { recursive: true });

// 3a) Backend source WITHOUT node_modules (Install.* reinstalls on the target).
console.log('Copying backend to release (without node_modules)...');
const srcBackend = join(rootDir, 'backend');
const dstBackend = join(releaseDir, 'backend');
cpSync(srcBackend, dstBackend, { recursive: true, force: true });
rmSync(join(dstBackend, 'node_modules'), { recursive: true, force: true });

// 3b) Pre-built frontend ONLY (no package.json — the start scripts use its
// absence to auto-detect a pre-built release and skip the build step).
console.log('Copying pre-built frontend (dist only)...');
cpSync(distDir, join(releaseDir, 'frontend', 'dist'), { recursive: true, force: true });

// 3c) Start / install scripts + docs.
const rootFiles = [
    'README.md',
    'CHANGELOG.md',
    'Start.cmd', 'Start.ps1', 'Start.sh',
    'Install.cmd', 'Install.ps1', 'Install.sh',
];
for (const file of rootFiles) {
    const src = join(rootDir, file);
    if (existsSync(src)) {
        copyFileSync(src, join(releaseDir, file));
    } else {
        console.warn(`WARNING: ${file} not found — skipping.`);
    }
}

console.log();
console.log('Release package staged.');
console.log();

// --- Step 4: Checksum manifest -------------------------------------------------------

console.log('Step 4/5: Generating file checksum manifest...');
runScript('release-manifest.mjs', version);
console.log();

// --- Step 5: Create distribution archive -----------------------------------------------

console.log('Step 5/5: Creating distribution archive...');
runScript('create-release-archive.mjs', version);
console.log();

// --- Optional: GitHub release -----------------------------------------------------------

if (publishFlag === '--publish') {
    console.log('Publishing to GitHub...');
    runScript('create-github-release.mjs', `--version ${version}`);
    console.log();
} else {
    console.log('Skipping GitHub release. Use --publish flag to publish.');
}

console.log('====================================');
console.log(`Release build complete for v${version}!`);
console.log();
console.log('Artifacts in release/:');
for (const entry of readdirSync(releaseRoot)) {
    console.log(`  ${join(releaseRoot, entry)}`);
}
