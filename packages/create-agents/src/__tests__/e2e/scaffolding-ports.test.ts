import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupDir, createTempDir, runCreateAgentsCLI } from './utils';

describe('create-agents scaffolding port verification', () => {
  let testDir: string;
  let projectDir: string;
  const workspaceName = 'test-port-project';

  const monorepoRoot = path.join(__dirname, '../../../../../');
  const createAgentsPrefix = path.join(monorepoRoot, 'create-agents-template');
  const projectTemplatesPrefix = path.join(monorepoRoot, 'agents-cookbook/template-projects');

  beforeEach(async () => {
    testDir = await createTempDir();
    projectDir = path.join(testDir, workspaceName);
  });

  afterEach(async () => {
    await cleanupDir(testDir);
  });

  async function scaffold() {
    const result = await runCreateAgentsCLI(
      [
        workspaceName,
        '--openai-key',
        'test-key',
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
    return result;
  }

  describe('.env port values', () => {
    it('should contain correct INKEEP_AGENTS_API_URL with port 3002', async () => {
      await scaffold();

      const envContent = await fs.readFile(path.join(projectDir, '.env'), 'utf-8');

      expect(envContent).toContain('INKEEP_AGENTS_API_URL="http://127.0.0.1:3002"');
      expect(envContent).toContain('PUBLIC_INKEEP_AGENTS_API_URL="http://127.0.0.1:3002"');

      const urlMatch = envContent.match(/INKEEP_AGENTS_API_URL="([^"]+)"/);
      expect(urlMatch, 'INKEEP_AGENTS_API_URL not found in .env').toBeTruthy();
      const port = new URL(urlMatch![1]).port;
      expect(port).toBe('3002');
    }, 120000);
  });

  describe('inkeep.config.ts port values', () => {
    it('should contain correct agentsApi URL with port 3002', async () => {
      await scaffold();

      const configContent = await fs.readFile(
        path.join(projectDir, 'src/inkeep.config.ts'),
        'utf-8'
      );

      expect(configContent).toContain('http://127.0.0.1:3002');

      const urlMatch = configContent.match(/url:\s*['"]([^'"]+)['"]/);
      expect(urlMatch, 'agentsApi url not found in inkeep.config.ts').toBeTruthy();
      const port = new URL(urlMatch![1]).port;
      expect(port).toBe('3002');
    }, 120000);
  });

  describe('cross-file port consistency', () => {
    it('should have matching ports between .env and inkeep.config.ts', async () => {
      await scaffold();

      const envContent = await fs.readFile(path.join(projectDir, '.env'), 'utf-8');
      const configContent = await fs.readFile(
        path.join(projectDir, 'src/inkeep.config.ts'),
        'utf-8'
      );

      // Extract port from .env
      const envUrlMatch = envContent.match(/INKEEP_AGENTS_API_URL="([^"]+)"/);
      expect(envUrlMatch, 'INKEEP_AGENTS_API_URL not found in .env').toBeTruthy();
      const envUrl = new URL(envUrlMatch![1]);

      // Extract port from inkeep.config.ts
      const configUrlMatch = configContent.match(/url:\s*['"]([^'"]+)['"]/);
      expect(configUrlMatch, 'agentsApi url not found in inkeep.config.ts').toBeTruthy();
      const configUrl = new URL(configUrlMatch![1]);

      // Ports must match
      expect(envUrl.port).toBe(configUrl.port);

      // Both must use 127.0.0.1
      expect(envUrl.hostname).toBe('127.0.0.1');
      expect(configUrl.hostname).toBe('127.0.0.1');
    }, 120000);
  });

  describe('database port values', () => {
    it('should have correct database ports in .env', async () => {
      await scaffold();

      const envContent = await fs.readFile(path.join(projectDir, '.env'), 'utf-8');

      // Extract manage DB port
      const manageDbMatch = envContent.match(
        /INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql:\/\/[^@]+@localhost:(\d+)/
      );
      expect(manageDbMatch, 'INKEEP_AGENTS_MANAGE_DATABASE_URL not found in .env').toBeTruthy();
      const managePort = manageDbMatch![1];
      expect(managePort).toBe('5432');

      // Extract run DB port
      const runDbMatch = envContent.match(
        /INKEEP_AGENTS_RUN_DATABASE_URL=postgresql:\/\/[^@]+@localhost:(\d+)/
      );
      expect(runDbMatch, 'INKEEP_AGENTS_RUN_DATABASE_URL not found in .env').toBeTruthy();
      const runPort = runDbMatch![1];
      expect(runPort).toBe('5433');

      // Ports must differ (catch copy-paste errors)
      expect(managePort).not.toBe(runPort);
    }, 120000);
  });
});
