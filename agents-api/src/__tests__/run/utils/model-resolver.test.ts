import type { Models } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveModelConfig } from '../../../domains/run/utils/model-resolver';

function createExecutionContext(params: {
  tenantId?: string;
  projectId?: string;
  agentId?: string;
  agentModels?: Models | null;
  projectModels?: Models | null;
}) {
  const tenantId = params.tenantId ?? 'tenant-123';
  const projectId = params.projectId ?? 'project-123';
  const agentId = params.agentId ?? 'agent-123';

  return {
    apiKey: 'test-api-key',
    apiKeyId: 'test-key',
    tenantId,
    projectId,
    agentId,
    baseUrl: 'http://localhost:3003',
    resolvedRef: { type: 'branch', name: 'main', hash: 'test-hash' },
    project: {
      id: projectId,
      tenantId,
      name: 'Test Project',
      models: params.projectModels ?? null,
      agents: {
        [agentId]: {
          id: agentId,
          tenantId,
          projectId,
          name: 'Test Agent',
          description: 'Test agent',
          defaultSubAgentId: agentId,
          models: params.agentModels ?? null,
          subAgents: {},
          tools: {},
          externalAgents: {},
          teamAgents: {},
          transferRelations: {},
          delegateRelations: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          contextConfigId: null,
          contextConfig: null,
          statusUpdates: { enabled: false },
        },
      },
      tools: {},
      functions: {},
      dataComponents: {},
      artifactComponents: {},
      externalAgents: {},
      credentialReferences: {},
      statusUpdates: null,
    },
  } as any;
}

describe('resolveModelConfig', () => {
  const mockAgentId = 'agent-123';
  const baseAgent = {
    id: 'agent-123',
    tenantId: 'tenant-123',
    projectId: 'project-123',
    name: 'Test Agent',
    models: null,
  } as any;

  beforeEach(() => {
    // Clear all mock calls and implementations
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clear mocks after each test
    vi.clearAllMocks();
  });

  describe('when agent has base model defined', () => {
    it('should use agent base model for all model types when only base is defined', async () => {
      const subAgent = {
        ...baseAgent,
        models: {
          base: { model: 'gpt-4' },
        },
      } as any;

      const result = await resolveModelConfig(
        createExecutionContext({ agentId: mockAgentId }),
        subAgent
      );

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        summarizer: { model: 'gpt-4' },
      });
    });

    it('should use specific models when defined, fallback to base for undefined ones', async () => {
      const subAgent = {
        ...baseAgent,
        models: {
          base: { model: 'gpt-4' },
          summarizer: undefined,
        },
      } as any;

      const result = await resolveModelConfig(
        createExecutionContext({ agentId: mockAgentId }),
        subAgent
      );

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        summarizer: { model: 'gpt-4' },
      });
    });

    it('should use all specific models when all are defined', async () => {
      const subAgent = {
        ...baseAgent,
        models: {
          base: { model: 'gpt-4' },
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as any;

      const result = await resolveModelConfig(
        createExecutionContext({ agentId: mockAgentId }),
        subAgent
      );

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        summarizer: { model: 'claude-3.5-haiku' },
      });
    });
  });

  describe('when agent does not have base model defined', () => {
    it('should use agent model config when available', async () => {
      const subAgent = {
        ...baseAgent,
        models: null,
      } as any;

      const result = await resolveModelConfig(
        createExecutionContext({
          agentId: mockAgentId,
          agentModels: {
            base: { model: 'claude-3-sonnet' },
            summarizer: undefined,
          },
        }),
        subAgent
      );

      expect(result).toEqual({
        base: { model: 'claude-3-sonnet' },
        summarizer: { model: 'claude-3-sonnet' },
      });
    });

    it('should respect agent-specific models even when using agent base model', async () => {
      const subAgent = {
        ...baseAgent,
        models: {
          base: undefined,
          summarizer: undefined,
        },
      } as any;

      const result = await resolveModelConfig(
        createExecutionContext({
          agentId: mockAgentId,
          agentModels: {
            base: { model: 'claude-3-sonnet' },
            summarizer: { model: 'claude-3-opus' },
          },
        }),
        subAgent
      );

      expect(result).toEqual({
        base: { model: 'claude-3-sonnet' },
        summarizer: { model: 'claude-3-opus' }, // Falls back to agent
      });
    });

    it('should fallback to project config when agent has no base model', async () => {
      const subAgent = {
        ...baseAgent,
        models: null,
      } as any;

      const result = await resolveModelConfig(
        createExecutionContext({
          agentId: mockAgentId,
          agentModels: null,
          projectModels: {
            base: { model: 'gpt-3.5-turbo' },
            summarizer: { model: 'gpt-4' },
          },
        }),
        subAgent
      );

      expect(result).toEqual({
        base: { model: 'gpt-3.5-turbo' },
        summarizer: { model: 'gpt-4' },
      });
    });

    it('should respect agent-specific models when using project base model', async () => {
      const subAgent = {
        ...baseAgent,
        models: {
          base: undefined,
          summarizer: { model: 'claude-3.5-haiku' },
        },
      } as any;

      const result = await resolveModelConfig(
        createExecutionContext({
          agentId: mockAgentId,
          agentModels: null,
          projectModels: {
            base: { model: 'gpt-4' },
            summarizer: { model: 'gpt-3.5-turbo' },
          },
        }),
        subAgent
      );

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        summarizer: { model: 'claude-3.5-haiku' }, // Agent-specific takes precedence
      });
    });
  });

  describe('error handling', () => {
    it('should throw error when no base model is configured anywhere', async () => {
      const subAgent = {
        ...baseAgent,
        models: null,
      } as any;

      await expect(
        resolveModelConfig(
          createExecutionContext({
            agentId: mockAgentId,
            agentModels: null,
            projectModels: null,
          }),
          subAgent
        )
      ).rejects.toThrow(
        'Base model configuration is required. Please configure models at the project level.'
      );
    });

    it('should throw error when project models exist but no base model', async () => {
      const subAgent = {
        ...baseAgent,
        models: null,
      } as any;

      await expect(
        resolveModelConfig(
          createExecutionContext({
            agentId: mockAgentId,
            agentModels: null,
            projectModels: {
              base: undefined,
              summarizer: { model: 'claude-3.5-haiku' },
            } as any,
          }),
          subAgent
        )
      ).rejects.toThrow(
        'Base model configuration is required. Please configure models at the project level.'
      );
    });

    it('should handle null agent gracefully', async () => {
      const subAgent = {
        ...baseAgent,
        models: null,
      } as any;

      const executionContext = createExecutionContext({
        agentId: mockAgentId,
        agentModels: null,
        projectModels: {
          base: { model: 'gpt-4' },
          summarizer: undefined,
        },
      });
      delete executionContext.project.agents[mockAgentId];

      const result = await resolveModelConfig(executionContext, subAgent);

      expect(result).toEqual({
        base: { model: 'gpt-4' },
        summarizer: { model: 'gpt-4' },
      });
    });

    it('should handle null project gracefully', async () => {
      const subAgent = {
        ...baseAgent,
        models: null,
      } as any;

      const executionContext = createExecutionContext({
        agentId: mockAgentId,
        agentModels: null,
        projectModels: null,
      });
      delete executionContext.project.agents[mockAgentId];

      await expect(resolveModelConfig(executionContext, subAgent)).rejects.toThrow(
        'Base model configuration is required. Please configure models at the project level.'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle agent models with null base model', async () => {
      const subAgent = {
        ...baseAgent,
        models: {
          base: null as any,
          summarizer: undefined,
        },
      } as any;

      const result = await resolveModelConfig(
        createExecutionContext({
          agentId: mockAgentId,
          agentModels: {
            base: { model: 'claude-3-sonnet' },
            summarizer: { model: 'claude-3.5-haiku' },
          } as any,
        }),
        subAgent
      );

      expect(result).toEqual({
        base: { model: 'claude-3-sonnet' },
        summarizer: { model: 'claude-3.5-haiku' }, // Falls back to agent
      });
    });

    it('should handle mixed null and undefined values', async () => {
      const subAgent = {
        ...baseAgent,
        models: {
          base: undefined,
          summarizer: { model: 'custom-summarizer' },
        },
      } as any;

      const executionContext = createExecutionContext({
        agentId: mockAgentId,
        agentModels: null,
        projectModels: {
          base: { model: 'base-model' },
          summarizer: null as any,
        } as any,
      });
      delete executionContext.project.agents[mockAgentId];

      const result = await resolveModelConfig(executionContext, subAgent);

      expect(result).toEqual({
        base: { model: 'base-model' },
        summarizer: { model: 'custom-summarizer' }, // Agent-specific takes precedence
      });
    });
  });
});
