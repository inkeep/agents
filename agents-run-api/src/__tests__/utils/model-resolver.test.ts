import type { AgentSelect, ProjectSelect, SubAgentSelect } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveModelConfig } from '../../utils/model-resolver';

// Mock the database client
const mockDbClient = 'mock-db-client';
vi.mock('../../data/db/dbClient', () => ({
  default: mockDbClient,
}));

// Mock the agents-core functions - use importOriginal to preserve existing mocks
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getAgentById: vi.fn(),
    getProject: vi.fn(),
  };
});

// Import mocked functions
const mockGetAgentById = vi.mocked(await import('@inkeep/agents-core')).getAgentById;
const mockGetProject = vi.mocked(await import('@inkeep/agents-core')).getProject;

describe('resolveModelConfig', () => {
  const mockAgentId = 'agent-123';
  const baseAgent = {
    id: 'agent-123',
    tenantId: 'tenant-123',
    projectId: 'project-123',
    name: 'Test Agent',
  } as SubAgentSelect;

  beforeEach(() => {
    // Clear all mock calls and implementations
    vi.clearAllMocks();

    // Reset mock implementations to default
    mockGetAgentById.mockReset();
    mockGetProject.mockReset();

    // Setup default mock implementations that return functions
    mockGetAgentById.mockReturnValue(vi.fn());
    mockGetProject.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    // Clear mocks after each test
    vi.clearAllMocks();
  });

  describe('when agent has base model defined', () => {
    it('should use agent base model for all model types when only base is defined', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: {
          base: { model: 'gpt-4' },
        },
      } as SubAgentSelect;

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4' },
        summarizer: { model: 'gpt-4' },
      });

      // Should not call agent or project functions
      expect(mockGetAgentById).not.toHaveBeenCalled();
      expect(mockGetProject).not.toHaveBeenCalled();
    });

    it('should use specific models when defined, fallback to base for undefined ones', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: {
          base: { model: 'gpt-4' },
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: undefined,
        },
      } as SubAgentSelect;

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4-turbo' },
        summarizer: { model: 'gpt-4' },
      });
    });

    it('should use all specific models when all are defined', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: {
          base: { model: 'gpt-4' },
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as SubAgentSelect;

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4-turbo' },
        summarizer: { model: 'claude-3.5-haiku' },
      });
    });
  });

  describe('when agent does not have base model defined', () => {
    it('should use agent model config when available', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: null,
      } as SubAgentSelect;

      const mockAgent: AgentSelect = {
        id: 'agent-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        models: {
          base: { model: 'claude-3-sonnet' },
          structuredOutput: { model: 'claude-3.5-haiku' },
          summarizer: undefined,
        },
      } as AgentSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(mockAgent);
      mockGetAgentById.mockReturnValue(mockAgentFn);

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

      expect(result).toEqual({
        base: { model: 'claude-3-sonnet' },
        structuredOutput: { model: 'claude-3.5-haiku' },
        summarizer: { model: 'claude-3-sonnet' },
      });

      expect(mockGetAgentById).toHaveBeenCalledWith('mock-db-client');
      expect(mockAgentFn).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'tenant-123',
          projectId: 'project-123',
          agentId: 'agent-123',
        },
      });
    });

    it('should respect agent-specific models even when using agent base model', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: {
          base: undefined,
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: undefined,
        },
      } as SubAgentSelect;

      const mockAgent: AgentSelect = {
        id: 'agent-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        models: {
          base: { model: 'claude-3-sonnet' },
          structuredOutput: { model: 'claude-3.5-haiku' },
          summarizer: { model: 'claude-3-opus' },
        },
      } as AgentSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(mockAgent);
      mockGetAgentById.mockReturnValue(mockAgentFn);

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

      expect(result).toEqual({
        base: { model: 'claude-3-sonnet' },
        structuredOutput: { model: 'gpt-4-turbo' }, // Agent-specific takes precedence
        summarizer: { model: 'claude-3-opus' }, // Falls back to agent
      });
    });

    it('should fallback to project config when agent has no base model', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: null,
      } as SubAgentSelect;

      const mockAgent: AgentSelect = {
        id: 'agent-123',
        models: null,
      } as AgentSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        tenantId: 'tenant-123',
        models: {
          base: { model: 'gpt-3.5-turbo' },
          structuredOutput: undefined,
          summarizer: { model: 'gpt-4' },
        },
      } as ProjectSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(mockAgent);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentById.mockReturnValue(mockAgentFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

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
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: {
          base: undefined,
          structuredOutput: undefined,
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as SubAgentSelect;

      const mockAgent: AgentSelect = {
        id: 'agent-123',
        models: null,
      } as AgentSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        tenantId: 'tenant-123',
        models: {
          base: { model: 'gpt-4' },
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: { model: 'gpt-3.5-turbo' },
        },
      } as ProjectSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(mockAgent);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentById.mockReturnValue(mockAgentFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4-turbo' }, // Falls back to project
        summarizer: { model: 'claude-3.5-haiku' }, // Agent-specific takes precedence
      });
    });
  });

  describe('error handling', () => {
    it('should throw error when no base model is configured anywhere', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: null,
      } as SubAgentSelect;

      const mockAgent: AgentSelect = {
        id: 'agent-123',
        models: null,
      } as AgentSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        models: null,
      } as ProjectSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(mockAgent);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentById.mockReturnValue(mockAgentFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      await expect(resolveModelConfig({} as any, mockAgentId, agent)).rejects.toThrow(
        'Base model configuration is required. Please configure models at the project level.'
      );
    });

    it('should throw error when project models exist but no base model', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: null,
      } as SubAgentSelect;

      const mockAgent: AgentSelect = {
        id: 'agent-123',
        models: null,
      } as AgentSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        models: {
          base: undefined,
          structuredOutput: { model: 'gpt-4' },
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as unknown as ProjectSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(mockAgent);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentById.mockReturnValue(mockAgentFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      await expect(resolveModelConfig({} as any, mockAgentId, agent)).rejects.toThrow(
        'Base model configuration is required. Please configure models at the project level.'
      );
    });

    it('should handle null agent gracefully', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: null,
      } as SubAgentSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        tenantId: 'tenant-123',
        models: {
          base: { model: 'gpt-4' },
          structuredOutput: undefined,
          summarizer: undefined,
        },
      } as ProjectSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(null);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentById.mockReturnValue(mockAgentFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4' },
        summarizer: { model: 'gpt-4' },
      });
    });

    it('should handle null project gracefully', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: null,
      } as SubAgentSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(null);
      const mockProjectFn = vi.fn().mockResolvedValue(null);

      mockGetAgentById.mockReturnValue(mockAgentFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      await expect(resolveModelConfig({} as any, mockAgentId, agent)).rejects.toThrow(
        'Base model configuration is required. Please configure models at the project level.'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle agent models with null base model', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: {
          base: null as any,
          structuredOutput: { model: 'gpt-4-turbo' },
          summarizer: undefined,
        },
      } as SubAgentSelect;

      const mockAgent: AgentSelect = {
        id: 'agent-123',
        models: {
          base: { model: 'claude-3-sonnet' },
          structuredOutput: undefined,
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as AgentSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(mockAgent);
      mockGetAgentById.mockReturnValue(mockAgentFn);

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

      expect(result).toEqual({
        base: { model: 'claude-3-sonnet' },
        structuredOutput: { model: 'gpt-4-turbo' }, // Agent-specific takes precedence
        summarizer: { model: 'claude-3.5-haiku' }, // Falls back to agent
      });
    });

    it('should handle mixed null and undefined values', async () => {
      const agent: SubAgentSelect = {
        ...baseAgent,
        models: {
          base: undefined,
          structuredOutput: null as any,
          summarizer: { model: 'custom-summarizer' },
        },
      } as SubAgentSelect;

      const mockProject: ProjectSelect = {
        id: 'project-123',
        tenantId: 'tenant-123',
        models: {
          base: { model: 'base-model' },
          structuredOutput: { model: 'structured-model' },
          summarizer: null as any,
        },
      } as ProjectSelect;

      const mockAgentFn = vi.fn().mockResolvedValue(null);
      const mockProjectFn = vi.fn().mockResolvedValue(mockProject);

      mockGetAgentById.mockReturnValue(mockAgentFn);
      mockGetProject.mockReturnValue(mockProjectFn);

      const result = await resolveModelConfig(mockDbClient as any, mockAgentId, agent);

      expect(result).toEqual({
        base: { model: 'base-model' },
        structuredOutput: { model: 'structured-model' }, // Falls back to project
        summarizer: { model: 'custom-summarizer' }, // Agent-specific takes precedence
      });
    });
  });
});
