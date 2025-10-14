import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the compiled CLI
const cliPath = join(__dirname, '..', '..', 'dist', 'index.js');

// Helper function to execute CLI commands
function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  // Check if CLI binary exists before attempting to run
  if (!existsSync(cliPath)) {
    return {
      stdout: '',
      stderr: `CLI binary not found at ${cliPath}`,
      exitCode: 1,
    };
  }

  try {
    const stdout = execSync(`node ${cliPath} ${args.join(' ')}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000, // Increased to 15 second timeout for CI
      killSignal: 'SIGTERM', // Use SIGTERM first for cleaner shutdown
      windowsHide: true, // Hide windows on Windows
      env: {
        ...process.env,
        // Test environment
        CI: 'true', // Signal to CLI that it's running in CI
        NODE_OPTIONS: '--max-old-space-size=256', // Limit memory usage
      },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    // Handle timeout specifically
    if (error.code === 'TIMEOUT') {
      return {
        stdout: error.stdout || '',
        stderr: 'Command timed out',
        exitCode: 124, // Standard timeout exit code
      };
    }

    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || 'Unknown error',
      exitCode: error.status || 1,
    };
  }
}

describe('Inkeep CLI', () => {
  beforeEach(() => {
    // Mock console methods to capture output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Small delay to allow processes to fully terminate
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Force garbage collection to clean up any hanging references
    if (global.gc) {
      global.gc();
    }
  });

  describe('--version command', () => {
    it('should display the version number', () => {
      const result = runCli(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should match the version in package.json', () => {
      const packageJsonPath = join(__dirname, '..', '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const expectedVersion = packageJson.version;

      const result = runCli(['--version']);

      expect(result.stdout.trim()).toBe(expectedVersion);
    });
  });

  describe('push command', () => {
    it('should work without required arguments', () => {
      const result = runCli(['push']);

      // The push command now tries to detect project automatically
      expect(result.exitCode).toBe(1);
      // It should fail because configuration or project is missing in test environment
      expect(result.stderr.toLowerCase()).toMatch(/tenant id|index\.ts|config/);
    });

    it('should accept --agents-manage-api-url option', () => {
      const result = runCli([
        'push',
        '--project',
        'non-existent',
        '--agents-manage-api-url',
        'http://example.com',
      ]);

      // Will fail because project doesn't exist, but should accept the option
      expect(result.exitCode).toBe(1);
      // Should fail for project not found, not for invalid option
      expect(result.stderr).not.toContain('unknown option');
    });
  });

  describe('chat command', () => {
    it('should accept optional agent-id argument', () => {
      const result = runCli(['chat', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[agent-id]');
      expect(result.stdout).toContain('Start an interactive chat session');
    });
  });

  describe('list-agent command', () => {
    it('should require --project option and accept --url option', () => {
      const result = runCli(['list-agent', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('List all available agents for a specific project');
      expect(result.stdout).toContain('--project <project-id>');
      expect(result.stdout).toContain('--agents-manage-api-url');
    });
  });

  describe('--help command', () => {
    it('should display help information', () => {
      const result = runCli(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CLI tool for Inkeep Agent Framework');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('push');
      expect(result.stdout).toContain('chat');
      expect(result.stdout).toContain('config');
      expect(result.stdout).toContain('list-agent');
    });

    it('should display help for push command', () => {
      const result = runCli(['push', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Push a project configuration');
      expect(result.stdout).toContain('--agents-manage-api-url');
    });

    it('should display help for chat command', () => {
      const result = runCli(['chat', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Start an interactive chat session');
      expect(result.stdout).toContain('[agent-id]');
    });
  });

  describe('invalid commands', () => {
    it('should show error for unknown command', () => {
      const result = runCli(['unknown-command']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('error: unknown command');
    });
  });

  describe('CLI structure', () => {
    it('should have correct CLI name', () => {
      const result = runCli(['--help']);

      expect(result.stdout).toContain('inkeep');
    });

    it('should be executable', () => {
      // This test ensures the CLI can be executed without throwing
      const result = runCli(['--version']);

      expect(result.exitCode).toBe(0);
    });
  });
});
