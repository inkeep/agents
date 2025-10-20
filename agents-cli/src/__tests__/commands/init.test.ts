import * as p from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommand } from '../../commands/init';

// Mock @clack/prompts
vi.mock('@clack/prompts');

// Mock fs functions
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

describe('Init Command', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    vi.clearAllMocks();

    // Setup default mocks for @clack/prompts
    vi.mocked(p.text).mockResolvedValue('test-value');
    vi.mocked(p.confirm).mockResolvedValue(false);
    vi.mocked(p.isCancel).mockReturnValue(false);
    vi.mocked(p.cancel).mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('initCommand', () => {
    it('should create a new config file when none exists', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);

      // Mock clack prompts
      vi.mocked(p.text)
        .mockResolvedValueOnce('./inkeep.config.ts') // confirmedPath
        .mockResolvedValueOnce('test-tenant-123') // tenantId
        .mockResolvedValueOnce('http://localhost:3002'); // apiUrl
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand();

      expect(existsSync).toHaveBeenCalledWith(expect.stringContaining('inkeep.config.ts'));

      // Get the actual content that was written
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      // Verify all required parts are present
      expect(writtenContent).toContain("tenantId: 'test-tenant-123'");
      expect(writtenContent).toContain('agentsManageApi:');
      expect(writtenContent).toContain('agentsRunApi:');
      expect(writtenContent).toContain("url: 'http://localhost:3002'");

      // Verify it's using nested format (not flat)
      expect(writtenContent).not.toContain('agentsManageApiUrl:');
      expect(writtenContent).not.toContain('agentsRunApiUrl:');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.any(String), // The checkmark
        expect.stringContaining('Created')
      );
    });

    it('should prompt for overwrite when config file exists', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');

      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);
      vi.mocked(existsSync).mockImplementation((path) => {
        return path.toString().includes('inkeep.config.ts');
      });

      // Mock clack prompts
      vi.mocked(p.text)
        .mockResolvedValueOnce('./inkeep.config.ts') // confirmedPath
        .mockResolvedValueOnce('new-tenant-456') // tenantId
        .mockResolvedValueOnce('https://api.example.com'); // apiUrl
      vi.mocked(p.confirm).mockResolvedValueOnce(true); // overwrite
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand();

      expect(p.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('already exists'),
        })
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('inkeep.config.ts'),
        expect.stringContaining("tenantId: 'new-tenant-456'")
      );
    });

    it('should cancel when user chooses not to overwrite', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');

      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);
      vi.mocked(existsSync).mockImplementation((path) => {
        return path.toString().includes('inkeep.config.ts');
      });

      // Mock clack prompts
      vi.mocked(p.text).mockResolvedValueOnce('./inkeep.config.ts'); // confirmedPath
      vi.mocked(p.confirm).mockResolvedValueOnce(false); // overwrite
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand();

      expect(writeFileSync).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Init cancelled'));
    });

    it('should validate tenant ID is not empty', async () => {
      const { existsSync, readdirSync } = await import('node:fs');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);

      // Mock clack prompts with validation
      let validateFn: any;
      vi.mocked(p.text).mockImplementation(async (options: any) => {
        if (options.message.includes('tenant')) {
          validateFn = options.validate;
          return 'valid-tenant';
        }
        return './inkeep.config.ts';
      });
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand();

      // Test validation function
      if (validateFn) {
        expect(validateFn('')).toBe('Tenant ID is required');
        expect(validateFn('   ')).toBe('Tenant ID is required');
        expect(validateFn('valid-tenant')).toBe(undefined);
      }
    });

    it('should validate API URL format', async () => {
      const { existsSync, readdirSync } = await import('node:fs');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);

      // Mock clack prompts with validation
      let validateFn: any;
      vi.mocked(p.text).mockImplementation(async (options: any) => {
        if (options.message.includes('API URL')) {
          validateFn = options.validate;
          return 'http://localhost:3002';
        } else if (options.message.includes('tenant')) {
          return 'test-tenant';
        }
        return './inkeep.config.ts';
      });
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand();

      // Test validation function
      if (validateFn) {
        expect(validateFn('not-a-url')).toBe('Please enter a valid URL');
        expect(validateFn('http://localhost:3002')).toBe(undefined);
        expect(validateFn('https://api.example.com')).toBe(undefined);
      }
    });

    it('should accept a path parameter', async () => {
      const { existsSync, writeFileSync } = await import('node:fs');

      vi.mocked(existsSync).mockReturnValue(false);

      // Mock clack prompts
      vi.mocked(p.text)
        .mockResolvedValueOnce('test-tenant') // tenantId
        .mockResolvedValueOnce('http://localhost:3002'); // apiUrl
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand({ path: './custom/path' });

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('custom/path/inkeep.config.ts'),
        expect.any(String)
      );
    });

    it('should handle write errors gracefully', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);

      // Mock clack prompts
      vi.mocked(p.text)
        .mockResolvedValueOnce('./inkeep.config.ts') // confirmedPath
        .mockResolvedValueOnce('test-tenant') // tenantId
        .mockResolvedValueOnce('http://localhost:3002'); // apiUrl
      vi.mocked(p.isCancel).mockReturnValue(false);

      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(initCommand()).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create config file'),
        expect.any(Error)
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
