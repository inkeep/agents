import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommand } from '../../commands/init';

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

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
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('initCommand', () => {
    it('should create a new config file when none exists', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');
      const inquirer = await import('inquirer');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);
      const promptMock = vi.mocked(inquirer.default.prompt);
      promptMock
        .mockResolvedValueOnce({
          confirmedPath: './inkeep.config.ts',
        })
        .mockResolvedValueOnce({
          tenantId: 'test-tenant-123',
          projectId: 'default',
          apiUrl: 'http://localhost:3002',
        })
        .mockResolvedValueOnce({
          providers: ['anthropic'],
        })
        .mockResolvedValueOnce({
          baseModel: 'anthropic/claude-sonnet-4-20250514',
          configureOptionalModels: false,
        });

      await initCommand();

      expect(existsSync).toHaveBeenCalledWith(expect.stringContaining('inkeep.config.ts'));
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('inkeep.config.ts'),
        expect.stringContaining("tenantId: 'test-tenant-123'")
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('inkeep.config.ts'),
        expect.stringContaining("agentsManageApiUrl: 'http://localhost:3002'")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.any(String), // The checkmark
        expect.stringContaining('Created')
      );
    });

    it('should prompt for overwrite when config file exists', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');
      const inquirer = await import('inquirer');

      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);
      vi.mocked(existsSync).mockImplementation((path) => {
        return path.toString().includes('inkeep.config.ts');
      });
      const promptMock = vi.mocked(inquirer.default.prompt);
      promptMock
        .mockResolvedValueOnce({ confirmedPath: './inkeep.config.ts' })
        .mockResolvedValueOnce({ overwrite: true })
        .mockResolvedValueOnce({
          tenantId: 'new-tenant-456',
          projectId: 'default',
          apiUrl: 'https://api.example.com',
        })
        .mockResolvedValueOnce({
          providers: ['openai'],
        })
        .mockResolvedValueOnce({
          baseModel: 'openai/gpt-4.1-2025-04-14',
          configureOptionalModels: false,
        });

      await initCommand();

      expect(inquirer.default.prompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'confirm',
            name: 'overwrite',
            message: expect.stringContaining('already exists'),
          }),
        ])
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('inkeep.config.ts'),
        expect.stringContaining("tenantId: 'new-tenant-456'")
      );
    });

    it('should cancel when user chooses not to overwrite', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');
      const inquirer = await import('inquirer');

      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);
      vi.mocked(existsSync).mockImplementation((path) => {
        return path.toString().includes('inkeep.config.ts');
      });
      const promptMock = vi.mocked(inquirer.default.prompt);
      promptMock
        .mockResolvedValueOnce({ confirmedPath: './inkeep.config.ts' })
        .mockResolvedValueOnce({ overwrite: false });

      await initCommand();

      expect(writeFileSync).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Init cancelled'));
    });

    it('should validate tenant ID is not empty', async () => {
      const { existsSync, readdirSync } = await import('node:fs');
      const inquirer = await import('inquirer');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);

      let callCount = 0;
      const promptMock = vi.mocked(inquirer.default.prompt);
      promptMock.mockImplementation(async (questions: any) => {
        callCount++;
        if (callCount === 1) {
          // First call is for path confirmation
          return { confirmedPath: './inkeep.config.ts' };
        } else if (callCount === 2) {
          // Second call is for tenant ID, project ID, and API URL
          const tenantIdQuestion = questions.find((q: any) => q.name === 'tenantId');
          expect(tenantIdQuestion.validate('')).toBe('Tenant ID is required');
          expect(tenantIdQuestion.validate('   ')).toBe('Tenant ID is required');
          expect(tenantIdQuestion.validate('valid-tenant')).toBe(true);

          return {
            tenantId: 'valid-tenant',
            projectId: 'default',
            apiUrl: 'http://localhost:3002',
          };
        } else if (callCount === 3) {
          // Third call is for provider selection
          return { providers: ['anthropic'] };
        } else {
          // Fourth call is for model selection
          return {
            baseModel: 'anthropic/claude-sonnet-4-20250514',
            configureOptionalModels: false,
          };
        }
      });

      await initCommand();
    });

    it('should validate API URL format', async () => {
      const { existsSync, readdirSync } = await import('node:fs');
      const inquirer = await import('inquirer');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);

      let callCount = 0;
      const promptMock = vi.mocked(inquirer.default.prompt);
      promptMock.mockImplementation(async (questions: any) => {
        callCount++;
        if (callCount === 1) {
          // First call is for path confirmation
          return { confirmedPath: './inkeep.config.ts' };
        } else if (callCount === 2) {
          // Second call is for tenant ID, project ID, and API URL
          const apiUrlQuestion = questions.find((q: any) => q.name === 'apiUrl');
          expect(apiUrlQuestion.validate('not-a-url')).toBe('Please enter a valid URL');
          expect(apiUrlQuestion.validate('http://localhost:3002')).toBe(true);
          expect(apiUrlQuestion.validate('https://api.example.com')).toBe(true);

          return {
            tenantId: 'test-tenant',
            projectId: 'default',
            apiUrl: 'http://localhost:3002',
          };
        } else if (callCount === 3) {
          // Third call is for provider selection
          return { providers: ['anthropic'] };
        } else {
          // Fourth call is for model selection
          return {
            baseModel: 'anthropic/claude-sonnet-4-20250514',
            configureOptionalModels: false,
          };
        }
      });

      await initCommand();
    });

    it('should accept a path parameter', async () => {
      const { existsSync, writeFileSync } = await import('node:fs');
      const inquirer = await import('inquirer');

      vi.mocked(existsSync).mockReturnValue(false);
      const promptMock = vi.mocked(inquirer.default.prompt);
      promptMock
        .mockResolvedValueOnce({
          tenantId: 'test-tenant',
          projectId: 'default',
          apiUrl: 'http://localhost:3002',
        })
        .mockResolvedValueOnce({
          providers: ['anthropic'],
        })
        .mockResolvedValueOnce({
          baseModel: 'anthropic/claude-sonnet-4-20250514',
          configureOptionalModels: false,
        });

      await initCommand({ path: './custom/path' });

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('custom/path/inkeep.config.ts'),
        expect.any(String)
      );
    });

    it('should handle write errors gracefully', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');
      const inquirer = await import('inquirer');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);
      const promptMock = vi.mocked(inquirer.default.prompt);
      promptMock
        .mockResolvedValueOnce({
          confirmedPath: './inkeep.config.ts',
        })
        .mockResolvedValueOnce({
          tenantId: 'test-tenant',
          projectId: 'default',
          apiUrl: 'http://localhost:3002',
        })
        .mockResolvedValueOnce({
          providers: ['anthropic'],
        })
        .mockResolvedValueOnce({
          baseModel: 'anthropic/claude-sonnet-4-20250514',
          configureOptionalModels: false,
        });
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
