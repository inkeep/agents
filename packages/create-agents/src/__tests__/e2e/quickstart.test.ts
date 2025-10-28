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

  it('should work with published packages', async () => {
    // Run the CLI with all options (non-interactive mode)
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

    // Verify the core directory structure
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

    // Verify .env file has required variables
    await verifyFile(path.join(projectDir, '.env'), [
      /ENVIRONMENT=development/,
      /OPENAI_API_KEY=test-openai-key/,
      /DB_FILE_NAME=file:.*\/local\.db/,
      /INKEEP_AGENTS_MANAGE_API_URL="http:\/\/localhost:3002"/,
      /INKEEP_AGENTS_RUN_API_URL="http:\/\/localhost:3003"/,
      /INKEEP_AGENTS_JWT_SIGNING_SECRET=\w+/, // Random secret should be generated
    ]);

    // Verify inkeep.config.ts was created
    await verifyFile(path.join(projectDir, 'src/inkeep.config.ts'));

    // Start dev servers in background
    const devProcess = execa('pnpm', ['dev'], {
      cwd: projectDir,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    try {
      // Wait for servers to be ready
      await waitForServerReady('http://localhost:3002/health', 60000);
      await waitForServerReady('http://localhost:3003/health', 60000);

      // Test API requests
      const response = await fetch(`http://localhost:3002/tenants/default/projects/${projectId}`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.tenantId).toBe('default');
      expect(data.data.id).toBe(projectId);
    } finally {
      // Always kill the dev process
      devProcess.kill('SIGTERM');
      await devProcess.catch(() => {}); // Ignore kill errors
    }
  }, 600000); // 10 minute timeout for full flow with network calls

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
    const devProcess = execa('pnpm', ['dev'], {
      cwd: projectDir,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    try {
      // Wait for servers to be ready
      await waitForServerReady('http://localhost:3002/health', 60000);
      await waitForServerReady('http://localhost:3003/health', 60000);

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
      const response = await fetch(`http://localhost:3002/tenants/default/projects/${projectId}`);
      expect(response.status).toBe(200);
    } finally {
      devProcess.kill('SIGTERM');
      await devProcess.catch(() => {});
    }
  }, 600000); // 10 minute timeout for install + build + dev
});
