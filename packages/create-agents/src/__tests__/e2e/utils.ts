import os from 'node:os';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import fs from 'fs-extra';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run the create-agents CLI with the given arguments
 */
export async function runCreateAgentsCLI(
  args: string[],
  cwd: string,
  timeout = 300000 // 5 minutes default for full flow
): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
  const cliPath = path.join(__dirname, '../../../src/index.ts');

  try {
    // Run using tsx to execute TypeScript directly
    const result = await execa('tsx', [cliPath, ...args], {
      cwd,
      timeout,
      env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for easier assertion
      all: true, // Capture combined stdout + stderr in order
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error: any) {
    // execa throws on non-zero exit codes, capture the error info
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.exitCode || 1,
    };
  }
}

/**
 * Run a command in the created project directory
 */
export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout = 120000 // 2 minutes default
): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
  try {
    const result = await execa(command, args, {
      cwd,
      timeout,
      env: { ...process.env, FORCE_COLOR: '0' },
      shell: true,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.exitCode || 1,
    };
  }
}

/**
 * Create a temporary directory for testing
 */
export async function createTempDir(prefix = 'create-agents-e2e-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Clean up a test directory with retries
 */
export async function cleanupDir(dir: string): Promise<void> {
  if (!(await fs.pathExists(dir))) {
    return;
  }

  try {
    // Try multiple times with delays (common in CI)
    for (let i = 0; i < 3; i++) {
      try {
        await fs.remove(dir);
        return;
      } catch (error: any) {
        if (i === 2) throw error; // Last attempt, throw the error
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s before retry
      }
    }
  } catch (error: any) {
    // If still failing, try force removal
    if (error.code === 'ENOTEMPTY' || error.code === 'EBUSY') {
      await execa('rm', ['-rf', dir], { shell: true }).catch(() => {
        console.warn(`Failed to clean up ${dir}`);
      });
    }
  }
}

/**
 * Verify that a file exists and optionally check its contents
 */
export async function verifyFile(
  filePath: string,
  expectedContents?: string[] | RegExp[]
): Promise<void> {
  const exists = await fs.pathExists(filePath);
  if (!exists) {
    throw new Error(`Expected file to exist: ${filePath}`);
  }

  if (expectedContents) {
    const content = await fs.readFile(filePath, 'utf-8');
    for (const expected of expectedContents) {
      if (typeof expected === 'string') {
        if (!content.includes(expected)) {
          throw new Error(`Expected file ${filePath} to contain: ${expected}`);
        }
      } else {
        if (!expected.test(content)) {
          throw new Error(`Expected file ${filePath} to match pattern: ${expected}`);
        }
      }
    }
  }
}

/**
 * Verify that a directory has the expected structure
 */
export async function verifyDirectoryStructure(
  baseDir: string,
  expectedPaths: string[]
): Promise<void> {
  for (const expectedPath of expectedPaths) {
    const fullPath = path.join(baseDir, expectedPath);
    const exists = await fs.pathExists(fullPath);
    if (!exists) {
      throw new Error(`Expected path to exist: ${fullPath}`);
    }
  }
}

/**
 * Link local monorepo packages to the created project
 * This replaces published @inkeep packages with local versions for testing
 */
export async function linkLocalPackages(projectDir: string, monorepoRoot: string): Promise<void> {
  const packageJsonPaths: string[] = [
    path.join(projectDir, 'package.json'),
    path.join(projectDir, 'apps/manage-api/package.json'),
    path.join(projectDir, 'apps/run-api/package.json'),
  ];
  const packageJsons: Record<string, any> = {};
  for (const packageJsonPath of packageJsonPaths) {
    packageJsons[packageJsonPath] = await fs.readJson(packageJsonPath);
  }

  // Define local @inkeep packages to link
  const inkeepPackages = {
    '@inkeep/agents-sdk': `link:${path.join(monorepoRoot, 'packages/agents-sdk')}`,
    '@inkeep/agents-core': `link:${path.join(monorepoRoot, 'packages/agents-core')}`,
    '@inkeep/agents-manage-api': `link:${path.join(monorepoRoot, 'agents-manage-api')}`,
    '@inkeep/agents-run-api': `link:${path.join(monorepoRoot, 'agents-run-api')}`,
    '@inkeep/agents-cli': `link:${path.join(monorepoRoot, 'agents-cli')}`,
  };

  // Replace package versions with local links
  for (const [pkg, linkPath] of Object.entries(inkeepPackages)) {
    for (const packageJsonPath of packageJsonPaths) {
      if (packageJsons[packageJsonPath].dependencies?.[pkg]) {
        packageJsons[packageJsonPath].dependencies[pkg] = linkPath;
      }
      if (packageJsons[packageJsonPath].devDependencies?.[pkg]) {
        packageJsons[packageJsonPath].devDependencies[pkg] = linkPath;
      }
    }
  }

  // Write updated package.json
  for (const packageJsonPath of packageJsonPaths) {
    await fs.writeJson(packageJsonPath, packageJsons[packageJsonPath], { spaces: 2 });
  }

  // Reinstall to create the symlinks
  await execa('pnpm', ['install', '--no-frozen-lockfile'], {
    cwd: projectDir,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
}

/**
 * Wait for a server to be ready by polling a health endpoint
 */
export async function waitForServerReady(url: string, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet, continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Check every second
  }
  throw new Error(`Server not ready at ${url} after ${timeout}ms`);
}
