import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { compareProjectDefinitions } from '../../utils/json-comparison';
import { loadProject } from '../../utils/project-loader';

describe('Round-Trip Validation', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = join(tmpdir(), `pull-validation-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('compareProjectDefinitions', () => {
    it('should match identical project definitions', () => {
      const projectData: FullProjectDefinition = {
        id: 'test-project',
        name: 'Test Project',
        description: 'A test project',
        agents: {},
        tools: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const result = compareProjectDefinitions(projectData, projectData);

      expect(result.matches).toBe(true);
      expect(result.differences).toHaveLength(0);
    });

    it('should ignore timestamp differences', () => {
      const original: FullProjectDefinition = {
        id: 'test-project',
        name: 'Test Project',
        description: 'A test project',
        agents: {},
        tools: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const generated: FullProjectDefinition = {
        ...original,
        createdAt: '2024-12-01T00:00:00Z',
        updatedAt: '2024-12-01T00:00:00Z',
      };

      const result = compareProjectDefinitions(original, generated);

      expect(result.matches).toBe(true);
      expect(result.differences).toHaveLength(0);
    });

    it('should detect missing agents', () => {
      const original: FullProjectDefinition = {
        id: 'test-project',
        name: 'Test Project',
        description: '',
        agents: {
          'agent-1': {
            id: 'agent-1',
            name: 'Agent 1',
            instructions: 'Test instructions',
            subAgents: {},
          },
        },
        tools: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const generated: FullProjectDefinition = {
        ...original,
        agents: {},
      };

      const result = compareProjectDefinitions(original, generated);

      expect(result.matches).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
      expect(result.differences.some((d) => d.includes('agent-1'))).toBe(true);
    });

    it('should detect mismatched agent names', () => {
      const original: FullProjectDefinition = {
        id: 'test-project',
        name: 'Test Project',
        description: '',
        agents: {
          'agent-1': {
            id: 'agent-1',
            name: 'Original Name',
            instructions: 'Test instructions',
            subAgents: {},
          },
        },
        tools: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const generated: FullProjectDefinition = {
        ...original,
        agents: {
          'agent-1': {
            id: 'agent-1',
            name: 'Different Name',
            instructions: 'Test instructions',
            subAgents: {},
          },
        },
      };

      const result = compareProjectDefinitions(original, generated);

      expect(result.matches).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
      expect(result.differences.some((d) => d.includes('name'))).toBe(true);
    });

    it('should detect tool count mismatches', () => {
      const original: FullProjectDefinition = {
        id: 'test-project',
        name: 'Test Project',
        description: '',
        agents: {},
        tools: {
          'tool-1': {
            id: 'tool-1',
            name: 'Tool 1',
            config: {
              type: 'mcp',
              mcp: {
                server: { url: 'http://localhost:8000' },
                transport: 'sse',
              },
            },
          },
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const generated: FullProjectDefinition = {
        ...original,
        tools: {},
      };

      const result = compareProjectDefinitions(original, generated);

      expect(result.matches).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
      expect(result.differences.some((d) => d.includes('Tool count mismatch'))).toBe(true);
    });

    it('should handle empty description gracefully', () => {
      const original: FullProjectDefinition = {
        id: 'test-project',
        name: 'Test Project',
        description: '',
        agents: {},
        tools: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const generated: FullProjectDefinition = {
        ...original,
        description: undefined,
      };

      const result = compareProjectDefinitions(original, generated);

      // Empty string vs undefined should be considered equivalent
      expect(result.matches).toBe(true);
    });

    it('should report warnings for extra keys in nested objects', () => {
      const original: FullProjectDefinition = {
        id: 'test-project',
        name: 'Test Project',
        description: '',
        agents: {
          'agent-1': {
            id: 'agent-1',
            name: 'Agent 1',
            instructions: 'Test instructions',
            subAgents: {},
          },
        },
        tools: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const generated: FullProjectDefinition = {
        ...original,
        agents: {
          'agent-1': {
            ...(original.agents as any)['agent-1'],
            extraField: 'extra value',
          } as any,
        },
      };

      const result = compareProjectDefinitions(original, generated);

      // Should still match (extra fields are warnings, not errors)
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.matches).toBe(true);
    });
  });

  describe('loadProject', () => {
    it('should load a valid project from index.ts', async () => {
      // Create a simple project file
      const projectCode = `
import { project } from '@inkeep/agents-sdk';

export const testProject = project({
  id: 'test-project',
  name: 'Test Project',
  description: 'A test project'
});
`;

      writeFileSync(join(testDir, 'index.ts'), projectCode);

      // Set environment variables
      process.env.INKEEP_TENANT_ID = 'test-tenant';
      process.env.INKEEP_API_URL = 'http://localhost:3002';

      const project = await loadProject(testDir);

      expect(project).toBeDefined();
      expect(project.getId()).toBe('test-project');
      expect(project.getName()).toBe('Test Project');

      // Clean up
      delete process.env.INKEEP_TENANT_ID;
      delete process.env.INKEEP_API_URL;
    });

    it('should throw error if index.ts not found', async () => {
      await expect(loadProject(testDir)).rejects.toThrow('index.ts not found');
    });

    it('should throw error if no project export found', async () => {
      // Create a file without project export
      const code = `
export const notAProject = {
  foo: 'bar'
};
`;

      writeFileSync(join(testDir, 'index.ts'), code);

      await expect(loadProject(testDir)).rejects.toThrow('No project export found');
    });
  });

  describe('Full Round-Trip Scenario', () => {
    it('should successfully round-trip a simple project', async () => {
      const originalData: FullProjectDefinition = {
        id: 'round-trip-test',
        name: 'Round Trip Test',
        description: 'Testing round-trip validation',
        agents: {},
        tools: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // Generate TypeScript code matching the original data
      const generatedCode = `
import { project } from '@inkeep/agents-sdk';

export const roundTripProject = project({
  id: 'round-trip-test',
  name: 'Round Trip Test',
  description: 'Testing round-trip validation'
});
`;

      writeFileSync(join(testDir, 'index.ts'), generatedCode);

      // Set environment variables
      process.env.INKEEP_TENANT_ID = 'test-tenant';
      process.env.INKEEP_API_URL = 'http://localhost:3002';

      try {
        // Load the generated project
        const project = await loadProject(testDir);

        // Configure it
        project.setConfig('test-tenant', 'http://localhost:3002');

        // Serialize it back to JSON
        const generatedData = await project.getFullDefinition();

        // Compare with original
        const comparison = compareProjectDefinitions(originalData, generatedData);

        // Should match (ignoring timestamps)
        expect(comparison.matches).toBe(true);
        expect(comparison.differences).toHaveLength(0);
      } finally {
        // Clean up
        delete process.env.INKEEP_TENANT_ID;
        delete process.env.INKEEP_API_URL;
      }
    });
  });
});
