#!/usr/bin/env node

// Shared utility for resolving workspace package names.
// Used by quick-changeset.mjs and check-changeset-packages.mjs.

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let _cached;

export function getWorkspacePackages() {
  if (_cached) return _cached;

  const output = execSync('pnpm ls -r --depth -1 --json', {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
  });
  const packages = JSON.parse(output);
  const scopedNames = new Set(packages.map((pkg) => pkg.name));

  const shortToScoped = new Map();
  for (const name of scopedNames) {
    shortToScoped.set(name, name);
    const short = name.replace(/^@[^/]+\//, '');
    if (short !== name && !scopedNames.has(short)) {
      shortToScoped.set(short, name);
    }
  }

  _cached = { scopedNames, shortToScoped };
  return _cached;
}
