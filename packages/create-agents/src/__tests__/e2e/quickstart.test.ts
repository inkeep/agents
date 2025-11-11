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

  it('should work e2e', async () => {
    const monorepoRoot = path.join(__dirname, '../../../../../');
    const createAgentsPrefix = path.join(monorepoRoot, 'create-agents-template');
    const projectTemplatesPrefix = path.join(monorepoRoot, 'agents-cookbook/template-projects');
    // Run the CLI with all options (non-interactive mode)
    console.log('Running CLI with options:');
    console.log(`Working directory: ${testDir}`);
    const result = await runCreateAgentsCLI(
      [
        workspaceName,
        '--openai-key',
        'test-openai-key',
        '--disable-git', // Skip git init for faster tests
        '--local-agents-prefix',
        createAgentsPrefix,
        '--local-templates-prefix',
        projectTemplatesPrefix,
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
      /DATABASE_URL=postgresql:\/\/appuser:password@localhost:5432\/inkeep_agents/,
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
    // Start dev servers in background with output monitoring
    const devProcess = execa('pnpm', ['dev'], {
      cwd: path.join(projectDir, 'apps/manage-api'),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NODE_ENV: 'test',
      },
      cleanup: true,
      detached: false,
      stderr: 'pipe',
    });

    // Monitor output for errors and readiness signals
    let serverOutput = '';
    const outputHandler = (data: Buffer) => {
      const text = data.toString();
      serverOutput += text;
      // Log important messages in CI
      if (process.env.CI) {
        if (text.includes('Error') || text.includes('EADDRINUSE') || text.includes('ready')) {
          console.log('[Server]:', text.trim());
        }
      }
    };

    if (devProcess.stderr) devProcess.stderr.on('data', outputHandler);

    // Handle process crashes during startup
    devProcess.catch((error) => {
      console.error('Dev process crashed during startup:', error.message);
      console.error('Server output:', serverOutput);
    });

    console.log('Waiting for servers to be ready');
    try {
      // Wait for servers to be ready with retries
      await waitForServerReady(`${manageApiUrl}/health`, 120000); // Increased to 2 minutes for CI
      console.log('Manage API is ready');

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

      // Link to local monorepo packages
      await linkLocalPackages(projectDir, monorepoRoot);

      const pushResultLocal = await runCommand(
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

      expect(pushResultLocal.exitCode).toBe(0);

      // Test that the project works with local packages
      const responseLocal = await fetch(`${manageApiUrl}/tenants/default/projects/${projectId}`);
      expect(responseLocal.status).toBe(200);
    } catch (error) {
      console.error('Test failed with error:', error);
      // Print server output for debugging
      if (devProcess.stdout) {
        const stdout = await devProcess.stdout;
        console.log('Server stdout:', stdout);
      }
      if (devProcess.stderr) {
        const stderr = await devProcess.stderr;
        console.error('Server stderr:', stderr);
      }
      throw error;
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
});
