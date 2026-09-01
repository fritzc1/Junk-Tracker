#!/usr/bin/env node
/**
 * generate-changelog.mjs
 * Cross-platform version of generate-changelog.cmd
 */
import { execSync } from 'child_process';
import fs from 'fs';

try {
  const output = execSync('git log --oneline HEAD...ORIG_HEAD', { encoding: 'utf8' });
  fs.writeFileSync('CHANGELOG.md', output);
  console.log('Generated CHANGELOG.md');
} catch (error) {
  console.error('Failed to generate changelog:', error.message);
  process.exit(1);
}