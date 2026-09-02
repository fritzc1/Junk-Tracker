#!/usr/bin/env node
/**
 * create-github-release.mjs
 * Cross-platform script to create a GitHub release using the `gh` CLI.
 *
 * Requirements:
 *   - Node.js 22+ (already required by this project)
 *   - gh CLI installed and authenticated (gh auth login)
 *
 * Usage:
 *   node scripts/create-github-release.mjs --version 1.0.0 [--notes "Release notes"]
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Helpers ────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function exec(cmd, { stdout = process.stdout, stderr = process.stderr } = {}) {
  console.log(`$ ${cmd}`);
  try {
    const output = execSync(cmd, {
      stdio: 'pipe',
      encoding: 'utf-8',
      cwd: rootDir,
    });
    if (stdout) stdout.write(output);
    return output;
  } catch (err) {
    if (err.stderr && stderr) stderr.write(err.stderr);
    if (err.stdout && stdout) stdout.write(err.stdout);
    throw err;
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = { version: null, notes: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      parsed.version = args[++i];
    } else if (args[i] === '--notes' && args[i + 1]) {
      parsed.notes = args[++i];
    }
  }

  return parsed;
}

function findAssets(archiveDir) {
  const assets = [];
  if (!fs.existsSync(archiveDir)) return assets;

  for (const entry of fs.readdirSync(archiveDir)) {
    // Only top-level distribution archives — skip the staged package directory.
    if (fs.statSync(path.join(archiveDir, entry)).isFile()) {
      const ext = path.extname(entry).toLowerCase();
      if (ext === '.zip' || entry.endsWith('.tar.gz')) {
        assets.push(path.join(archiveDir, entry));
      }
    }
  }
  return assets;
}

// ── Main ───────────────────────────────────────────────────

function main() {
  const { version, notes } = parseArgs(process.argv);

  if (!version) {
    console.error('Error: --version is required');
    console.error('Usage: node scripts/create-github-release.mjs --version 1.0.0 [--notes "Release notes"]');
    process.exit(1);
  }

  const tag = `v${version}`;

  // Check for gh CLI
  try {
    exec('gh --version', { stdout: null, stderr: null });
  } catch {
    console.error('Error: gh CLI is required. Install from https://cli.github.com/');
    process.exit(1);
  }

  // Build release notes
  let releaseNotes = notes || `Release ${tag}`;
  const notesFile = path.join(rootDir, `.release-notes-${version}.md`);
  if (fs.existsSync(notesFile)) {
    releaseNotes = fs.readFileSync(notesFile, 'utf-8');
    console.log(`Loaded release notes from ${notesFile}`);
  }

  // Create the release (or update if tag already exists)
  const tagArg = `--tag ${tag}`;
  const targetArg = '--target main';
  const titleArg = `--title ${tag}`;
  const notesFlag = '--notes';

  console.log(`Creating release ${tag}...`);

  let releaseCmd;
  try {
    // Try creating new release
    releaseCmd = `gh release create ${tag} ${targetArg} ${titleArg} ${notesFlag} "${releaseNotes.replace(/"/g, '\\"')}"`;
    exec(releaseCmd);
  } catch (err) {
    console.log(`Tag ${tag} may already exist — updating release instead...`);
    const notesTmp = path.join(rootDir, '.tmp-release-notes.txt');
    fs.writeFileSync(notesTmp, releaseNotes);
    try {
      exec(`gh release edit ${tag} --notes-file "${notesTmp}"`);
    } finally {
      if (fs.existsSync(notesTmp)) fs.unlinkSync(notesTmp);
    }
  }

  // Upload assets (created by scripts/create-release-archive.mjs in release/)
  const archiveDir = path.join(rootDir, 'release');
  const assets = findAssets(archiveDir).filter(a => a.includes(version));

  if (assets.length > 0) {
    console.log(`Uploading ${assets.length} asset(s)...`);
    for (const asset of assets) {
      const name = path.basename(asset);
      console.log(`  Uploading ${name}...`);
      exec(`gh release upload ${tag} "${asset}" --clobber`);
    }
  } else {
    console.log('No assets found to upload.');
  }

  console.log(`\nRelease ${tag} is ready!`);
  console.log(`View it at: https://github.com/${getRemoteOrgRepo()}/releases/tag/${tag}`);
}

function getRemoteOrgRepo() {
  try {
    const output = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      cwd: rootDir,
    }).trim();

    // Extract owner/repo from various git URL formats
    // git@github.com:owner/repo.git -> owner/repo
    // https://github.com/owner/repo.git -> owner/repo
    const match = output.match(/[:\/]([^/]+)\/([^.]+)/);
    return match ? `${match[1]}/${match[2]}` : 'unknown/repo';
  } catch {
    return 'unknown/repo';
  }
}

main();