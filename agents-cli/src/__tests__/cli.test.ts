import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

vi.mock('../commands/push', () => ({ pushCommand: vi.fn() }));
vi.mock('../commands/add', () => ({ addCommand: vi.fn() }));
vi.mock('../commands/config', () => ({
  configGetCommand: vi.fn(),
  configSetCommand: vi.fn(),
  configListCommand: vi.fn(),
}));
vi.mock('../commands/dev', () => ({ devCommand: vi.fn() }));
vi.mock('../commands/init', () => ({ initCommand: vi.fn() }));
vi.mock('../commands/list-agents', () => ({ listAgentsCommand: vi.fn() }));
vi.mock('../commands/login', () => ({ loginCommand: vi.fn() }));
vi.mock('../commands/logout', () => ({ logoutCommand: vi.fn() }));
vi.mock('../commands/profile', () => ({
  profileAddCommand: vi.fn(),
  profileCurrentCommand: vi.fn(),
  profileListCommand: vi.fn(),
  profileRemoveCommand: vi.fn(),
  profileUseCommand: vi.fn(),
}));
vi.mock('../commands/pull-v4/introspect', () => ({ pullV4Command: vi.fn() }));
vi.mock('../commands/status', () => ({ statusCommand: vi.fn() }));
vi.mock('../commands/update', () => ({ updateCommand: vi.fn() }));
vi.mock('../commands/whoami', () => ({ whoamiCommand: vi.fn() }));

function parseArgs(program: Command, args: string[]): { stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';

  program.exitOverride();
  program.configureOutput({
    writeOut: (str) => {
      stdout += str;
    },
    writeErr: (str) => {
      stderr += str;
    },
  });

  try {
    program.parse(['node', 'inkeep', ...args]);
  } catch {
    // Commander throws on --version, --help, and errors when exitOverride is set
  }

  return { stdout, stderr };
}

describe('Inkeep CLI', () => {
  let createProgram: () => Command;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ({ createProgram } = await import('../program'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--version command', () => {
    it('should display the version number', () => {
      const { stdout } = parseArgs(createProgram(), ['--version']);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should match the version in package.json', () => {
      const packageJsonPath = join(__dirname, '..', '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      const { stdout } = parseArgs(createProgram(), ['--version']);
      expect(stdout.trim()).toBe(packageJson.version);
    });
  });

  describe('--help command', () => {
    it('should display help information', () => {
      const { stdout } = parseArgs(createProgram(), ['--help']);

      expect(stdout).toContain('CLI tool for Inkeep Agent Framework');
      expect(stdout).toContain('Commands:');
      expect(stdout).toContain('push');
      expect(stdout).toContain('config');
      expect(stdout).toContain('list-agent');
    });

    it('should have push command with correct description', () => {
      const program = createProgram();
      const pushCmd = program.commands.find((c) => c.name() === 'push');

      expect(pushCmd).toBeDefined();
      expect(pushCmd!.description()).toContain('Push a project configuration');
    });
  });

  describe('push command', () => {
    it('should accept --agents-api-url option', () => {
      const program = createProgram();
      const pushCmd = program.commands.find((c) => c.name() === 'push');

      expect(pushCmd).toBeDefined();
      const optionNames = pushCmd!.options.map((o) => o.long);
      expect(optionNames).toContain('--agents-api-url');
      expect(optionNames).toContain('--project');
      expect(optionNames).toContain('--config');
      expect(optionNames).toContain('--force');
    });
  });

  describe('list-agent command', () => {
    it('should have expected description and options', () => {
      const program = createProgram();
      const listAgentCmd = program.commands.find((c) => c.name() === 'list-agent');

      expect(listAgentCmd).toBeDefined();
      expect(listAgentCmd!.description()).toBe('List all available agents for a specific project');
      const optionNames = listAgentCmd!.options.map((o) => o.long);
      expect(optionNames).toContain('--project');
      expect(optionNames).toContain('--agents-api-url');
    });
  });

  describe('invalid commands', () => {
    it('should show error for unknown command', () => {
      const { stderr } = parseArgs(createProgram(), ['unknown-command']);
      expect(stderr).toContain('unknown command');
    });
  });

  describe('CLI structure', () => {
    it('should have correct CLI name', () => {
      const { stdout } = parseArgs(createProgram(), ['--help']);
      expect(stdout).toContain('inkeep');
    });

    it('should register all expected commands', () => {
      const program = createProgram();
      const commandNames = program.commands.map((c) => c.name());

      expect(commandNames).toContain('push');
      expect(commandNames).toContain('pull');
      expect(commandNames).toContain('list-agent');
      expect(commandNames).toContain('config');
      expect(commandNames).toContain('dev');
      expect(commandNames).toContain('login');
      expect(commandNames).toContain('logout');
      expect(commandNames).toContain('status');
      expect(commandNames).toContain('profile');
      expect(commandNames).toContain('add');
      expect(commandNames).toContain('init');
      expect(commandNames).toContain('update');
      expect(commandNames).toContain('whoami');
    });
  });
});
