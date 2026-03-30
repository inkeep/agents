#!/usr/bin/env node

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const GENERATED_PATHS = [
  'packages/agents-core/drizzle/manage',
  'packages/agents-core/drizzle/runtime',
];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function fail(message, details) {
  console.error(`❌ ${message}`);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function getDiffSummary() {
  return run('git', ['diff', '--stat', '--', ...GENERATED_PATHS]);
}

function getChangedFiles() {
  return run('git', ['diff', '--name-only', '--', ...GENERATED_PATHS])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  console.log('Regenerating committed Drizzle migration artifacts...');

  try {
    run('pnpm', ['db:manage:generate']);
    run('pnpm', ['db:run:generate']);
  } catch (error) {
    fail(
      'Failed to regenerate Drizzle migrations. Resolve the generator error before merging.',
      error instanceof Error ? error.message : String(error)
    );
  }

  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    console.log('✅ Committed Drizzle migration artifacts are up to date.');
    return;
  }

  const diffSummary = getDiffSummary();
  fail(
    'Committed Drizzle migration artifacts are stale. Re-run the migration generator and commit the updated drizzle artifacts.',
    `${changedFiles.join('\n')}\n\n${diffSummary}`
  );
}

main();
