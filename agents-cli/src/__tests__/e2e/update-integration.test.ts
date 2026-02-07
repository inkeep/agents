/**
 * Integration test for the `inkeep update` command across package managers.
 *
 * For each of npm, pnpm, and bun, exercises the full flow:
 *   1. Install an older published version globally
 *   2. Verify the installed version matches
 *   3. Run `inkeep update --force`
 *   4. Verify the version is now the latest
 *
 * This file is excluded from `pnpm test` / CI (via vitest.config.ts and
 * vitest.config.ci.ts). Run manually:
 *
 *   npx vitest --run --config vitest.config.e2e.ts
 *
 * Each PM test is fully isolated — it uninstalls from ALL other PMs first,
 * so `detectPackageManager()` inside `inkeep update` always finds the
 * correct one. All prior state is restored on teardown.
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execAsync = promisify(exec);

const PACKAGE_NAME = '@inkeep/agents-cli';

type PM = 'npm' | 'pnpm' | 'bun';

// ── Shell helpers ────────────────────────────────────────────────────

async function run(cmd: string, timeoutMs = 60_000): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, {
    timeout: timeoutMs,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
}

async function tryRun(cmd: string, timeoutMs = 30_000): Promise<string | null> {
  try {
    const { stdout } = await run(cmd, timeoutMs);
    return stdout;
  } catch {
    return null;
  }
}

/** Returns true if a command is available on PATH. */
async function isAvailable(bin: string): Promise<boolean> {
  return (await tryRun(`which ${bin}`)) !== null;
}

// ── PM-specific helpers ──────────────────────────────────────────────

function installCmd(pm: PM, version: string): string {
  switch (pm) {
    case 'npm':
      return `npm install -g ${PACKAGE_NAME}@${version}`;
    case 'pnpm':
      return `pnpm add -g ${PACKAGE_NAME}@${version}`;
    case 'bun':
      return `bun add -g ${PACKAGE_NAME}@${version}`;
  }
}

function uninstallCmd(pm: PM): string {
  switch (pm) {
    case 'npm':
      return `npm uninstall -g ${PACKAGE_NAME}`;
    case 'pnpm':
      return `pnpm remove -g ${PACKAGE_NAME}`;
    case 'bun':
      return `bun remove -g ${PACKAGE_NAME}`;
  }
}

/** Resolve the CLI entry point path for a given PM's global install. */
async function resolveCliPath(pm: PM): Promise<string> {
  switch (pm) {
    case 'npm': {
      const { stdout } = await run('npm prefix -g');
      return `${stdout.trim()}/lib/node_modules/${PACKAGE_NAME}/dist/index.js`;
    }
    case 'pnpm': {
      // pnpm global dir structure: <store>/node_modules/@inkeep/agents-cli/dist/index.js
      const { stdout } = await run('pnpm root -g');
      return `${stdout.trim()}/${PACKAGE_NAME}/dist/index.js`;
    }
    case 'bun': {
      // bun global installs to ~/.bun/install/global/node_modules/...
      const { stdout } = await run('bun pm ls -g --json');
      // Parse to find the package path, or use the default location
      const bunRoot = (await tryRun('echo $BUN_INSTALL'))?.trim() || `${process.env.HOME}/.bun`;
      return `${bunRoot}/install/global/node_modules/${PACKAGE_NAME}/dist/index.js`;
    }
  }
}

/** Read the installed version by invoking the CLI entry with node. */
async function getInstalledVersion(cliPath: string): Promise<string> {
  const { stdout } = await run(`node "${cliPath}" --version`);
  return stdout.trim();
}

/** Check if a PM has the CLI installed globally. Returns version or null. */
async function getGlobalVersion(pm: PM): Promise<string | null> {
  switch (pm) {
    case 'npm': {
      const out = await tryRun(`npm list -g ${PACKAGE_NAME} --depth=0 --json`);
      if (!out) return null;
      try {
        const json = JSON.parse(out);
        return json.dependencies?.[PACKAGE_NAME]?.version ?? null;
      } catch {
        return null;
      }
    }
    case 'pnpm': {
      const out = await tryRun(`pnpm list -g ${PACKAGE_NAME} --depth=0`);
      if (!out?.includes(PACKAGE_NAME)) return null;
      const match = out.match(/@inkeep\/agents-cli\s+([\d.]+)/);
      return match ? match[1] : null;
    }
    case 'bun': {
      const out = await tryRun('bun pm ls -g');
      if (!out?.includes(PACKAGE_NAME)) return null;
      const match = out.match(/@inkeep\/agents-cli@([\d.]+)/);
      return match ? match[1] : null;
    }
  }
}

// ── Version discovery (shared once across all PM tests) ──────────────

/**
 * Fetch all published stable versions (excludes pre-release tags).
 */
async function fetchStableVersions(): Promise<string[]> {
  const { stdout } = await run(`npm view ${PACKAGE_NAME} versions --json`, 30_000);
  const all: string[] = JSON.parse(stdout);
  return all.filter((v) => !v.startsWith('0.0.0-'));
}

// ── Test suite ───────────────────────────────────────────────────────

const ALL_PMS: PM[] = ['npm', 'pnpm', 'bun'];

describe('CLI update integration test', () => {
  let latestVersion: string;
  let olderVersion: string;

  // Saved global state per PM so we can restore on teardown
  const savedVersions: Record<PM, string | null> = { npm: null, pnpm: null, bun: null };

  // Which PMs are actually available on this machine
  let availablePMs: PM[];

  // ── One-time setup: discover versions & save state ───────────
  beforeAll(async () => {
    // 1. Detect which PMs are available
    const checks = await Promise.all(
      ALL_PMS.map(async (pm) => ({ pm, ok: await isAvailable(pm) }))
    );
    availablePMs = checks.filter((c) => c.ok).map((c) => c.pm);
    console.log(`[setup] Available PMs: ${availablePMs.join(', ')}`);

    if (availablePMs.length === 0) {
      throw new Error('No package managers found on PATH');
    }

    // 2. Save existing global install state for ALL PMs (so we can restore)
    for (const pm of availablePMs) {
      savedVersions[pm] = await getGlobalVersion(pm);
      if (savedVersions[pm]) {
        console.log(`[setup] ${pm}: pre-existing global install v${savedVersions[pm]}`);
      }
    }

    // 3. Fetch stable versions from npm registry
    const versions = await fetchStableVersions();
    if (versions.length < 2) {
      throw new Error('Need at least 2 stable published versions');
    }

    latestVersion = versions[versions.length - 1];

    // Pick a version a few behind latest
    const targetIdx = Math.max(0, versions.length - 4);
    olderVersion = versions[targetIdx];
    if (olderVersion === latestVersion) {
      olderVersion = versions[versions.length - 2];
    }

    console.log(
      `[setup] older=${olderVersion}, latest=${latestVersion} (${versions.length} stable versions)`
    );
  }, 60_000);

  // ── Final teardown: restore all saved state ──────────────────
  afterAll(async () => {
    for (const pm of availablePMs) {
      try {
        // Remove whatever the tests left behind
        const current = await getGlobalVersion(pm);
        if (current) {
          console.log(`[teardown] Removing ${pm} global install (v${current})`);
          await run(uninstallCmd(pm), 60_000);
        }

        // Restore the original version if there was one
        if (savedVersions[pm]) {
          console.log(`[teardown] Restoring ${pm} → v${savedVersions[pm]}`);
          await run(installCmd(pm, savedVersions[pm]!), 120_000);
        }
      } catch (err) {
        console.warn(`[teardown] ${pm} restore failed:`, err);
      }
    }
  }, 600_000);

  // ── Per-PM test generator ────────────────────────────────────
  for (const pm of ALL_PMS) {
    describe(`${pm}`, () => {
      it(`should install, update, and verify with ${pm}`, async () => {
        // Skip if this PM isn't available
        if (!availablePMs.includes(pm)) {
          console.log(`[${pm}] Skipping — not available on PATH`);
          return;
        }

        // ── Isolate: remove CLI from ALL PMs so detectPackageManager() is unambiguous
        for (const other of availablePMs) {
          const ver = await getGlobalVersion(other);
          if (ver) {
            console.log(`[${pm}] Removing ${other} global install (v${ver}) for isolation`);
            await run(uninstallCmd(other), 60_000);
          }
        }

        // ── Step 1: Install the older version
        console.log(`[${pm}] Installing ${PACKAGE_NAME}@${olderVersion}`);
        const { stderr: installStderr } = await run(installCmd(pm, olderVersion), 180_000);

        // Check for the zod mismatch — pnpm may resolve zod v3 if other
        // globally-installed packages (mastra, nango, etc.) bring it in.
        // In that case the CLI will crash at import time.
        const cliPath = await resolveCliPath(pm);
        let cliWorks = true;
        try {
          const before = await getInstalledVersion(cliPath);
          console.log(`[${pm}] Step 1: version = ${before}`);
          expect(before).toBe(olderVersion);
        } catch (err) {
          const msg = (err as Error).message || '';
          if (msg.includes('Cannot read properties of undefined') && msg.includes('parent')) {
            console.warn(
              `[${pm}] ⚠ Older version crashes due to zod v3/v4 mismatch (known pnpm issue). ` +
                'Skipping update test for this PM.'
            );
            cliWorks = false;
          } else {
            throw err;
          }
        }

        if (!cliWorks) {
          // Clean up and skip — the CLI can't even start, so we can't test update
          await run(uninstallCmd(pm), 60_000).catch(() => {});
          return;
        }

        // ── Step 2: Run `inkeep update --force`
        console.log(`[${pm}] Step 2: running update --force`);
        const { stdout: updateStdout, stderr: updateStderr } = await run(
          `node "${cliPath}" update --force`,
          180_000
        );

        console.log(`[${pm}] update stdout:`, updateStdout);
        if (updateStderr) {
          console.log(`[${pm}] update stderr:`, updateStderr);
        }

        expect(updateStdout).toContain('Update completed successfully');

        // ── Step 3: Verify version changed
        const updatedCliPath = await resolveCliPath(pm);
        const after = await getInstalledVersion(updatedCliPath);
        console.log(`[${pm}] Step 3: version after update = ${after}`);

        expect(after).toMatch(/^\d+\.\d+\.\d+/);
        expect(after).not.toBe(olderVersion);
        expect(after).toBe(latestVersion);

        console.log(`[${pm}] ✓ Update flow passed`);
      }, 360_000); // 6 min per PM
    });
  }
});
