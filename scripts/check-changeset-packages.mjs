#!/usr/bin/env node

// Validates that all .changeset/*.md files reference valid workspace package names.
// Catches mistakes like using 'agents-api' instead of '@inkeep/agents-api'.
//
// Usage: node scripts/check-changeset-packages.mjs

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CHANGESET_DIR = path.join(ROOT_DIR, '.changeset');

function getWorkspacePackageNames() {
  const output = execSync('pnpm ls -r --depth -1 --json', {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
  });
  const packages = JSON.parse(output);
  return new Set(packages.map((pkg) => pkg.name));
}

function getChangesetFiles() {
  if (!fs.existsSync(CHANGESET_DIR)) return [];
  return fs
    .readdirSync(CHANGESET_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => {
      const pkgMatch = line.match(/^['"]?([^'":\s]+)['"]?\s*:/);
      return pkgMatch ? pkgMatch[1] : null;
    })
    .filter(Boolean);
}

const workspaceNames = getWorkspacePackageNames();
const changesetFiles = getChangesetFiles();
const errors = [];

for (const file of changesetFiles) {
  const content = fs.readFileSync(path.join(CHANGESET_DIR, file), 'utf-8');
  const packageNames = parseFrontmatter(content);

  for (const name of packageNames) {
    if (!workspaceNames.has(name)) {
      errors.push({ file, name });
    }
  }
}

if (errors.length > 0) {
  console.error('Changeset package name errors found:\n');
  for (const { file, name } of errors) {
    console.error(`  .changeset/${file}: '${name}' is not a workspace package`);
  }
  console.error(`\nValid workspace packages:\n  ${[...workspaceNames].sort().join('\n  ')}`);
  console.error('\nHint: use `pnpm bump` to create changesets with validated package names.');
  process.exit(1);
}

console.log(`Checked ${changesetFiles.length} changeset(s) — all package names valid.`);
