import type { ChildProcess } from 'node:child_process';
import { execSync, fork } from 'node:child_process';
import path from 'node:path';
import { execa } from 'execa';
import { chromium } from 'playwright';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const manageApiUrl = 'http://127.0.0.1:3002';

const TEST_BYPASS_SECRET = 'e2e-test-bypass-secret-for-ci-testing-only';

describe('create-agents quickstart e2e', () => {
  let testDir: string;
  let projectDir: string;
  const workspaceName = 'test-project';
  const projectId = 'activities-planner';

  beforeAll(() => {
    console.log('Installing Playwright Chromium browser...');
    execSync('npx playwright install chromium', { stdio: 'inherit' });
  });

  beforeEach(async () => {
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

    console.log('Running CLI with options:');
    console.log(`Working directory: ${testDir}`);
    const result = await runCreateAgentsCLI(
      [
        workspaceName,
        '--openai-key',
        'test-openai-key',
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

    expect(
      result.exitCode,
      `CLI failed with exit code ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    ).toBe(0);
    console.log('CLI completed successfully');

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

    console.log('Verifying .env file...');
    await verifyFile(path.join(projectDir, '.env'), [
      /ENVIRONMENT=development/,
      /OPENAI_API_KEY=test-openai-key/,
      /INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql:\/\/appuser:password@localhost:5432\/inkeep_agents/,
      /INKEEP_AGENTS_RUN_DATABASE_URL=postgresql:\/\/appuser:password@localhost:5433\/inkeep_agents/,
      /INKEEP_AGENTS_API_URL="http:\/\/127\.0\.0\.1:3002"/,
      /INKEEP_AGENTS_JWT_SIGNING_SECRET=\w+/,
    ]);
    console.log('.env file verified');

    console.log('Verifying inkeep.config.ts...');
    await verifyFile(path.join(projectDir, 'src/inkeep.config.ts'));
    console.log('inkeep.config.ts verified');

    console.log('Linking local monorepo packages...');
    await linkLocalPackages(projectDir, monorepoRoot);
    console.log('Local monorepo packages linked and dependencies installed');

    console.log('Setting up project in database');
    await runCommand({
      command: 'pnpm',
      args: ['setup-dev:cloud'],
      cwd: projectDir,
      timeout: 600000,
      env: {
        INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: TEST_BYPASS_SECRET,
        INKEEP_API_KEY: TEST_BYPASS_SECRET,
        INKEEP_CI: 'true',
        SKIP_UPGRADE: 'true',
      },
      stream: true,
    });
    console.log('Project setup in database');

    console.log('Starting dev servers');
    const devProcess = execa('pnpm', ['dev'], {
      cwd: path.join(projectDir, 'apps/agents-api'),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: TEST_BYPASS_SECRET,
      },
      cleanup: true,
      detached: false,
      stderr: 'pipe',
    });

    let serverOutput = '';
    const outputHandler = (data: Buffer) => {
      const text = data.toString();
      serverOutput += text;
      if (process.env.CI) {
        if (text.includes('Error') || text.includes('EADDRINUSE') || text.includes('ready')) {
          console.log('[Server]:', text.trim());
        }
      }
    };

    if (devProcess.stderr) devProcess.stderr.on('data', outputHandler);

    devProcess.catch((error) => {
      console.error('Dev process crashed during startup:', error.message);
      console.error('Server output:', serverOutput);
    });

    let uiChild: ChildProcess | null = null;

    console.log('Waiting for servers to be ready');
    try {
      await waitForServerReady(`${manageApiUrl}/health`, 120000);
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
      const response = await fetch(`${manageApiUrl}/manage/tenants/default/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${TEST_BYPASS_SECRET}`,
        },
      });

      const data = await response.json();
      expect(data.data.tenantId).toBe('default');
      expect(data.data.id).toBe(projectId);

      // --- Browser e2e: manage UI playground ---
      console.log('Starting manage UI standalone server');
      const manageUiServerPath = path.join(
        projectDir,
        'node_modules/@inkeep/agents-manage-ui/.next/standalone/agents-manage-ui/server.js'
      );
      const manageUiCwd = path.dirname(manageUiServerPath);

      uiChild = fork(manageUiServerPath, [], {
        cwd: manageUiCwd,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: '3000',
          HOSTNAME: 'localhost',
          INKEEP_AGENTS_API_URL: manageApiUrl,
          PUBLIC_INKEEP_AGENTS_API_URL: 'http://localhost:3002',
          INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: TEST_BYPASS_SECRET,
        },
        stdio: 'pipe',
      });

      uiChild.on('error', (err) => {
        console.error('Manage UI process error:', err);
      });

      await waitForServerReady('http://localhost:3000', 120000);
      console.log('Manage UI is ready');

      console.log('Launching browser');
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log('Creating dev session');
        const devSessionResp = await page.request.post(
          'http://localhost:3002/api/auth/dev-session'
        );
        expect(devSessionResp.ok()).toBe(true);

        const agentUrl = `http://localhost:3000/default/projects/${projectId}/agents/${projectId}`;
        console.log(`Navigating to ${agentUrl}`);
        await page.goto(agentUrl);
        await page.waitForLoadState('networkidle');

        console.log('Opening playground');
        const tryItButton = page.locator('button:has-text("Try it")');
        await tryItButton.waitFor({ state: 'visible', timeout: 30000 });
        await tryItButton.click();

        const chatInput = page.locator('textarea, input[placeholder]').first();
        await chatInput.waitFor({ state: 'visible', timeout: 30000 });
        const tagName = await chatInput.evaluate((el) => el.tagName);
        console.log(`Found chat input: ${tagName}`);

        console.log('Sending message');
        await chatInput.fill('Hello');
        const sendButton = page
          .locator('button[aria-label="Send message"], button[type="submit"]')
          .first();
        await sendButton.click();

        console.log('Waiting for assistant response');
        await page.locator('[data-role="assistant"]').first().waitFor({ timeout: 90000 });

        const textContent = await page.locator('[data-role="assistant"]').first().textContent();
        expect(textContent?.length).toBeGreaterThan(0);
        console.log('Browser test passed - assistant responded');
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error('Test failed with error:', error);
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
      try {
        devProcess.kill('SIGTERM');
      } catch {
        // Might already be dead
      }

      if (uiChild) {
        console.log('Killing manage UI process');
        try {
          uiChild.kill('SIGTERM');
        } catch {
          // Might already be dead
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        devProcess.kill('SIGKILL');
      } catch {
        // Already dead or couldn't kill
      }
      if (uiChild) {
        try {
          uiChild.kill('SIGKILL');
        } catch {
          // Already dead or couldn't kill
        }
      }

      await Promise.race([
        devProcess.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);

      console.log('Dev process cleanup complete');
    }
  }, 900000);
});
