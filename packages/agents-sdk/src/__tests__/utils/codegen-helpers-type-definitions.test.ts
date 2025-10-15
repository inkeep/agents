import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
  };
});

vi.mock('node:path', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    default: {
      ...actual.default,
      resolve: vi.fn((...args: string[]) => args.join('/')),
      join: vi.fn((...args: string[]) => args.join('/')),
    },
    join: vi.fn((...args: string[]) => args.join('/')),
    resolve: vi.fn((...args: string[]) => args.join('/')),
  };
});

vi.mock('node:module', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createRequire: vi.fn(() => ({
      resolve: vi.fn((moduleName: string) => {
        if (moduleName === '@inkeep/agents-sdk/package.json') {
          return '/mock/path/to/package.json';
        }
        return moduleName;
      }),
    })),
  };
});

const mockReadFileSync = vi.mocked(readFileSync);
const mockJoin = vi.mocked(join);

describe('getTypeDefinitions', () => {
  let getTypeDefinitions: () => string;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockJoin.mockImplementation((...args: string[]) => args.join('/'));

    const module = await import('../../utils/codegen-helpers');
    getTypeDefinitions = module.getTypeDefinitions;
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('successful type definition loading', () => {
    it('should read and format type definitions from SDK package', () => {
      const mockDtsContent = `export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
}

export interface ModelSettings {
  model?: string;
  providerOptions?: Record<string, any>;
}

export declare function project(config: ProjectConfig): Project;
export declare function agent(config: AgentConfig): Agent;`;

      mockReadFileSync.mockReturnValue(mockDtsContent);

      const result = getTypeDefinitions();

      expect(result).toContain('TYPESCRIPT TYPE DEFINITIONS (from @inkeep/agents-sdk):');
      expect(result).toContain('---START OF TYPE DEFINITIONS---');
      expect(result).toContain('---END OF TYPE DEFINITIONS---');
      expect(result).toContain(mockDtsContent);
      expect(result).toContain('export interface AgentConfig');
      expect(result).toContain('export interface ModelSettings');

      expect(mockReadFileSync).toHaveBeenCalled();
    });

    it('should include proper formatting with start and end markers', () => {
      const mockDtsContent = 'export type Test = string;';

      mockReadFileSync.mockReturnValue(mockDtsContent);

      const result = getTypeDefinitions();

      expect(result).toContain('TYPESCRIPT TYPE DEFINITIONS (from @inkeep/agents-sdk):');
      expect(result).toContain('The following is the complete type definition file');
      expect(result).toContain('---START OF TYPE DEFINITIONS---');
      expect(result).toContain('---END OF TYPE DEFINITIONS---');
      expect(result).toContain(mockDtsContent);

      const startIndex = result.indexOf('---START OF TYPE DEFINITIONS---');
      const endIndex = result.indexOf('---END OF TYPE DEFINITIONS---');
      const contentIndex = result.indexOf(mockDtsContent);

      expect(startIndex).toBeLessThan(contentIndex);
      expect(contentIndex).toBeLessThan(endIndex);
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = getTypeDefinitions();

      expect(result).toContain('Type definitions from @inkeep/agents-sdk could not be loaded');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Could not read type definitions:',
        expect.any(Error)
      );
    });

    it('should log warning details when errors occur', () => {
      const testError = new Error('ENOENT: no such file or directory');
      mockReadFileSync.mockImplementation(() => {
        throw testError;
      });

      getTypeDefinitions();

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Could not read type definitions:', testError);
    });
  });

  describe('path resolution', () => {
    it('should construct correct path to dist/index.d.ts', () => {
      mockReadFileSync.mockReturnValue('export type Test = string;');

      getTypeDefinitions();

      expect(mockJoin).toHaveBeenCalledTimes(2);
      expect(mockJoin).toHaveBeenNthCalledWith(1, expect.any(String), '..');
      expect(mockJoin).toHaveBeenNthCalledWith(2, expect.any(String), 'dist/index.d.ts');
    });
  });

  describe('content validation', () => {
    it('should preserve exact DTS content without modification', () => {
      const exactDtsContent = `// Copyright notice
export interface AgentConfig {
  id: string;
  name: string;
}

export type ModelSettings = {
  model?: string;
  providerOptions?: Record<string, any>;
};

declare const project: (config: ProjectConfig) => Project;
export { project };
`;

      mockReadFileSync.mockReturnValue(exactDtsContent);

      const result = getTypeDefinitions();

      expect(result).toContain(exactDtsContent);
      expect(result).toContain('// Copyright notice');
      expect(result).toContain('export interface AgentConfig');
      expect(result).toContain('export type ModelSettings');
      expect(result).toContain('declare const project');
    });

    it('should handle empty DTS file', () => {
      const emptyContent = '';

      mockReadFileSync.mockReturnValue(emptyContent);

      const result = getTypeDefinitions();

      expect(result).toContain('TYPESCRIPT TYPE DEFINITIONS');
      expect(result).toContain('---START OF TYPE DEFINITIONS---');
      expect(result).toContain('---END OF TYPE DEFINITIONS---');
    });

    it('should handle large DTS files', () => {
      const largeDtsContent = Array(1000)
        .fill(null)
        .map((_, i) => `export interface Type${i} { prop: string; }`)
        .join('\n');

      mockReadFileSync.mockReturnValue(largeDtsContent);

      const result = getTypeDefinitions();

      expect(result.length).toBeGreaterThan(10000);
      expect(result).toContain('export interface Type0');
      expect(result).toContain('export interface Type999');
      expect(result).toContain('---START OF TYPE DEFINITIONS---');
      expect(result).toContain('---END OF TYPE DEFINITIONS---');
    });
  });
});
