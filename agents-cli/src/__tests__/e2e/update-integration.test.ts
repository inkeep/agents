/**
 * Integration test for the `inkeep update` command.
 *
 * Exercises the real global install → update flow end-to-end:
 *   1. Install an older published version of @inkeep/agents-cli globally (npm)
 *   2. Verify the installed version matches the older version
 *   3. Run `inkeep update --force` to update to the latest
 *   4. Verify the installed version is now the latest
 *
 * This file is excluded from the normal `pnpm test` / CI vitest runs
 * (via vitest.config.ts and vitest.config.ci.ts). Run it manually:
 *
 *   npx vitest --run src/__tests__/e2e/update-integration.test.ts
 *
 * Notes:
 *  - Uses **npm** for global installs because npm resolves a fully isolated
 *    dependency tree per package (avoiding pnpm's stale-resolution bugs).
 *  - Invokes the CLI binary via `node <path>` instead of bare `inkeep` because
 *    the published dist/index.js currently lacks a `#!/usr/bin/env node` shebang,
 *    so npm's symlink in the global bin isn't directly executable.
 *  - Temporarily removes any pre-existing pnpm global install of the CLI so that
 *    `detectPackageManager()` inside the update command correctly finds npm.
 *  - Restores all prior state on teardown (even if the test fails).
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execAsync = promisify(exec);

const PACKAGE_NAME = '@inkeep/agents-cli';

// ── Helpers ──────────────────────────────────────────────────────────

/** Run a shell command. Throws on non-zero exit. */
async function run(cmd: string, timeoutMs = 60_000): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, {
    timeout: timeoutMs,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
}

/** Quietly try a command — returns stdout on success, null on failure. */
async function tryRun(cmd: string, timeoutMs = 30_000): Promise<string | null> {
  try {
    const { stdout } = await run(cmd, timeoutMs);
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Resolve the path to the CLI entry point inside npm's global tree.
 * e.g. /home/user/.nvm/versions/node/v22/lib/node_modules/@inkeep/agents-cli/dist/index.js
 */
async function npmGlobalCliPath(): Promise<string> {
  const { stdout } = await run('npm prefix -g');
  const prefix = stdout.trim();
  return `${prefix}/lib/node_modules/${PACKAGE_NAME}/dist/index.js`;
}

/**
 * Read the installed version by running the CLI entry point with node.
 * This bypasses the missing-shebang issue.
 */
async function getInstalledVersion(cliPath: string): Promise<string> {
  const { stdout } = await run(`node "${cliPath}" --version`);
  return stdout.trim();
}

/**
 * Check if pnpm has the CLI installed globally. Returns the version or null.
 */
async function pnpmGlobalVersion(): Promise<string | null> {
  const out = await tryRun(`pnpm list -g ${PACKAGE_NAME} --depth=0`);
  if (!out?.includes(PACKAGE_NAME)) return null;
  const match = out.match(/@inkeep\/agents-cli\s+([\d.]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch all published *stable* versions (excludes pre-release tags like
 * 0.0.0-dev-* and 0.0.0-chat-to-edit-*).
 */
async function fetchStableVersions(): Promise<string[]> {
  const { stdout } = await run(`npm view ${PACKAGE_NAME} versions --json`, 30_000);
  const all: string[] = JSON.parse(stdout);
  return all.filter((v) => !v.startsWith('0.0.0-'));
}

// ── Test suite ───────────────────────────────────────────────────────

describe('CLI update integration test', () => {
  let latestVersion: string;
  let olderVersion: string;
  let cliEntryPath: string;

  // State to restore on teardown
  let savedPnpmVersion: string | null = null;

  // ── Setup ──────────────────────────────────────────────────────
  beforeAll(async () => {
    // 1. If pnpm has the CLI installed globally, uninstall it temporarily
    //    so that detectPackageManager() won't pick pnpm over npm.
    savedPnpmVersion = await pnpmGlobalVersion();
    if (savedPnpmVersion) {
      console.log(`[setup] Temporarily removing pnpm global install (v${savedPnpmVersion})`);
      await run(`pnpm remove -g ${PACKAGE_NAME}`, 60_000);
    }

    // 2. Fetch stable versions from npm
    const versions = await fetchStableVersions();
    if (versions.length < 2) {
      throw new Error('Need at least 2 stable published versions to test the update flow');
    }

    latestVersion = versions[versions.length - 1];

    // Pick a version a few behind latest so the delta is meaningful
    const targetIdx = Math.max(0, versions.length - 4);
    olderVersion = versions[targetIdx];
    if (olderVersion === latestVersion) {
      olderVersion = versions[versions.length - 2];
    }

    console.log(
      `[setup] older=${olderVersion}, latest=${latestVersion} (${versions.length} stable versions)`
    );

    // 3. Install the older version globally via npm
    console.log(`[setup] npm install -g ${PACKAGE_NAME}@${olderVersion}`);
    await run(`npm install -g ${PACKAGE_NAME}@${olderVersion}`, 180_000);

    // 4. Resolve the CLI entry path
    cliEntryPath = await npmGlobalCliPath();
    console.log(`[setup] CLI entry: ${cliEntryPath}`);
  }, 300_000); // 5 min — npm global installs with full dep tree can be slow

  // ── Teardown ───────────────────────────────────────────────────
  afterAll(async () => {
    // Always uninstall the npm global install (we don't want to leave it)
    try {
      console.log('[teardown] Removing npm global install');
      await run(`npm uninstall -g ${PACKAGE_NAME}`, 60_000);
    } catch (err) {
      console.warn('[teardown] npm uninstall failed:', err);
    }

    // Restore pnpm global install if one existed before the test
    if (savedPnpmVersion) {
      try {
        console.log(`[teardown] Restoring pnpm global install (v${savedPnpmVersion})`);
        await run(`pnpm add -g ${PACKAGE_NAME}@${savedPnpmVersion}`, 120_000);
      } catch (err) {
        console.warn('[teardown] pnpm restore failed:', err);
      }
    }
  }, 300_000);

  // ── Test ───────────────────────────────────────────────────────
  it('should install old version, update, and verify new version', async () => {
    // ── Step 1: Verify the older version is installed ──
    const before = await getInstalledVersion(cliEntryPath);
    console.log(`[step 1] Installed version: ${before}`);
    expect(before).toBe(olderVersion);

    // ── Step 2: Run `inkeep update --force` ──
    // We invoke via `node <path>` to work around the missing shebang.
    // The update command will:
    //   • detectPackageManager() → npm (pnpm was removed in setup)
    //   • executeUpdate('npm') → `npm install -g @inkeep/agents-cli@latest`
    console.log('[step 2] Running: inkeep update --force');
    const { stdout: updateStdout, stderr: updateStderr } = await run(
      `node "${cliEntryPath}" update --force`,
      180_000
    );

    console.log('[step 2] stdout:', updateStdout);
    if (updateStderr) {
      console.log('[step 2] stderr:', updateStderr);
    }

    // The update command prints this on success
    expect(updateStdout).toContain('Update completed successfully');

    // ── Step 3: Re-resolve the CLI path (npm may have changed it) ──
    // After `npm install -g @latest`, the file at cliEntryPath should be
    // overwritten in-place, but let's re-resolve to be safe.
    const updatedCliPath = await npmGlobalCliPath();

    // ── Step 4: Verify the version changed ──
    const after = await getInstalledVersion(updatedCliPath);
    console.log(`[step 4] Version after update: ${after}`);

    expect(after).toMatch(/^\d+\.\d+\.\d+/);
    expect(after).not.toBe(olderVersion);
    expect(after).toBe(latestVersion);
  }, 360_000); // 6 min
});
