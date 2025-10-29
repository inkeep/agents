import path from 'node:path';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupDir,
  createTempDir,
  linkLocalPackages,
  runCommand,
  runCreateAgentsCLI,
  verifyDirectoryStructure,
  verifyFile,
  waitForServerReady,
} from './utils';

const manageApiUrl = 'http://localhost:3002';
const runApiUrl = 'http://localhost:3003';

describe('create-agents quickstart e2e', () => {
  let testDir: string;
  let projectDir: string;
  const workspaceName = 'test-project';
  const projectId = 'activities-planner';

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await createTempDir();
    projectDir = path.join(testDir, workspaceName);
  });

  afterEach(async () => {
    await cleanupDir(testDir);
  });

  it('should work with published packages', async () => {
    // Run the CLI with all options (non-interactive mode)
    console.log('Running CLI with options:');
    console.log(`Working directory: ${testDir}`);
    const result = await runCreateAgentsCLI(
      [
        workspaceName,
        '--openai-key',
        'test-openai-key',
        '--disable-git', // Skip git init for faster tests
      ],
      testDir
    );
    // Verify the CLI completed successfully
    expect(result.exitCode).toBe(0);

    console.log('CLI completed successfully');

    // Verify the core directory structure
    console.log('Verifying directory structure...');
    await verifyDirectoryStructure(projectDir, [
      'src',
      'src/inkeep.config.ts',
      `src/projects/${projectId}`,
      'apps/manage-api',
      'apps/run-api',
      'apps/mcp',
      'apps/manage-ui',
      '.env',
      'package.json',
      'drizzle.config.ts',
    ]);
    console.log('Directory structure verified');

    // Verify .env file has required variables
    console.log('Verifying .env file...');
    await verifyFile(path.join(projectDir, '.env'), [
      /ENVIRONMENT=development/,
      /OPENAI_API_KEY=test-openai-key/,
      /DB_FILE_NAME=file:.*\/local\.db/,
      /INKEEP_AGENTS_MANAGE_API_URL="http:\/\/localhost:3002"/,
      /INKEEP_AGENTS_RUN_API_URL="http:\/\/localhost:3003"/,
      /INKEEP_AGENTS_JWT_SIGNING_SECRET=\w+/, // Random secret should be generated
    ]);
    console.log('.env file verified');

    // Verify inkeep.config.ts was created
    console.log('Verifying inkeep.config.ts...');
    await verifyFile(path.join(projectDir, 'src/inkeep.config.ts'));
    console.log('inkeep.config.ts verified');

    console.log('Starting dev servers');
    // Start dev servers in background
    const devProcess = execa('pnpm', ['dev:all'], {
      cwd: projectDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      cleanup: true, // Ensure child processes are cleaned up
      detached: false, // Keep attached to allow proper cleanup
    });

    console.log('Waiting for servers to be ready');
    try {
      // Wait for servers to be ready
      await waitForServerReady(`${manageApiUrl}/health`, 60000);
      await waitForServerReady(`${runApiUrl}/health`, 60000);

      console.log('Pushing project');
      const pushResult = await runCommand(
        'pnpm',
        [
          'inkeep',
          'push',
          '--project',
          `src/projects/${projectId}`,
          '--config',
          'src/inkeep.config.ts',
        ],
        projectDir,
        30000
      );

      expect(pushResult.exitCode).toBe(0);

      console.log('Testing API requests');
      // Test API requests
      const response = await fetch(`${manageApiUrl}/tenants/default/projects/${projectId}`);

      const data = await response.json();
      expect(data.data.tenantId).toBe('default');
      expect(data.data.id).toBe(projectId);
    } finally {
      console.log('Killing dev process');

      // Kill the process and wait for it to die
      try {
        devProcess.kill('SIGTERM');
      } catch {
        // Might already be dead
      }

      // Give it 2 seconds to shut down gracefully, then force kill
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        devProcess.kill('SIGKILL');
      } catch {
        // Already dead or couldn't kill
      }

      // Wait for the process to be fully cleaned up (with timeout)
      await Promise.race([
        devProcess.catch(() => {}), // Wait for process to exit
        new Promise((resolve) => setTimeout(resolve, 5000)), // Or timeout after 5s
      ]);

      console.log('Dev process cleanup complete');
    }
  }, 720000); // 12 minute timeout for full flow with network calls (CI can be slow)

  it('should work with local monorepo packages', async () => {
    // Create the project
    const result = await runCreateAgentsCLI(
      [workspaceName, '--openai-key', 'test-openai-key', '--disable-git'],
      testDir
    );

    expect(result.exitCode).toBe(0);

    // Link to local monorepo packages
    const monorepoRoot = path.join(__dirname, '../../../../../'); // Go up to repo root
    await linkLocalPackages(projectDir, monorepoRoot);

    // Start dev servers with local packages
    const devProcess = execa('pnpm', ['dev:all'], {
      cwd: projectDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      cleanup: true, // Ensure child processes are cleaned up
      detached: false, // Keep attached to allow proper cleanup
    });

    try {
      // Wait for servers to be ready
      await waitForServerReady(`${manageApiUrl}/health`, 60000);
      await waitForServerReady(`${runApiUrl}/health`, 60000);

      const pushResult = await runCommand(
        'pnpm',
        [
          'inkeep',
          'push',
          '--project',
          `src/projects/${projectId}`,
          '--config',
          'src/inkeep.config.ts',
        ],
        projectDir,
        30000
      );

      expect(pushResult.exitCode).toBe(0);

      // Test that the project works with local packages
      const response = await fetch(`${manageApiUrl}/tenants/default/projects/${projectId}`);
      expect(response.status).toBe(200);
    } finally {
      console.log('Killing dev process');

      // Kill the process and wait for it to die
      try {
        devProcess.kill('SIGTERM');
      } catch {
        // Might already be dead
      }

      // Give it 2 seconds to shut down gracefully, then force kill
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        devProcess.kill('SIGKILL');
      } catch {
        // Already dead or couldn't kill
      }

      // Wait for the process to be fully cleaned up (with timeout)
      await Promise.race([
        devProcess.catch(() => {}), // Wait for process to exit
        new Promise((resolve) => setTimeout(resolve, 5000)), // Or timeout after 5s
      ]);

      console.log('Dev process cleanup complete');
    }
  }, 720000); // 12 minute timeout for install + build + dev (CI can be slow)
});
