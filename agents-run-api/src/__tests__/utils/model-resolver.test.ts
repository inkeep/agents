import type { AgentGraphSelect, AgentSelect, ProjectSelect } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveModelConfig } from '../../utils/model-resolver';

// Mock the database client
vi.mock('../../data/db/dbClient', () => ({
  default: 'mock-db-client',
}));

// Mock the agents-core functions - use importOriginal to preserve existing mocks
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getAgentGraphById: vi.fn(),
    getProject: vi.fn(),
  };
});

// Import mocked functions
const mockGetAgentGraphById = vi.mocked(await import('@inkeep/agents-core')).getAgentGraphById;
const mockGetProject = vi.mocked(await import('@inkeep/agents-core')).getProject;

describe('resolveModelConfig', () => {
  const mockGraphId = 'graph-123';
  const baseAgent = {
    id: 'agent-123',
    tenantId: 'tenant-123',
    projectId: 'project-123',
    name: 'Test Agent',
  } as AgentSelect;

  beforeEach(() => {
    // Clear all mock calls and implementations
    vi.clearAllMocks();
    
    // Reset mock implementations to default
    mockGetAgentGraphById.mockReset();
    mockGetProject.mockReset();

    // Setup default mock implementations that return functions
    mockGetAgentGraphById.mockReturnValue(vi.fn());
    mockGetProject.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    // Clear mocks after each test
    vi.clearAllMocks();
  });

  describe('when agent has base model defined', () => {
    it('should use agent base model for all model types when only base is defined', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: {
          base: { model: 'gpt-4' },
        },
      } as AgentSelect;

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4' },
        summarizer: { model: 'gpt-4' },
      });

      // Should not call graph or project functions
      expect(mockGetAgentGraphById).not.toHaveBeenCalled();
      expect(mockGetProject).not.toHaveBeenCalled();
    });

    it('should use specific models when defined, fallback to base for undefined ones', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: {
          base: { model: 'gpt-4' },
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: undefined,
        },
      } as AgentSelect;

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4-turbo' },
        summarizer: { model: 'gpt-4' },
      });
    });

    it('should use all specific models when all are defined', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: {
          base: { model: 'gpt-4' },
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as AgentSelect;

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4-turbo' },
        summarizer: { model: 'claude-3.5-haiku' },
      });
    });
  });

  describe('when agent does not have base model defined', () => {
    it('should use graph model config when available', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: null,
      } as AgentSelect;

      const mockGraph: AgentGraphSelect = {
        id: 'graph-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        models: {
          base: { model: 'claude-3-sonnet' },
          structuredOutput: { model: 'claude-3.5-haiku' },
          summarizer: undefined,
        },
      } as AgentGraphSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(mockGraph);
      mockGetAgentGraphById.mockReturnValue(mockGraphFn);

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'claude-3-sonnet' },
        structuredOutput: { model: 'claude-3.5-haiku' },
        summarizer: { model: 'claude-3-sonnet' },
      });

      expect(mockGetAgentGraphById).toHaveBeenCalledWith('mock-db-client');
      expect(mockGraphFn).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'tenant-123',
          projectId: 'project-123',
          graphId: 'graph-123',
        },
      });
    });

    it('should respect agent-specific models even when using graph base model', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: {
          base: undefined,
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: undefined,
        },
      } as AgentSelect;

      const mockGraph: AgentGraphSelect = {
        id: 'graph-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        models: {
          base: { model: 'claude-3-sonnet' },
          structuredOutput: { model: 'claude-3.5-haiku' },
          summarizer: { model: 'claude-3-opus' },
        },
      } as AgentGraphSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(mockGraph);
      mockGetAgentGraphById.mockReturnValue(mockGraphFn);

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'claude-3-sonnet' },
        structuredOutput: { model: 'gpt-4-turbo' }, // Agent-specific takes precedence
        summarizer: { model: 'claude-3-opus' }, // Falls back to graph
      });
    });

    it('should fallback to project config when graph has no base model', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: null,
      } as AgentSelect;

      const mockGraph: AgentGraphSelect = {
        id: 'graph-123',
        models: null,
      } as AgentGraphSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        tenantId: 'tenant-123',
        models: {
          base: { model: 'gpt-3.5-turbo' },
          structuredOutput: undefined,
          summarizer: { model: 'gpt-4' },
        },
      } as ProjectSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(mockGraph);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentGraphById.mockReturnValue(mockGraphFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-3.5-turbo' },
        structuredOutput: { model: 'gpt-3.5-turbo' }, // Falls back to base
        summarizer: { model: 'gpt-4' },
      });

      expect(mockGetProject).toHaveBeenCalledWith('mock-db-client');
      expect(mockProjectFn).toHaveBeenCalledWith({
        scopes: { tenantId: 'tenant-123', projectId: 'project-123' },
      });
    });

    it('should respect agent-specific models when using project base model', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: {
          base: undefined,
          structuredOutput: undefined,
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as AgentSelect;

      const mockGraph: AgentGraphSelect = {
        id: 'graph-123',
        models: null,
      } as AgentGraphSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        tenantId: 'tenant-123',
        models: {
          base: { model: 'gpt-4' },
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: { model: 'gpt-3.5-turbo' },
        },
      } as ProjectSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(mockGraph);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentGraphById.mockReturnValue(mockGraphFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4-turbo' }, // Falls back to project
        summarizer: { model: 'claude-3.5-haiku' }, // Agent-specific takes precedence
      });
    });
  });

  describe('error handling', () => {
    it('should throw error when no base model is configured anywhere', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: null,
      } as AgentSelect;

      const mockGraph: AgentGraphSelect = {
        id: 'graph-123',
        models: null,
      } as AgentGraphSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        models: null,
      } as ProjectSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(mockGraph);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentGraphById.mockReturnValue(mockGraphFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      await expect(resolveModelConfig(mockGraphId, agent)).rejects.toThrow(
        'Base model configuration is required. Please configure models at the project level.'
      );
    });

    it('should throw error when project models exist but no base model', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: null,
      } as AgentSelect;

      const mockGraph: AgentGraphSelect = {
        id: 'graph-123',
        models: null,
      } as AgentGraphSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        models: {
          base: undefined,
          structuredOutput: { model: 'gpt-4' },
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as unknown as ProjectSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(mockGraph);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentGraphById.mockReturnValue(mockGraphFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      await expect(resolveModelConfig(mockGraphId, agent)).rejects.toThrow(
        'Base model configuration is required. Please configure models at the project level.'
      );
    });

    it('should handle null graph gracefully', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: null,
      } as AgentSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        tenantId: 'tenant-123',
        models: {
          base: { model: 'gpt-4' },
          structuredOutput: undefined,
          summarizer: undefined,
        },
      } as ProjectSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(null);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentGraphById.mockReturnValue(mockGraphFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4' },
        summarizer: { model: 'gpt-4' },
      });
    });

    it('should handle null project gracefully', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: null,
      } as AgentSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(null);
      const mockProjectFn = vi.fn().mockResolvedValue(null);

      mockGetAgentGraphById.mockReturnValue(mockGraphFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      await expect(resolveModelConfig(mockGraphId, agent)).rejects.toThrow(
        'Base model configuration is required. Please configure models at the project level.'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle agent models with null base model', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: {
          base: null as any,
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: undefined,
        },
      } as AgentSelect;

      const mockGraph: AgentGraphSelect = {
        id: 'graph-123',
        models: {
          base: { model: 'claude-3-sonnet' },
          structuredOutput: undefined,
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as AgentGraphSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(mockGraph);
      mockGetAgentGraphById.mockReturnValue(mockGraphFn);

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'claude-3-sonnet' },
        structuredOutput: { model: 'gpt-4-turbo' }, // Agent-specific takes precedence
        summarizer: { model: 'claude-3.5-haiku' }, // Falls back to graph
      });
    });

    it('should handle mixed null and undefined values', async () => {
      const agent: AgentSelect = {
        ...baseAgent,
        models: {
          base: undefined,
          structuredOutput: null as any,
          summarizer: { model: 'custom-summarizer' },
        },
      } as AgentSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        tenantId: 'tenant-123',
        models: {
          base: { model: 'base-model' },
          structuredOutput: { model: 'structured-model' },
          summarizer: null as any,
        },
      } as ProjectSelect;

      const mockGraphFn = vi.fn().mockResolvedValue(null);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentGraphById.mockReturnValue(mockGraphFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      const result = await resolveModelConfig(mockGraphId, agent);

      expect(result).toEqual({
        base: { model: 'base-model' },
        structuredOutput: { model: 'structured-model' }, // Falls back to project
        summarizer: { model: 'custom-summarizer' }, // Agent-specific takes precedence
      });
    });
  });
});
