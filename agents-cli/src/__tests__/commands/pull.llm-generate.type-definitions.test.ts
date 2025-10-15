import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules before importing
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
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
  const actual = await importOriginal();
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

const mockReadFileSync = vi.mocked(readFileSync);
const mockJoin = vi.mocked(join);

describe('getTypeDefinitions', () => {
  let getTypeDefinitions: () => string;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules(); // Reset modules to ensure fresh import
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Set default mock implementations
    mockJoin.mockImplementation((...args: string[]) => args.join('/'));

    // Dynamically import the function from SDK after mocks are set up
    const module = await import('@inkeep/agents-sdk');
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

      // Mock readFileSync to return the mock DTS content
      mockReadFileSync.mockReturnValue(mockDtsContent);

      // Call the function (it will use the real require.resolve but read our mocked file)
      const result = getTypeDefinitions();

      // Verify the output format
      expect(result).toContain('TYPESCRIPT TYPE DEFINITIONS (from @inkeep/agents-sdk):');
      expect(result).toContain('---START OF TYPE DEFINITIONS---');
      expect(result).toContain('---END OF TYPE DEFINITIONS---');
      expect(result).toContain(mockDtsContent);
      expect(result).toContain('export interface AgentConfig');
      expect(result).toContain('export interface ModelSettings');

      // Verify readFileSync was called
      expect(mockReadFileSync).toHaveBeenCalled();
    });

    it('should include proper formatting with start and end markers', () => {
      const mockDtsContent = 'export type Test = string;';

      mockReadFileSync.mockReturnValue(mockDtsContent);

      const result = getTypeDefinitions();

      // Verify the format includes all required markers
      expect(result).toContain('TYPESCRIPT TYPE DEFINITIONS (from @inkeep/agents-sdk):');
      expect(result).toContain('The following is the complete type definition file');
      expect(result).toContain('---START OF TYPE DEFINITIONS---');
      expect(result).toContain('---END OF TYPE DEFINITIONS---');
      expect(result).toContain(mockDtsContent);

      // Verify the markers are in the correct order
      const startIndex = result.indexOf('---START OF TYPE DEFINITIONS---');
      const endIndex = result.indexOf('---END OF TYPE DEFINITIONS---');
      const contentIndex = result.indexOf(mockDtsContent);

      expect(startIndex).toBeLessThan(contentIndex);
      expect(contentIndex).toBeLessThan(endIndex);
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', () => {
      // Mock readFileSync to throw an error
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = getTypeDefinitions();

      // Should return fallback message
      expect(result).toContain('Type definitions from @inkeep/agents-sdk could not be loaded');

      // Should log warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Could not read type definitions:',
        expect.any(Error)
      );
    });

    it('should log warning details when errors occur', () => {
      // Mock readFileSync to throw a specific error
      const testError = new Error('ENOENT: no such file or directory');
      mockReadFileSync.mockImplementation(() => {
        throw testError;
      });

      getTypeDefinitions();

      // Verify console.warn was called with error details
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Could not read type definitions:', testError);
    });
  });

  describe('path resolution', () => {
    it('should construct correct path to dist/index.d.ts', () => {
      mockReadFileSync.mockReturnValue('export type Test = string;');

      getTypeDefinitions();

      // Verify the path construction happens:
      // 1. First call: join(packageJsonPath, '..') to get package dir
      // 2. Second call: join(packageDir, 'dist/index.d.ts') to get DTS path
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

      // The returned content should include the exact DTS content
      // without any modifications to whitespace or formatting
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

      // Should still have the wrapper even with empty content
      expect(result).toContain('TYPESCRIPT TYPE DEFINITIONS');
      expect(result).toContain('---START OF TYPE DEFINITIONS---');
      expect(result).toContain('---END OF TYPE DEFINITIONS---');
    });

    it('should handle large DTS files', () => {
      // Create a large DTS content (simulating a real SDK file)
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

  describe('integration with prompt generation', () => {
    it('should be included in index file generation prompts', () => {
      // This tests that getTypeDefinitions() is properly integrated
      // into the prompt templates for generateIndexFile
      const promptTemplate = `Generate a TypeScript index.ts file for an Inkeep project with the following data:

PROJECT JSON DATA:
{{DATA}}


\${getTypeDefinitions()}

\${NAMING_CONVENTION_RULES}`;

      expect(promptTemplate).toContain('getTypeDefinitions()');
    });

    it('should be included in agent generation prompts', () => {
      const promptTemplate = `AGENT DATA:
{{DATA}}

AGENT ID: {{AGENT_ID}}

\${getTypeDefinitions()}

IMPORTANT CONTEXT:`;

      expect(promptTemplate).toContain('getTypeDefinitions()');
    });

    it('should be included in tool generation prompts', () => {
      const promptTemplate = `TOOL DATA:
{{DATA}}

TOOL ID: {{TOOL_ID}}

\${getTypeDefinitions()}

\${NAMING_CONVENTION_RULES}`;

      expect(promptTemplate).toContain('getTypeDefinitions()');
    });

    it('should be included in data component generation prompts', () => {
      const promptTemplate = `DATA COMPONENT DATA:
{{DATA}}

COMPONENT ID: {{COMPONENT_ID}}

\${getTypeDefinitions()}

\${NAMING_CONVENTION_RULES}`;

      expect(promptTemplate).toContain('getTypeDefinitions()');
    });

    it('should be included in artifact component generation prompts', () => {
      const promptTemplate = `ARTIFACT COMPONENT DATA:
{{DATA}}

COMPONENT ID: {{COMPONENT_ID}}

\${getTypeDefinitions()}

\${NAMING_CONVENTION_RULES}`;

      expect(promptTemplate).toContain('getTypeDefinitions()');
    });
  });
});
