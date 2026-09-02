#!/usr/bin/env node

/**
 * Changelog Generator - Junk Tracker
 * Generates/updates CHANGELOG.md from git history since the last release tag.
 * Cross-platform: works on Windows, macOS, and Linux (uses only git + Node).
 *
 * Usage:
 *   node scripts/generate-changelog.mjs <version>
 *
 * Behavior:
 *   - Commits are collected from the most recent git tag up to HEAD
 *     (or all history if no tags exist yet — i.e. the first release).
 *   - Conventional-commit prefixes (feat, fix, docs, refactor, perf, test,
 *     chore) are grouped into sections; everything else goes under "Other".
 *   - If CHANGELOG.md already has a "## v<version>" section it is replaced;
 *     otherwise the new section is inserted at the top.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function git(cmd) {
    // stdio:'pipe' keeps stderr (e.g. "fatal: No names found" when no tags
    // exist yet) out of the console — failures surface via the thrown error.
    return execSync(`git ${cmd}`, { encoding: 'utf-8', cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// --- Arguments --------------------------------------------------------------

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('ERROR: A valid version number is required (e.g. 1.0.0)');
    console.error('Usage: node scripts/generate-changelog.mjs <version>');
    process.exit(1);
}

// --- Collect commits ---------------------------------------------------------

let range = 'HEAD'; // no tags yet -> full history (first release)
try {
    const prevTag = git('describe --tags --abbrev=0');
    if (prevTag) range = `${prevTag}..HEAD`;
} catch {
    // No tags exist — keep "HEAD" (full history).
}

let subjects = [];
try {
    const log = git(`log ${range} --pretty=format:%s`);
    subjects = log.split('\n').map(s => s.trim()).filter(Boolean);
} catch (e) {
    console.error(`ERROR: Could not read git history: ${e.message}`);
    process.exit(1);
}

if (subjects.length === 0) {
    console.warn('WARNING: No commits found since the last tag — changelog section will be empty.');
}

// --- Group by conventional-commit type ---------------------------------------

const SECTIONS = [
    ['Features', /^feat(\(.+\))?:\s*/i],
    ['Bug Fixes', /^fix(\(.+\))?:\s*/i],
    ['Performance', /^perf(\(.+\))?:\s*/i],
    ['Refactoring', /^refactor(\(.+\))?:\s*/i],
    ['Documentation', /^docs?(\(.+\))?:\s*/i],
    ['Tests', /^test(s)?(\(.+\))?:\s*/i],
    ['Chores', /^chore(\(.+\))?:\s*/i],
];

const groups = new Map(SECTIONS.map(([name]) => [name, []]));
groups.set('Other', []);

for (const subject of subjects) {
    let matched = false;
    for (const [name, re] of SECTIONS) {
        if (re.test(subject)) {
            groups.get(name).push(re.exec(subject)[0].length ? subject.replace(re, '') : subject);
            matched = true;
            break;
        }
    }
    if (!matched) groups.get('Other').push(subject);
}

// --- Render markdown ----------------------------------------------------------

const date = new Date().toISOString().slice(0, 10);
const lines = [`## v${version} (${date})`, ''];
for (const [name, items] of groups) {
    if (items.length === 0) continue;
    lines.push(`### ${name}`, '');
    for (const item of items) lines.push(`- ${item}`);
    lines.push('');
}

let section = lines.join('\n').trimEnd() + '\n';

// --- Merge into CHANGELOG.md ---------------------------------------------------

const changelogPath = join(rootDir, 'CHANGELOG.md');
const heading = `## v${version}`;

if (existsSync(changelogPath)) {
    const existing = readFileSync(changelogPath, 'utf-8');
    const linesArr = existing.split('\n');
    const startIdx = linesArr.findIndex(l => l.trim() === heading);

    if (startIdx !== -1) {
        // Replace the existing section for this version.
        let endIdx = linesArr.length;
        for (let i = startIdx + 1; i < linesArr.length; i++) {
            if (/^##\s/.test(linesArr[i])) { endIdx = i; break; }
        }
        linesArr.splice(startIdx, endIdx - startIdx, ...section.trimEnd().split('\n'));
        writeFileSync(changelogPath, linesArr.join('\n'), 'utf-8');
    } else {
        // Insert at the top (after a leading title line if present).
        let insertAt = 0;
        if (/^#\s/.test(linesArr[0] || '')) insertAt = 1;
        linesArr.splice(insertAt, 0, '', ...section.trimEnd().split('\n'));
        writeFileSync(changelogPath, linesArr.join('\n'), 'utf-8');
    }
} else {
    const title = '# Changelog\n';
    writeFileSync(changelogPath, `${title}\n${section}`, 'utf-8');
}

console.log(`[OK] CHANGELOG.md updated for v${version} (${subjects.length} commit(s)).`);
