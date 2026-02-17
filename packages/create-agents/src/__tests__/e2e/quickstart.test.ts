import path from 'node:path';
import { execa } from 'execa';
import { chromium } from 'playwright';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupDir,
  createTempDir,
  linkLocalPackages,
  runCommand,
  runCreateAgentsCLI,
  startDashboardServer,
  verifyDirectoryStructure,
  verifyFile,
  waitForServerReady,
} from './utils';

// Use 127.0.0.1 instead of localhost to avoid IPv6/IPv4 resolution issues on CI (Ubuntu)
const manageApiUrl = 'http://127.0.0.1:3002';

// Use a test bypass secret for authentication in CI
// This bypasses the need for a real login/API key
const TEST_BYPASS_SECRET = 'e2e-test-bypass-secret-for-ci-testing-only';

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
        '--skip-provider',
        '--disable-git',
        '--local-agents-prefix',
        createAgentsPrefix,
        '--local-templates-prefix',
        projectTemplatesPrefix,
        '--skip-inkeep-cli',
        '--skip-inkeep-mcp',
        '--skip-install',
      ],
      testDir
    );
    // Verify the CLI completed successfully
    expect(
      result.exitCode,
      `CLI failed with exit code ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    ).toBe(0);

    console.log('CLI completed successfully');

    // Verify the core directory structure
    console.log('Verifying directory structure...');
    await verifyDirectoryStructure(projectDir, [
      'src',
      'src/inkeep.config.ts',
      `src/projects/${projectId}`,
      'apps/agents-api',
      'apps/mcp',
      'apps/manage-ui',
      '.env',
      'package.json',
      'drizzle.manage.config.ts',
      'drizzle.run.config.ts',
    ]);
    console.log('Directory structure verified');

    // Verify .env file has required variables
    console.log('Verifying .env file...');
    await verifyFile(path.join(projectDir, '.env'), [
      /ENVIRONMENT=development/,
      /INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql:\/\/appuser:password@localhost:5432\/inkeep_agents/,
      /INKEEP_AGENTS_RUN_DATABASE_URL=postgresql:\/\/appuser:password@localhost:5433\/inkeep_agents/,
      /INKEEP_AGENTS_API_URL="http:\/\/127\.0\.0\.1:3002"/,
      /INKEEP_AGENTS_JWT_SIGNING_SECRET=\w+/,
    ]);
    console.log('.env file verified');

    // Verify inkeep.config.ts was created
    console.log('Verifying inkeep.config.ts...');
    await verifyFile(path.join(projectDir, 'src/inkeep.config.ts'));
    console.log('inkeep.config.ts verified');

    // Link to local monorepo packages (also runs pnpm install --no-frozen-lockfile)
    console.log('Linking local monorepo packages...');
    await linkLocalPackages(projectDir, monorepoRoot);
    console.log('Local monorepo packages linked and dependencies installed');

    console.log('Setting up project in database');
    // Pass bypass secret so setup-dev:cloud's internal push can authenticate
    await runCommand({
      command: 'pnpm',
      args: ['setup-dev:cloud'],
      cwd: projectDir,
      timeout: 600000, // 10 minutes for CI (includes migrations, server startup, push)
      env: {
        INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: TEST_BYPASS_SECRET,
        INKEEP_API_KEY: TEST_BYPASS_SECRET,
        INKEEP_CI: 'true',
        SKIP_UPGRADE: 'true', // Packages are already linked locally, skip pnpm update --latest
      },
      stream: true,
    });
    console.log('Project setup in database');

    console.log('Starting dev servers');
    // Start dev servers in background with output monitoring
    const devProcess = execa('pnpm', ['dev'], {
      cwd: path.join(projectDir, 'apps/agents-api'),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NODE_ENV: 'test',
        // Set bypass secret for authentication in CI
        INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: TEST_BYPASS_SECRET,
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
      const pushResult = await runCommand({
        command: 'pnpm',
        args: [
          'inkeep',
          'push',
          '--project',
          `src/projects/${projectId}`,
          '--config',
          'src/inkeep.config.ts',
        ],
        cwd: projectDir,
        timeout: 30000,
        env: { INKEEP_API_KEY: TEST_BYPASS_SECRET, INKEEP_CI: 'true' },
      });

      expect(
        pushResult.exitCode,
        `Push failed with exit code ${pushResult.exitCode}\nstdout: ${pushResult.stdout}\nstderr: ${pushResult.stderr}`
      ).toBe(0);

      console.log('Testing API requests');
      // Test API requests with bypass secret authentication
      const response = await fetch(`${manageApiUrl}/manage/tenants/default/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${TEST_BYPASS_SECRET}`,
        },
      });

      const data = await response.json();
      expect(data.data.tenantId).toBe('default');
      expect(data.data.id).toBe(projectId);

      // --- Dashboard Lap ---
      console.log('Starting dashboard lap');
      const dashboardProcess = await startDashboardServer(projectDir, {
        INKEEP_AGENTS_API_URL: manageApiUrl,
        NEXT_PUBLIC_API_URL: manageApiUrl,
        PUBLIC_INKEEP_AGENTS_API_URL: manageApiUrl,
        BETTER_AUTH_SECRET: 'test-secret-key-for-ci',
        INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: TEST_BYPASS_SECRET,
      });
      console.log('Dashboard server started');

      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();

        console.log('Navigating to login page');
        await page.goto('http://localhost:3000/login', {
          waitUntil: 'networkidle',
          timeout: 15000,
        });

        console.log('Filling login form');
        await page.fill('input[type="email"]', 'admin@example.com');
        await page.fill('input[type="password"]', 'adminADMIN!@12');
        await page.click('button[type="submit"]');

        console.log('Waiting for redirect to projects page');
        await page.waitForURL('**/default/projects**', { timeout: 15000 });
        console.log('Redirected to projects page');

        console.log('Clicking activities-planner project');
        await page.click(`text=${projectId}`, { timeout: 15000 });
        await page.waitForURL(`**/default/projects/${projectId}/**`, { timeout: 15000 });
        console.log('Navigated to project page');

        console.log('Clicking agent card');
        await page.click('text=Activities planner', { timeout: 15000 });
        await page.waitForURL(`**/agents/**`, { timeout: 15000 });
        console.log('Navigated to agent page');

        console.log('Clicking Try it button');
        await page.click('button:has-text("Try it")', { timeout: 15000 });

        console.log('Waiting for playground to open');
        await page.waitForSelector(
          '[data-testid="playground-panel"], [role="dialog"], [class*="playground"]',
          { timeout: 15000 }
        );
        console.log('Playground panel is visible');

        console.log('Dashboard lap complete');
      } catch (dashboardError) {
        console.error('Dashboard lap failed:', dashboardError);
        try {
          const activePage = browser.contexts()[0]?.pages()[0];
          if (activePage) {
            const screenshotPath = path.join(testDir, 'dashboard-failure.png');
            await activePage.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot saved to: ${screenshotPath}`);
            console.log(`Current URL: ${activePage.url()}`);
            console.log(`Page content: ${await activePage.content()}`);
          }
        } catch {
          console.error('Failed to capture screenshot');
        }
        throw dashboardError;
      } finally {
        await browser.close();
        try {
          dashboardProcess.kill('SIGTERM');
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          dashboardProcess.kill('SIGKILL');
        } catch {}
      }
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
  }, 900000); // 15 minute timeout for full flow with network calls (CI can be slow)
});
