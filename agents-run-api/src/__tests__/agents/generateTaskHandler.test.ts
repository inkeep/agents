import { TaskState } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { A2ATask } from '../../a2a/types';
import {
  createTaskHandler,
  createTaskHandlerConfig,
  deserializeTaskHandlerConfig,
  serializeTaskHandlerConfig,
  type TaskHandlerConfig,
} from '../../agents/generateTaskHandler';
import { parseEmbeddedJson } from '../../utils/json-parser';

// Mock @inkeep/agents-core functions using hoisted pattern
const {
  getRelatedAgentsForAgentMock,
  getToolsForAgentMock,
  getSubAgentByIdMock: getAgentByIdMock,
  getAgentAgentMock,
  getAgentAgentByIdMock,
  getDataComponentsForAgentMock,
  getArtifactComponentsForAgentMock,
  getExternalAgentsForSubAgentMock,
  getTeamAgentsForSubAgentMock,
  getAgentWithDefaultSubAgentMock,
  getProjectMock,
  dbResultToMcpToolMock,
} = vi.hoisted(() => {
  const getRelatedAgentsForAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      data: [
        {
          id: 'agent-2',
          name: 'Test Agent 2',
          description: 'Test description',
          relationType: 'transfer',
        },
      ],
    })
  );

  const getToolsForAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      data: [
        {
          tool: {
            id: 'tool-1',
            name: 'Test Tool',
            type: 'mcp',
            status: 'active',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      ],
    })
  );

  const getSubAgentByIdMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'test-agent',
      name: 'Test Agent',
      description: 'Test agent description',
      prompt: 'You are a helpful test agent',
      conversationHistoryConfig: {
        mode: 'full',
        limit: 10,
      },
      models: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    })
  );

  const getAgentAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'test-agent',
      contextConfigId: 'context-123',
      models: null,
    })
  );
  const getAgentAgentByIdMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'test-agent',
      contextConfigId: 'context-123',
      models: {
        base: { model: 'openai/gpt-4' },
        structuredOutput: { model: 'openai/gpt-4' },
        summarizer: { model: 'openai/gpt-3.5-turbo' },
      },
    })
  );

  const dbResultToMcpToolMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      // Core tool fields
      tenantId: 'test-tenant',
      projectId: 'test-project',
      id: 'tool-1',
      name: 'Test Tool',
      config: {
        type: 'mcp' as const,
        mcp: {
          server: {
            url: 'http://localhost:3000/mcp',
            timeout: 30000,
          },
          transport: {
            type: 'http' as const,
          },
        },
      },

      // Optional fields that can be undefined
      credentialReferenceId: undefined,
      headers: undefined,
      imageUrl: undefined,
      capabilities: undefined,
      lastError: undefined,

      // Computed fields from dbResultToMcpTool
      status: 'healthy' as const,
      availableTools: [
        {
          name: 'test_tool_function',
          description: 'A test tool function',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Query parameter' },
            },
            required: ['query'],
          },
        },
      ],
      createdAt: new Date('2024-01-15T09:00:00Z'),
      updatedAt: new Date('2024-01-15T10:00:00Z'),
    })
  );

  const getDataComponentsForAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue([
      {
        id: 'data-1',
        name: 'Test Data Component',
        type: 'test',
      },
    ])
  );

  const getArtifactComponentsForAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue([
      {
        id: 'artifact-1',
        name: 'Test Artifact Component',
        type: 'test',
      },
    ])
  );

  const getExternalAgentsForSubAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
  );

  const getTeamAgentsForSubAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      data: [
        {
          id: 'team-relation-1',
          targetAgentId: 'team-agent-1',
          targetAgent: {
            id: 'team-agent-1',
            name: 'Team Agent 1',
            description: 'A team agent for delegation',
          },
          headers: { 'X-Custom-Header': 'team-value' },
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, pages: 1 },
    })
  );

  const getAgentWithDefaultSubAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'team-agent-1',
      name: 'Team Agent 1',
      description: 'A team agent for delegation',
      defaultSubAgent: {
        id: 'team-agent-1-default',
        name: 'Team Agent 1 Default',
        description: 'Default sub agent for team agent 1',
        prompt: 'You are a helpful team agent',
        conversationHistoryConfig: {
          mode: 'full',
          limit: 10,
        },
        models: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    })
  );

  const getProjectMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'test-project',
      name: 'Test Project',
      models: {
        base: {
          model: 'openai/gpt-4',
        },
        structuredOutput: {
          model: 'openai/gpt-4',
        },
        summarizer: {
          model: 'openai/gpt-3.5-turbo',
        },
      },
    })
  );

  return {
    getRelatedAgentsForAgentMock,
    getToolsForAgentMock,
    getSubAgentByIdMock,
    getAgentAgentMock,
    getAgentAgentByIdMock,
    getDataComponentsForAgentMock,
    getArtifactComponentsForAgentMock,
    getExternalAgentsForSubAgentMock,
    getTeamAgentsForSubAgentMock,
    getAgentWithDefaultSubAgentMock,
    getProjectMock,
    dbResultToMcpToolMock,
  };
});

vi.mock('@inkeep/agents-core', () => ({
  getRelatedAgentsForAgent: getRelatedAgentsForAgentMock,
  getToolsForAgent: getToolsForAgentMock,
  getSubAgentById: getAgentByIdMock,
  getAgentById: getAgentAgentMock,
  getAgentAgent: getAgentAgentMock,
  getAgentAgentById: getAgentAgentByIdMock,
  getTeamAgentsForSubAgent: getTeamAgentsForSubAgentMock,
  getAgentWithDefaultSubAgent: getAgentWithDefaultSubAgentMock,
  getTracer: vi.fn().mockReturnValue({
    startSpan: vi.fn().mockReturnValue({
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    }),
  }),
  getDataComponentsForAgent: getDataComponentsForAgentMock,
  getArtifactComponentsForAgent: getArtifactComponentsForAgentMock,
  getExternalAgentsForSubAgent: getExternalAgentsForSubAgentMock,
  getProject: getProjectMock,
  dbResultToMcpTool: dbResultToMcpToolMock,
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  generateId: vi.fn(() => 'test-id-123'),
  loadEnvironmentFiles: vi.fn(),
  TaskState: {
    Completed: 'completed',
    Failed: 'failed',
    Working: 'working',
  },
}));

// Mock database client
vi.mock('../../data/db/dbClient.js', () => ({
  default: {},
}));

// These functions are now mocked via @inkeep/agents-core above

// Store the last Agent constructor arguments for verification
let lastAgentConstructorArgs: any = null;

vi.mock('../../agents/Agent.js', () => ({
  Agent: class MockAgent {
    config: any;

    constructor(config: any) {
      this.config = config;
      // Capture constructor arguments for testing
      lastAgentConstructorArgs = config;
    }

    setDelegationStatus(_isDelegated: boolean) {
      // Mock implementation
    }

    setDelegationId(_delegationId: string | undefined) {
      // Mock implementation
    }

    async generate(message: string, _options: any) {
      // Mock different response types based on message content
      if (message.includes('transfer')) {
        return {
          steps: [
            {
              content: [
                {
                  type: 'tool-call',
                  toolName: 'transferToRefundAgent',
                  toolCallId: 'call-123',
                },
                {
                  type: 'tool-result',
                  toolCallId: 'call-123',
                  output: {
                    type: 'transfer',
                    targetSubAgentId: 'refund-agent',
                    fromSubAgentId: 'test-agent',
                    reason: 'User needs refund assistance',
                  },
                },
                {
                  type: 'text',
                  text: 'Transferring to refund agent',
                },
              ],
            },
          ],
          text: 'Transferring to refund agent',
          formattedContent: {
            parts: [
              {
                kind: 'text',
                text: 'I will transfer you to the refund agent',
              },
            ],
          },
        };
      }

      return {
        steps: [
          {
            content: [
              {
                type: 'text',
                text: `Response to: ${message}`,
              },
            ],
          },
        ],
        text: `Response to: ${message}`,
        formattedContent: {
          parts: [
            {
              kind: 'text',
              text: `Response to: ${message}`,
            },
          ],
        },
      };
    }
  },
}));

vi.mock('../../utils/stream-registry.js', () => ({
  getStreamHelper: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('generateTaskHandler', () => {
  const mockConfig: TaskHandlerConfig = {
    dbClient: {} as any,
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentId: 'test-agent',
    subAgentId: 'test-agent',
    baseUrl: 'http://localhost:3000',
    agentSchema: {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'Test agent description',
      prompt: 'You are a helpful test agent',
      models: null,
      conversationHistoryConfig: {
        mode: 'full',
        limit: 50,
        maxOutputTokens: 4000,
        includeInternal: false,
        messageTypes: ['chat', 'tool-result'],
      },
      stopWhen: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    name: 'Test Agent',
    description: 'Test agent description',
    conversationHistoryConfig: {
      mode: 'full',
      limit: 10,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseEmbeddedJson', () => {
    it('should parse valid JSON strings in nested objects', () => {
      const data = {
        normalString: 'hello',
        jsonString: '{"key": "value"}',
        arrayString: '[1, 2, 3]',
        nested: {
          jsonString: '{"nested": true}',
        },
      };

      const result = parseEmbeddedJson(data);

      expect(result.normalString).toBe('hello');
      expect(result.jsonString).toEqual({ key: 'value' });
      expect(result.arrayString).toEqual([1, 2, 3]);
      expect(result.nested.jsonString).toEqual({ nested: true });
    });

    it('should leave non-JSON strings unchanged', () => {
      const data = {
        notJson: 'just a string',
        malformed: '{"incomplete": }',
      };

      const result = parseEmbeddedJson(data);

      expect(result.notJson).toBe('just a string');
      expect(result.malformed).toBe('{"incomplete": }');
    });
  });

  describe('createTaskHandler', () => {
    beforeEach(() => {
      // Reset captured constructor args before each test
      lastAgentConstructorArgs = null;
    });

    it('should handle basic task execution', async () => {
      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'Hello, how can you help?' }],
        },
        context: {
          conversationId: 'conv-123',
        },
      };

      const result = await taskHandler(task);

      expect(result.status.state).toBe(TaskState.Completed);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts?.[0].parts).toEqual([
        {
          kind: 'text',
          text: 'Response to: Hello, how can you help?',
        },
      ]);
    });

    it('should pass models to Agent constructor', async () => {
      const configWithModel: TaskHandlerConfig = {
        ...mockConfig,
        agentSchema: {
          ...mockConfig.agentSchema,
          models: {
            base: {
              model: 'anthropic/claude-sonnet-4-20250514',
              providerOptions: {
                anthropic: {
                  temperature: 0.7,
                  maxTokens: 4096,
                },
              },
            },
          },
        },
      };

      const taskHandler = createTaskHandler(configWithModel);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'Test message' }],
        },
      };

      await taskHandler(task);

      // Verify Agent constructor received models
      expect(lastAgentConstructorArgs).toBeDefined();
      expect(lastAgentConstructorArgs.models).toEqual({
        base: {
          model: 'anthropic/claude-sonnet-4-20250514',
          providerOptions: {
            anthropic: {
              temperature: 0.7,
              maxTokens: 4096,
            },
          },
        },
      });
    });

    it('should handle OpenAI model settingsuration', async () => {
      const configWithOpenAI: TaskHandlerConfig = {
        ...mockConfig,
        agentSchema: {
          ...mockConfig.agentSchema,
          models: {
            base: {
              model: 'openai/gpt-4o',
              providerOptions: {
                openai: {
                  temperature: 0.3,
                  frequencyPenalty: 0.1,
                  presencePenalty: 0.2,
                },
              },
            },
          },
        },
      };

      const taskHandler = createTaskHandler(configWithOpenAI);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'Test message' }],
        },
      };

      await taskHandler(task);

      // Verify Agent constructor received OpenAI configuration
      expect(lastAgentConstructorArgs).toBeDefined();
      expect(lastAgentConstructorArgs.models).toEqual({
        base: {
          model: 'openai/gpt-4o',
          providerOptions: {
            openai: {
              temperature: 0.3,
              frequencyPenalty: 0.1,
              presencePenalty: 0.2,
            },
          },
        },
      });
    });

    it('should handle undefined models', async () => {
      const configWithoutModel: TaskHandlerConfig = {
        ...mockConfig,
        agentSchema: {
          ...mockConfig.agentSchema,
          models: null,
        },
      };

      const taskHandler = createTaskHandler(configWithoutModel);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'Test message' }],
        },
      };

      await taskHandler(task);

      // Verify Agent constructor received undefined models
      expect(lastAgentConstructorArgs).toBeDefined();
      expect(lastAgentConstructorArgs.models).toBeUndefined();
    });

    it('should handle empty task input', async () => {
      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [
            { kind: 'text', text: '   ' }, // Whitespace only
          ],
        },
      };

      const result = await taskHandler(task);

      expect(result.status.state).toBe(TaskState.Failed);
      expect(result.status.message).toBe('No text content found in task input');
      expect(result.artifacts).toEqual([]);
    });

    it('should handle transfer requests', async () => {
      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'I need a refund, please transfer to support' }],
        },
        context: {
          conversationId: 'conv-123',
        },
      };

      const result = await taskHandler(task);

      expect(result.status.state).toBe(TaskState.Completed);
      expect(result.status.message).toBe('Transfer requested to refund-agent');
      expect((result.artifacts?.[0].parts[0] as any).data.type).toBe('transfer');
      expect((result.artifacts?.[0].parts[0] as any).data.targetSubAgentId).toBe('refund-agent');
      expect((result.artifacts?.[0].parts[0] as any).data.reason).toBe(
        'Transferring to refund agent'
      );
    });

    it('should extract contextId from task ID when missing', async () => {
      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task_math-demo-123456-chatcmpl-789',
        input: {
          parts: [{ kind: 'text', text: 'Calculate 2+2' }],
        },
        context: {
          conversationId: 'default',
        },
      };

      const result = await taskHandler(task);

      expect(result.status.state).toBe(TaskState.Completed);
      // Verify contextId was extracted (would be logged and passed to Agent.generate)
    });

    it('should handle streaming context', async () => {
      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'Hello streaming' }],
        },
        context: {
          conversationId: 'conv-123',
          metadata: {
            stream_request_id: 'stream-123',
          },
        },
      };

      const result = await taskHandler(task);

      expect(result.status.state).toBe(TaskState.Completed);
      // Verify streaming context was handled
    });

    it('should handle task handler errors', async () => {
      const taskHandler = createTaskHandler(mockConfig);

      // Mock Agent to throw error
      const { Agent } = await import('../../agents/Agent.js');
      vi.mocked(Agent).prototype.generate = vi
        .fn()
        .mockRejectedValue(new Error('Generation failed'));

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'This will fail' }],
        },
      };

      const result = await taskHandler(task);

      expect(result.status.state).toBe(TaskState.Failed);
      expect(result.status.message).toBe('Generation failed');
      expect(result.artifacts).toEqual([]);
    });

    it('should load agent relations and tools', async () => {
      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'Test with relations and tools' }],
        },
      };

      await taskHandler(task);

      // Verify that relations and tools were fetched
      expect(getRelatedAgentsForAgentMock).toHaveBeenCalledWith(expect.anything());
      expect(getToolsForAgentMock).toHaveBeenCalledWith(expect.anything());
      expect(getDataComponentsForAgentMock).toHaveBeenCalledWith(expect.anything());

      // Verify the inner function was called with correct parameters
      const relationsInnerMock = getRelatedAgentsForAgentMock.mock.results[0]?.value;
      expect(relationsInnerMock).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'test-tenant',
          projectId: 'test-project',
          agentId: 'test-agent',
        },
        subAgentId: 'test-agent',
      });

      const toolsInnerMock = getToolsForAgentMock.mock.results[0]?.value;
      expect(toolsInnerMock).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'test-tenant',
          projectId: 'test-project',
          agentId: 'test-agent',
          subAgentId: 'test-agent',
        },
      });

      const dataInnerMock = getDataComponentsForAgentMock.mock.results[0]?.value;
      expect(dataInnerMock).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'test-tenant',
          projectId: 'test-project',
          agentId: 'test-agent',
          subAgentId: 'test-agent',
        },
      });
    });

    it('should enhance team relations with default sub agent data', async () => {
      // Clear all mocks first
      vi.clearAllMocks();

      // Mock the initial team relations call (first call)
      getTeamAgentsForSubAgentMock.mockReturnValueOnce(
        vi.fn().mockResolvedValue({
          data: [
            {
              id: 'team-relation-1',
              targetAgentId: 'team-agent-1',
              targetAgent: {
                id: 'team-agent-1',
                name: 'Team Agent 1',
                description: 'A team agent for delegation',
              },
              headers: { 'X-Custom-Header': 'team-value' },
            },
          ],
          pagination: { page: 1, limit: 10, total: 1, pages: 1 },
        })
      );

      // Mock the default sub agent for the team agent
      getAgentWithDefaultSubAgentMock.mockReturnValueOnce(
        vi.fn().mockResolvedValue({
          id: 'team-agent-1',
          name: 'Team Agent 1',
          description: 'A team agent for delegation',
          defaultSubAgent: {
            id: 'team-agent-1-default',
            name: 'Team Agent 1 Default',
            description: 'Default sub agent for team agent 1',
            prompt: 'You are a helpful team agent',
            conversationHistoryConfig: {
              mode: 'full',
              limit: 10,
            },
            models: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        })
      );

      // Mock related agents for the default sub agent (second call)
      getRelatedAgentsForAgentMock.mockReturnValueOnce(
        vi.fn().mockResolvedValue({
          data: [
            {
              id: 'related-agent-1',
              name: 'Related Agent 1',
              description: 'A related agent',
              relationType: 'delegate',
            },
          ],
        })
      );

      // Mock external agents for the default sub agent (second call)
      getExternalAgentsForSubAgentMock.mockReturnValueOnce(
        vi.fn().mockResolvedValue({
          data: [
            {
              id: 'external-relation-1',
              externalAgent: {
                id: 'external-agent-1',
                name: 'External Agent 1',
                description: 'An external agent',
              },
            },
          ],
        })
      );

      // Mock team agents for the default sub agent (second call)
      getTeamAgentsForSubAgentMock.mockReturnValueOnce(
        vi.fn().mockResolvedValue({
          data: [
            {
              id: 'team-relation-2',
              targetAgentId: 'team-agent-2',
              targetAgent: {
                id: 'team-agent-2',
                name: 'Team Agent 2',
                description: 'Another team agent',
              },
            },
          ],
        })
      );

      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'Test with enhanced team relations' }],
        },
      };

      await taskHandler(task);

      // Verify that getAgentWithDefaultSubAgent was called for the team agent
      expect(getAgentWithDefaultSubAgentMock).toHaveBeenCalledWith(expect.anything());

      // Verify that the Agent constructor received enhanced team relations
      expect(lastAgentConstructorArgs).toBeDefined();
      expect(lastAgentConstructorArgs.delegateRelations).toBeDefined();

      const teamDelegateRelation = lastAgentConstructorArgs.delegateRelations.find(
        (rel: any) => rel.type === 'team'
      );
      expect(teamDelegateRelation).toBeDefined();
      expect(teamDelegateRelation.config.id).toBe('team-agent-1');
      expect(teamDelegateRelation.config.name).toBe('Team Agent 1');
      // The description should be enhanced with related agents information
      expect(teamDelegateRelation.config.description).toContain('A team agent for delegation');
      expect(teamDelegateRelation.config.description).toContain('Can delegate to:');
    });
  });

  describe('createTaskHandlerConfig', () => {
    it('should create config from agent data', async () => {
      const config = await createTaskHandlerConfig({
        dbClient: {} as any,
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        subAgentId: 'test-agent',
        baseUrl: 'https://test.com',
      });

      expect(config).toEqual({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        subAgentId: 'test-agent',
        dbClient: {} as any,
        agentSchema: {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'Test agent description',
          prompt: 'You are a helpful test agent',
          models: {
            base: {
              model: 'openai/gpt-4',
            },
            structuredOutput: {
              model: 'openai/gpt-4',
            },
            summarizer: {
              model: 'openai/gpt-3.5-turbo',
            },
          },
          stopWhen: null,
          conversationHistoryConfig: {
            mode: 'full',
            limit: 10,
          },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        baseUrl: 'https://test.com',
        apiKey: undefined,
        name: 'Test Agent',
        description: 'Test agent description',
        conversationHistoryConfig: {
          mode: 'full',
          limit: 10,
        },
        contextConfigId: 'context-123',
      });
    });

    it('should throw error for non-existent agent', async () => {
      // Mock the getAgentById to return null for this test
      getAgentByIdMock.mockReturnValueOnce(vi.fn().mockResolvedValue(null));

      await expect(
        createTaskHandlerConfig({
          dbClient: {} as any,
          tenantId: 'test-tenant',
          projectId: 'test-project',
          agentId: 'test-agent',
          subAgentId: 'non-existent',
          baseUrl: 'https://test.com',
        })
      ).rejects.toThrow('Agent not found: non-existent');
    });

    it('should preserve modelSettings from agent data', async () => {
      // Mock the getAgentById to return agent with modelSettings
      getAgentByIdMock.mockReturnValueOnce(
        vi.fn().mockResolvedValue({
          id: 'test-agent',
          name: 'Test Agent',
          description: 'Test agent description',
          prompt: 'You are a helpful test agent',
          models: {
            base: {
              model: 'anthropic/claude-sonnet-4-20250514',
              providerOptions: {
                anthropic: {
                  temperature: 0.8,
                  maxTokens: 2048,
                },
              },
            },
          },
          conversationHistoryConfig: {
            mode: 'full',
            limit: 10,
          },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        })
      );

      const config = await createTaskHandlerConfig({
        dbClient: {} as any,
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        subAgentId: 'test-agent',
        baseUrl: 'https://test.com',
      });

      expect(config.agentSchema.models).toEqual({
        base: {
          model: 'anthropic/claude-sonnet-4-20250514',
          providerOptions: {
            anthropic: {
              temperature: 0.8,
              maxTokens: 2048,
            },
          },
        },
        structuredOutput: {
          model: 'anthropic/claude-sonnet-4-20250514',
          providerOptions: {
            anthropic: {
              temperature: 0.8,
              maxTokens: 2048,
            },
          },
        },
        summarizer: {
          model: 'anthropic/claude-sonnet-4-20250514',
          providerOptions: {
            anthropic: {
              temperature: 0.8,
              maxTokens: 2048,
            },
          },
        },
      });
    });

    it('should handle undefined models from agent data', async () => {
      // Mock the getAgentById to return agent with undefined models
      getAgentByIdMock.mockReturnValueOnce(
        vi.fn().mockResolvedValue({
          id: 'test-agent',
          name: 'Test Agent',
          description: 'Test agent description',
          prompt: 'You are a helpful test agent',
          models: null,
          conversationHistoryConfig: {
            mode: 'full',
            limit: 10,
          },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        })
      );

      const config = await createTaskHandlerConfig({
        dbClient: {} as any,
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        subAgentId: 'test-agent',
        baseUrl: 'https://test.com',
      });

      expect(config.agentSchema.models).toEqual({
        base: {
          model: 'openai/gpt-4',
        },
        structuredOutput: {
          model: 'openai/gpt-4',
        },
        summarizer: {
          model: 'openai/gpt-3.5-turbo',
        },
      });
    });

    it('should handle different model providers in models', async () => {
      // Mock the getAgentById to return agent with OpenAI models
      getAgentByIdMock.mockReturnValueOnce(
        vi.fn().mockResolvedValue({
          id: 'test-agent',
          name: 'Test Agent',
          description: 'Test agent description',
          prompt: 'You are a helpful test agent',
          models: {
            base: {
              model: 'openai/gpt-4o',
              providerOptions: {
                openai: {
                  temperature: 0.3,
                  frequencyPenalty: 0.1,
                  presencePenalty: 0.2,
                },
              },
            },
          },
          conversationHistoryConfig: {
            mode: 'full',
            limit: 10,
          },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        })
      );

      const config = await createTaskHandlerConfig({
        dbClient: {} as any,
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        subAgentId: 'test-agent',
        baseUrl: 'https://test.com',
      });

      expect(config.agentSchema.models).toEqual({
        base: {
          model: 'openai/gpt-4o',
          providerOptions: {
            openai: {
              temperature: 0.3,
              frequencyPenalty: 0.1,
              presencePenalty: 0.2,
            },
          },
        },
        structuredOutput: {
          model: 'openai/gpt-4o',
          providerOptions: {
            openai: {
              temperature: 0.3,
              frequencyPenalty: 0.1,
              presencePenalty: 0.2,
            },
          },
        },
        summarizer: {
          model: 'openai/gpt-4o',
          providerOptions: {
            openai: {
              temperature: 0.3,
              frequencyPenalty: 0.1,
              presencePenalty: 0.2,
            },
          },
        },
      });
    });
  });

  describe('Config Serialization', () => {
    it('should serialize and deserialize config correctly', () => {
      const serialized = serializeTaskHandlerConfig(mockConfig);
      expect(serialized).toBeTruthy();
      expect(typeof serialized).toBe('string');

      const deserialized = deserializeTaskHandlerConfig(serialized);
      expect(deserialized).toEqual(mockConfig);
    });
  });
});
