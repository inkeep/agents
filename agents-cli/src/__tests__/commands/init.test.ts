import * as p from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommand } from '../../commands/init';
import { LOCAL_REMOTE } from '../../utils/profiles';

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

// Mock ProfileManager
const mockProfileManager = {
  profilesFileExists: vi.fn(),
  loadProfiles: vi.fn(),
  saveProfiles: vi.fn(),
  addProfile: vi.fn(),
  setActiveProfile: vi.fn(),
};

vi.mock('../../utils/profiles', async () => {
  const actual = await vi.importActual('../../utils/profiles');
  return {
    ...actual,
    ProfileManager: vi.fn(() => mockProfileManager),
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
        .mockResolvedValueOnce(LOCAL_REMOTE.api); // apiUrl
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand({ local: true });

      expect(existsSync).toHaveBeenCalledWith(expect.stringContaining('inkeep.config.ts'));

      // Get the actual content that was written
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      // Verify all required parts are present
      expect(writtenContent).toContain("tenantId: 'test-tenant-123'");
      expect(writtenContent).toContain('agentsApi:');
      expect(writtenContent).toContain(`url: '${LOCAL_REMOTE.api}'`);

      // Verify it's using nested format (not flat)
      expect(writtenContent).not.toContain('agentsApiUrl:');

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
        .mockResolvedValueOnce('https://agents-api.example.com'); // apiUrl
      vi.mocked(p.confirm).mockResolvedValueOnce(true); // overwrite
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand({ local: true });

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

      await initCommand({ local: true });

      expect(writeFileSync).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
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
        if (options.message.includes('Agents API')) {
          return LOCAL_REMOTE.api;
        }
        return './inkeep.config.ts';
      });
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand({ local: true });

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
        if (options.message.includes('Agents API URL')) {
          validateFn = options.validate;
          return LOCAL_REMOTE.api;
        }
        if (options.message.includes('tenant')) {
          return 'test-tenant';
        }
        return './inkeep.config.ts';
      });
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand({ local: true });

      // Test validation function
      if (validateFn) {
        expect(validateFn('not-a-url')).toBe('Please enter a valid URL');
        expect(validateFn(LOCAL_REMOTE.api)).toBe(undefined);
        expect(validateFn('https://agents-api.example.com')).toBe(undefined);
      }
    });

    it('should accept a path parameter', async () => {
      const { existsSync, writeFileSync } = await import('node:fs');

      vi.mocked(existsSync).mockReturnValue(false);

      // Mock clack prompts
      vi.mocked(p.text)
        .mockResolvedValueOnce('test-tenant') // tenantId
        .mockResolvedValueOnce(LOCAL_REMOTE.api); // apiUrl
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand({ path: './custom/path', local: true });

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
        .mockResolvedValueOnce(LOCAL_REMOTE.api); // apiUrl
      vi.mocked(p.isCancel).mockReturnValue(false);

      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(initCommand({ local: true })).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create config file'),
        expect.any(Error)
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should create local profile when profiles.yaml does not exist', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);
      vi.mocked(writeFileSync).mockImplementation(() => {});

      // Mock ProfileManager - no profiles file exists
      mockProfileManager.profilesFileExists.mockReturnValue(false);

      // Mock clack prompts
      vi.mocked(p.text)
        .mockResolvedValueOnce('./inkeep.config.ts') // confirmedPath
        .mockResolvedValueOnce('test-tenant-123') // tenantId
        .mockResolvedValueOnce(LOCAL_REMOTE.api); // apiUrl
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand({ local: true });

      expect(mockProfileManager.saveProfiles).toHaveBeenCalledWith({
        activeProfile: 'local',
        profiles: {
          local: {
            remote: {
              api: LOCAL_REMOTE.api,
              manageUi: LOCAL_REMOTE.manageUi,
            },
            credential: 'none',
            environment: 'development',
          },
        },
      });
    });

    it('should add local profile to existing profiles.yaml', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);
      vi.mocked(writeFileSync).mockImplementation(() => {});

      // Mock ProfileManager - profiles file exists with cloud profile
      mockProfileManager.profilesFileExists.mockReturnValue(true);
      mockProfileManager.loadProfiles.mockReturnValue({
        activeProfile: 'cloud',
        profiles: {
          cloud: { remote: 'cloud', credential: 'inkeep-cloud', environment: 'production' },
        },
      });

      // Mock clack prompts
      vi.mocked(p.text)
        .mockResolvedValueOnce('./inkeep.config.ts') // confirmedPath
        .mockResolvedValueOnce('test-tenant') // tenantId
        .mockResolvedValueOnce(LOCAL_REMOTE.api); // apiUrl
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand({ local: true });

      expect(mockProfileManager.addProfile).toHaveBeenCalledWith('local', {
        remote: {
          api: LOCAL_REMOTE.api,
          manageUi: LOCAL_REMOTE.manageUi,
        },
        credential: 'none',
        environment: 'development',
      });
      expect(mockProfileManager.setActiveProfile).toHaveBeenCalledWith('local');
    });

    it('should set existing local profile as active if it already exists', async () => {
      const { existsSync, writeFileSync, readdirSync } = await import('node:fs');

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue(['package.json'] as any);
      vi.mocked(writeFileSync).mockImplementation(() => {});

      // Mock ProfileManager - profiles file exists with local profile already
      mockProfileManager.profilesFileExists.mockReturnValue(true);
      mockProfileManager.loadProfiles.mockReturnValue({
        activeProfile: 'cloud',
        profiles: {
          cloud: { remote: 'cloud', credential: 'inkeep-cloud', environment: 'production' },
          local: {
            remote: {
              api: LOCAL_REMOTE.api,
              manageUi: LOCAL_REMOTE.manageUi,
            },
            credential: 'none',
            environment: 'development',
          },
        },
      });

      // Mock clack prompts
      vi.mocked(p.text)
        .mockResolvedValueOnce('./inkeep.config.ts') // confirmedPath
        .mockResolvedValueOnce('test-tenant') // tenantId
        .mockResolvedValueOnce(LOCAL_REMOTE.api); // apiUrl
      vi.mocked(p.isCancel).mockReturnValue(false);

      await initCommand({ local: true });

      expect(mockProfileManager.addProfile).not.toHaveBeenCalled();
      expect(mockProfileManager.setActiveProfile).toHaveBeenCalledWith('local');
    });
  });
});
