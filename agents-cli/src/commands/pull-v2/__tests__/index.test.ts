import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pullV2Command } from '../index';

// Mock dependencies
vi.mock('node:fs');
vi.mock('../../api');
vi.mock('../../utils/config');
vi.mock('../../utils/background-version-check');
vi.mock('@clack/prompts');
vi.mock('find-up');

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe('pull-v2 index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console methods to suppress output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit called');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('pullV2Command', () => {
    it('should fail when no configuration is found', async () => {
      mockExistsSync.mockReturnValue(false);

      await expect(pullV2Command({ project: 'test-project' })).rejects.toThrow('Process exit called');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should fail when no project ID is provided', async () => {
      // Mock config file exists
      mockExistsSync.mockImplementation((path) => {
        return typeof path === 'string' && path.includes('inkeep.config.ts');
      });

      // Mock loadConfig
      const { loadConfig } = await import('../../utils/config');
      vi.mocked(loadConfig).mockResolvedValue({
        tenantId: 'test-tenant',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsManageApiKey: 'test-key',
      } as any);

      await expect(pullV2Command({})).rejects.toThrow('Process exit called');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should output JSON when json option is true', async () => {
      // Mock config file exists
      mockExistsSync.mockImplementation((path) => {
        return typeof path === 'string' && path.includes('inkeep.config.ts');
      });

      // Mock loadConfig
      const { loadConfig } = await import('../../utils/config');
      vi.mocked(loadConfig).mockResolvedValue({
        tenantId: 'test-tenant',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsManageApiKey: 'test-key',
      } as any);

      // Mock API client
      const { ManagementApiClient } = await import('../../api');
      const mockApiClient = {
        getFullProjectDefinition: vi.fn().mockResolvedValue({
          id: 'test-project',
          name: 'Test Project',
          models: { base: { model: 'claude-sonnet-4' } },
          agents: {},
          tools: {}
        })
      };
      vi.mocked(ManagementApiClient).mockImplementation(() => mockApiClient as any);

      // Mock spinner
      const mockSpinner = {
        start: vi.fn(),
        stop: vi.fn(),
        message: vi.fn()
      };
      const { default: prompts } = await import('@clack/prompts');
      vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as any);

      // Capture console.log output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await pullV2Command({ 
        project: 'test-project', 
        json: true 
      });

      // Should output JSON to console
      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({
          id: 'test-project',
          name: 'Test Project',
          models: { base: { model: 'claude-sonnet-4' } },
          agents: {},
          tools: {}
        }, null, 2)
      );
    });

    it('should create project structure and generate files', async () => {
      // Mock config file exists
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string') {
          if (path.includes('inkeep.config.ts')) return true;
          if (path.includes('index.ts')) return false; // No existing project
        }
        return false;
      });

      // Mock loadConfig
      const { loadConfig } = await import('../../utils/config');
      vi.mocked(loadConfig).mockResolvedValue({
        tenantId: 'test-tenant',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsManageApiKey: 'test-key',
        outputDirectory: '/test/output'
      } as any);

      // Mock API client with sample project
      const mockProject = {
        id: 'test-project',
        name: 'Test Project',
        models: { base: { model: 'claude-sonnet-4' } },
        agents: {
          'test-agent': {
            id: 'test-agent',
            name: 'Test Agent',
            defaultSubAgentId: 'assistant',
            subAgents: {
              'assistant': {
                id: 'assistant',
                name: 'Assistant',
                canUse: ['test-tool']
              }
            }
          }
        },
        tools: {
          'test-tool': {
            id: 'test-tool',
            name: 'Test Tool',
            type: 'function'
          }
        },
        dataComponents: {
          'test-data': {
            id: 'test-data',
            name: 'Test Data',
            schema: { type: 'object' }
          }
        }
      };

      const { ManagementApiClient } = await import('../../api');
      const mockApiClient = {
        getFullProjectDefinition: vi.fn().mockResolvedValue(mockProject)
      };
      vi.mocked(ManagementApiClient).mockImplementation(() => mockApiClient as any);

      // Mock spinner
      const mockSpinner = {
        start: vi.fn(),
        stop: vi.fn(),
        message: vi.fn()
      };
      const { default: prompts } = await import('@clack/prompts');
      vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as any);

      await pullV2Command({ 
        project: 'test-project',
        force: true // Force generation even if no diff
      });

      // Should create directories
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('/test/output'),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('agents'),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('tools'),
        { recursive: true }
      );

      // Should write files
      expect(mockWriteFileSync).toHaveBeenCalled();
      
      // Should write index.ts
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('index.ts'),
        expect.stringContaining("export const testProject = project({")
      );
    });

    it('should handle debug mode', async () => {
      // Mock config file exists
      mockExistsSync.mockImplementation((path) => {
        return typeof path === 'string' && path.includes('inkeep.config.ts');
      });

      // Mock loadConfig
      const { loadConfig } = await import('../../utils/config');
      vi.mocked(loadConfig).mockResolvedValue({
        tenantId: 'test-tenant',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsManageApiKey: 'test-key',
      } as any);

      // Mock API client
      const { ManagementApiClient } = await import('../../api');
      const mockApiClient = {
        getFullProjectDefinition: vi.fn().mockResolvedValue({
          id: 'test-project',
          name: 'Test Project',
          models: { base: { model: 'claude-sonnet-4' } },
          agents: {},
          tools: {}
        })
      };
      vi.mocked(ManagementApiClient).mockImplementation(() => mockApiClient as any);

      // Mock spinner
      const mockSpinner = {
        start: vi.fn(),
        stop: vi.fn(),
        message: vi.fn()
      };
      const { default: prompts } = await import('@clack/prompts');
      vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await pullV2Command({ 
        project: 'test-project',
        debug: true,
        json: true
      });

      // Should output debug info
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Config loaded from:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tenant ID: test-tenant')
      );
    });

    it('should handle custom environment', async () => {
      // Mock config and API setup (similar to above)
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string') {
          if (path.includes('inkeep.config.ts')) return true;
          if (path.includes('index.ts')) return false;
        }
        return false;
      });

      const { loadConfig } = await import('../../utils/config');
      vi.mocked(loadConfig).mockResolvedValue({
        tenantId: 'test-tenant',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsManageApiKey: 'test-key',
      } as any);

      const mockProject = {
        id: 'test-project',
        name: 'Test Project',
        models: { base: { model: 'claude-sonnet-4' } },
        agents: {},
        tools: {},
        credentialReferences: {
          'api-key': { id: 'api-key', name: 'API Key' }
        }
      };

      const { ManagementApiClient } = await import('../../api');
      const mockApiClient = {
        getFullProjectDefinition: vi.fn().mockResolvedValue(mockProject)
      };
      vi.mocked(ManagementApiClient).mockImplementation(() => mockApiClient as any);

      const mockSpinner = {
        start: vi.fn(),
        stop: vi.fn(),
        message: vi.fn()
      };
      const { default: prompts } = await import('@clack/prompts');
      vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as any);

      await pullV2Command({ 
        project: 'test-project',
        env: 'production',
        force: true
      });

      // Should generate environment files for production
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('production.env.ts'),
        expect.any(String)
      );
    });
  });
});