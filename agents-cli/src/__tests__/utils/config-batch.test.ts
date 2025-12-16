import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  findAllConfigFiles,
  findConfigFile,
  getConfigFileNames,
} from '../../utils/config';

// Mock fs module
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  };
});

describe('Tag-based Config', () => {
  describe('getConfigFileNames', () => {
    it('should return default config names when no tag provided', () => {
      const names = getConfigFileNames();
      expect(names).toContain('inkeep.config.ts');
      expect(names).toContain('inkeep.config.js');
      expect(names).toContain('.inkeeprc.ts');
      expect(names).toContain('.inkeeprc.js');
    });

    it('should return tagged config names when tag provided', () => {
      const names = getConfigFileNames('prod');
      expect(names).toContain('prod.__inkeep.config.ts__');
      expect(names).toContain('prod.__inkeep.config.js__');
      expect(names).not.toContain('inkeep.config.ts');
    });

    it('should handle staging tag', () => {
      const names = getConfigFileNames('staging');
      expect(names).toContain('staging.__inkeep.config.ts__');
      expect(names).toContain('staging.__inkeep.config.js__');
    });
  });

  describe('findConfigFile with tag', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should find tagged config file in current directory', () => {
      const cwd = '/test/project';
      
      (existsSync as Mock).mockImplementation((path: string) => {
        return path === join(cwd, 'prod.__inkeep.config.ts__');
      });

      const result = findConfigFile(cwd, 'prod');
      expect(result).toBe(join(cwd, 'prod.__inkeep.config.ts__'));
    });

    it('should find default config file when no tag provided', () => {
      const cwd = '/test/project';
      
      (existsSync as Mock).mockImplementation((path: string) => {
        return path === join(cwd, 'inkeep.config.ts');
      });

      const result = findConfigFile(cwd);
      expect(result).toBe(join(cwd, 'inkeep.config.ts'));
    });

    it('should walk up directories to find tagged config', () => {
      const startDir = '/test/project/nested';
      const parentDir = '/test/project';
      
      (existsSync as Mock).mockImplementation((path: string) => {
        return path === join(parentDir, 'prod.__inkeep.config.ts__');
      });

      const result = findConfigFile(startDir, 'prod');
      expect(result).toBe(join(parentDir, 'prod.__inkeep.config.ts__'));
    });

    it('should return null if no tagged config found', () => {
      (existsSync as Mock).mockReturnValue(false);
      
      const result = findConfigFile('/test/project', 'nonexistent');
      expect(result).toBeNull();
    });
  });
});

describe('findAllConfigFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find all config files recursively', () => {
    const rootDir = '/test/projects';
    
    // Mock directory structure
    const mockFs: Record<string, { isDirectory: boolean; items?: string[] }> = {
      '/test/projects': { isDirectory: true, items: ['project1', 'project2', 'node_modules'] },
      '/test/projects/project1': { isDirectory: true, items: ['inkeep.config.ts', 'index.ts'] },
      '/test/projects/project2': { isDirectory: true, items: ['inkeep.config.ts', 'src'] },
      '/test/projects/project2/src': { isDirectory: true, items: ['agent.ts'] },
      '/test/projects/node_modules': { isDirectory: true, items: ['some-package'] },
    };

    (existsSync as Mock).mockImplementation((path: string) => mockFs[path] !== undefined);
    
    (readdirSync as Mock).mockImplementation((path: string) => {
      const entry = mockFs[path];
      return entry?.items || [];
    });
    
    (statSync as Mock).mockImplementation((path: string) => {
      const entry = mockFs[path];
      if (!entry) {
        // For config files
        return { isDirectory: () => false, isFile: () => true };
      }
      return {
        isDirectory: () => entry.isDirectory,
        isFile: () => !entry.isDirectory,
      };
    });

    const result = findAllConfigFiles(rootDir);
    
    expect(result).toHaveLength(2);
    expect(result).toContain('/test/projects/project1/inkeep.config.ts');
    expect(result).toContain('/test/projects/project2/inkeep.config.ts');
  });

  it('should find tagged config files when tag provided', () => {
    const rootDir = '/test/projects';
    
    const mockFs: Record<string, { isDirectory: boolean; items?: string[] }> = {
      '/test/projects': { isDirectory: true, items: ['project1'] },
      '/test/projects/project1': { isDirectory: true, items: ['prod.__inkeep.config.ts__', 'inkeep.config.ts'] },
    };

    (existsSync as Mock).mockImplementation((path: string) => mockFs[path] !== undefined);
    
    (readdirSync as Mock).mockImplementation((path: string) => {
      const entry = mockFs[path];
      return entry?.items || [];
    });
    
    (statSync as Mock).mockImplementation((path: string) => {
      const entry = mockFs[path];
      if (!entry) {
        return { isDirectory: () => false, isFile: () => true };
      }
      return {
        isDirectory: () => entry.isDirectory,
        isFile: () => !entry.isDirectory,
      };
    });

    const result = findAllConfigFiles(rootDir, 'prod');
    
    expect(result).toHaveLength(1);
    expect(result).toContain('/test/projects/project1/prod.__inkeep.config.ts__');
  });

  it('should exclude node_modules and other default directories', () => {
    const rootDir = '/test/projects';
    
    const mockFs: Record<string, { isDirectory: boolean; items?: string[] }> = {
      '/test/projects': { isDirectory: true, items: ['node_modules', 'dist', '.git', 'project1'] },
      '/test/projects/project1': { isDirectory: true, items: ['inkeep.config.ts'] },
      // These should NOT be scanned:
      '/test/projects/node_modules': { isDirectory: true, items: ['inkeep.config.ts'] },
      '/test/projects/dist': { isDirectory: true, items: ['inkeep.config.ts'] },
      '/test/projects/.git': { isDirectory: true, items: ['inkeep.config.ts'] },
    };

    (existsSync as Mock).mockImplementation((path: string) => mockFs[path] !== undefined);
    
    (readdirSync as Mock).mockImplementation((path: string) => {
      const entry = mockFs[path];
      return entry?.items || [];
    });
    
    (statSync as Mock).mockImplementation((path: string) => {
      const entry = mockFs[path];
      if (!entry) {
        return { isDirectory: () => false, isFile: () => true };
      }
      return {
        isDirectory: () => entry.isDirectory,
        isFile: () => !entry.isDirectory,
      };
    });

    const result = findAllConfigFiles(rootDir);
    
    // Should only find the one in project1, not in excluded directories
    expect(result).toHaveLength(1);
    expect(result).toContain('/test/projects/project1/inkeep.config.ts');
  });

  it('should return empty array when no config files found', () => {
    const rootDir = '/test/empty';
    
    (existsSync as Mock).mockReturnValue(true);
    (readdirSync as Mock).mockReturnValue([]);
    
    const result = findAllConfigFiles(rootDir);
    expect(result).toHaveLength(0);
  });

  it('should return empty array when directory does not exist', () => {
    (existsSync as Mock).mockReturnValue(false);
    
    const result = findAllConfigFiles('/nonexistent');
    expect(result).toHaveLength(0);
  });
});
