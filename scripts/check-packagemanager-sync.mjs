#!/usr/bin/env node

/**
 * Validates that the monorepo root and public/agents packageManager fields
 * are in sync. Drift between these causes:
 * - Vercel deploy failures (ERR_PNPM_OUTDATED_LOCKFILE)
 * - CI pnpm/action-setup v5 conflicts
 * - Lockfile format mismatches
 *
 * Also checks that pnpm-lock.yaml exists in both locations and that the
 * lockfile version headers are compatible.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve paths relative to public/agents/scripts/
const publicAgentsRoot = resolve(__dirname, '..');
const monorepoRoot = process.env.INKEEP_PRIVATE_MONOREPO
  ? resolve(publicAgentsRoot, '../..')
  : null;

const errors = [];

// --- Check 1: packageManager field sync ---

const publicPkgPath = resolve(publicAgentsRoot, 'package.json');
if (!existsSync(publicPkgPath)) {
  console.error(
    '❌ public/agents/package.json not found. Are you running from the correct directory?'
  );
  process.exit(1);
}

const publicPkg = JSON.parse(readFileSync(publicPkgPath, 'utf8'));
const publicPM = publicPkg.packageManager;

if (!publicPM) {
  errors.push('public/agents/package.json is missing the packageManager field');
}

if (monorepoRoot) {
  const rootPkgPath = resolve(monorepoRoot, 'package.json');
  if (!existsSync(rootPkgPath)) {
    errors.push(`Monorepo root package.json not found at ${rootPkgPath}`);
  } else {
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
    const rootPM = rootPkg.packageManager;

    if (!rootPM) {
      errors.push('Root package.json is missing the packageManager field');
    } else if (rootPM !== publicPM) {
      errors.push(
        `packageManager mismatch:\n` +
          `  root:           ${rootPM}\n` +
          `  public/agents:  ${publicPM}\n` +
          `\n` +
          `  Fix: ensure both package.json files use the same packageManager value.`
      );
    }
  }

  // --- Check 2: Both lockfiles exist ---

  const rootLockPath = resolve(monorepoRoot, 'pnpm-lock.yaml');
  const publicLockPath = resolve(publicAgentsRoot, 'pnpm-lock.yaml');

  if (!existsSync(rootLockPath)) {
    errors.push('Root pnpm-lock.yaml is missing');
  }
  if (!existsSync(publicLockPath)) {
    errors.push('public/agents/pnpm-lock.yaml is missing');
  }

  // --- Check 3: Lockfile versions are compatible ---

  if (existsSync(rootLockPath) && existsSync(publicLockPath)) {
    const rootLockVersion = readFileSync(rootLockPath, 'utf8').match(
      /^lockfileVersion:\s*'?([^'\n]+)/m
    )?.[1];
    const publicLockVersion = readFileSync(publicLockPath, 'utf8').match(
      /^lockfileVersion:\s*'?([^'\n]+)/m
    )?.[1];

    if (rootLockVersion && publicLockVersion && rootLockVersion !== publicLockVersion) {
      errors.push(
        `Lockfile version mismatch:\n` +
          `  root:           ${rootLockVersion}\n` +
          `  public/agents:  ${publicLockVersion}\n` +
          `\n` +
          `  This usually means the lockfiles were generated with different pnpm versions.\n` +
          `  Fix: regenerate both lockfiles with the same pnpm version.`
      );
    }
  }
} else {
  // Running outside the monorepo (e.g., in the public repo directly) - skip root checks
  console.log(
    'Not running in monorepo context (INKEEP_PRIVATE_MONOREPO not set), skipping root checks'
  );
}

// --- Report ---

if (errors.length > 0) {
  console.error('❌ packageManager sync check failed:\n');
  for (const error of errors) {
    console.error(`  - ${error}\n`);
  }
  process.exit(1);
} else {
  const checks = monorepoRoot
    ? 'packageManager fields match, lockfiles present and compatible'
    : 'public/agents packageManager field present';
  console.log(`✅ packageManager sync check passed (${checks})`);
  process.exit(0);
}
