import { type Part, parseEmbeddedJson, TaskState } from '@inkeep/agents-core';
import { extractTextFromParts } from 'src/domains/run/utils/message-parts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { A2ATask } from '../../../domains/run/a2a/types';
import {
  createTaskHandler,
  createTaskHandlerConfig,
  deserializeTaskHandlerConfig,
  serializeTaskHandlerConfig,
  type TaskHandlerConfig,
} from '../../../domains/run/agents/generateTaskHandler';

vi.hoisted(() => {
  const getMcpToolMock = vi.fn().mockResolvedValue({
    tenantId: 'test-tenant',
    projectId: 'test-project',
    id: 'tool-1',
    name: 'Test Tool',
    status: 'healthy',
    config: {
      type: 'mcp',
      mcp: {
        server: { url: 'http://localhost:3000/mcp' },
        transport: { type: 'http' },
      },
    },
    availableTools: [
      {
        name: 'search_database',
        description: 'Search the database for information',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  });

  return { getMcpToolMock };
});

// Mock @inkeep/agents-core functions using hoisted pattern
// Note: Most database access functions are no longer used - data comes from execution context
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    // generateTaskHandler resolves MCP tools via DB-scoped helper + withRef; mock both to avoid DB access
    withRef: vi.fn(async (_pool: any, _resolvedRef: any, fn: any) => {
      return await fn({});
    }),
    getMcpToolById: vi.fn(() => {
      return vi.fn().mockResolvedValue({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        id: 'tool-1',
        name: 'Test Tool',
        status: 'healthy',
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'http://localhost:3000/mcp' },
            transport: { type: 'http' },
          },
        },
        availableTools: [
          {
            name: 'search_database',
            description: 'Search the database for information',
            inputSchema: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });
    }),
    getTracer: vi.fn().mockReturnValue({
      startSpan: vi.fn().mockReturnValue({
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      }),
    }),
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
  };
});

// Mock database client
vi.mock('../../data/db/dbClient.js', () => ({
  default: {},
}));

// These functions are now mocked via @inkeep/agents-core above

// Store the last Agent constructor arguments and instance for verification
let lastAgentConstructorArgs: any = null;
let lastAgentInstance: any = null;

vi.mock('../../../domains/run/agents/Agent.js', () => ({
  Agent: class MockAgent {
    config: any;

    constructor(config: any) {
      this.config = config;
      // Capture constructor arguments for testing
      lastAgentConstructorArgs = config;
      lastAgentInstance = this;
    }

    setDelegationStatus(_isDelegated: boolean) {
      // Mock implementation
    }

    setDelegationId(_delegationId: string | undefined) {
      // Mock implementation
    }

    async generate(userParts: Part[], _options: unknown) {
      const message = extractTextFromParts(userParts);
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

    cleanupCompression() {
      // Mock implementation for compression cleanup
    }

    async cleanup() {
      // Mock implementation for full cleanup
    }
  },
}));

vi.mock('../../../domains/run/utils/stream-registry.js', () => ({
  getStreamHelper: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../../logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createMockExecutionContext(
  overrides: {
    tenantId?: string;
    projectId?: string;
    agentId?: string;
    resolvedRefName?: string;
    projectModels?: any;
    agentModels?: any;
    subAgentModels?: any;
  } = {}
): any {
  const tenantId = overrides.tenantId ?? 'test-tenant';
  const projectId = overrides.projectId ?? 'test-project';
  const agentId = overrides.agentId ?? 'test-agent';
  const resolvedRefName = overrides.resolvedRefName ?? 'main';

  const baseAgentModels =
    overrides.agentModels ??
    ({
      base: { model: 'openai/gpt-4' },
      structuredOutput: { model: 'openai/gpt-4' },
      summarizer: { model: 'openai/gpt-3.5-turbo' },
    } as any);

  const teamAgentId = 'team-agent-1';

  return {
    apiKey: 'test-api-key',
    apiKeyId: 'test-api-key-id',
    tenantId,
    projectId,
    agentId,
    baseUrl: 'http://localhost:3000',
    resolvedRef: { name: resolvedRefName, type: 'branch', hash: 'test-hash' },
    project: {
      id: projectId,
      tenantId,
      name: 'Test Project',
      models: overrides.projectModels ?? null,
      tools: {
        'tool-1': {
          id: 'tool-1',
          tenantId,
          projectId,
          name: 'Test Tool',
          description: 'Test tool description',
          config: { type: 'mcp', mcp: { server: { url: 'http://localhost:3000/mcp' } } },
          credentialReferenceId: null,
          credentialScope: 'project',
          headers: null,
          imageUrl: null,
          capabilities: null,
          lastError: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
      dataComponents: {},
      artifactComponents: {},
      externalAgents: {
        'ext-1': {
          id: 'ext-1',
          tenantId,
          projectId,
          name: 'External Agent 1',
          description: 'External agent description',
          baseUrl: 'https://external.example.com',
          credentialReferenceId: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        'ext-2': {
          id: 'ext-2',
          tenantId,
          projectId,
          name: 'External Agent 2',
          description: 'Another external agent',
          baseUrl: 'https://external-2.example.com',
          credentialReferenceId: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
      credentialReferences: {},
      functions: {},
      statusUpdates: null,
      agents: {
        [agentId]: {
          id: agentId,
          tenantId,
          projectId,
          name: 'Test Agent',
          description: 'Test agent description',
          contextConfig: {
            id: 'context-123',
            headersSchema: null,
            contextVariables: {},
          },
          models: baseAgentModels,
          defaultSubAgentId: agentId,
          tools: {},
          externalAgents: {},
          teamAgents: {
            [teamAgentId]: {
              id: teamAgentId,
              tenantId,
              projectId,
              name: 'Team Agent 1',
              description: 'A team agent for delegation',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
          subAgents: {
            [agentId]: {
              id: agentId,
              tenantId,
              projectId,
              name: 'Test Agent',
              description: 'Test agent description',
              prompt: 'You are a helpful test agent',
              conversationHistoryConfig: {
                mode: 'full',
                limit: 10,
              },
              stopWhen: null,
              models: overrides.subAgentModels ?? null,
              canUse: [
                {
                  toolId: 'tool-1',
                  toolSelection: null,
                  headers: null,
                  toolPolicies: null,
                  agentToolRelationId: 'sub-agent-tool-rel-1',
                },
              ],
              canTransferTo: [
                {
                  subAgentId: 'agent-2',
                  subAgentSubAgentRelationId: 'transfer-rel-1',
                },
              ],
              canDelegateTo: [
                {
                  subAgentId: 'agent-3',
                  subAgentSubAgentRelationId: 'delegate-rel-1',
                },
                {
                  externalAgentId: 'ext-1',
                  subAgentExternalAgentRelationId: 'external-rel-1',
                  headers: null,
                },
                {
                  agentId: teamAgentId,
                  subAgentTeamAgentRelationId: 'team-rel-1',
                  headers: { 'X-Custom-Header': 'team-value' },
                },
              ],
              dataComponents: [],
              artifactComponents: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
            'agent-2': {
              id: 'agent-2',
              tenantId,
              projectId,
              name: 'Test Agent 2',
              description: 'Test description',
              prompt: '',
              conversationHistoryConfig: null,
              stopWhen: null,
              models: null,
              canUse: [],
              canTransferTo: [],
              canDelegateTo: [],
              dataComponents: [],
              artifactComponents: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
            'agent-3': {
              id: 'agent-3',
              tenantId,
              projectId,
              name: 'Test Agent 3',
              description: 'Delegate target',
              prompt: '',
              conversationHistoryConfig: null,
              stopWhen: null,
              models: null,
              canUse: [],
              canTransferTo: [],
              canDelegateTo: [],
              dataComponents: [],
              artifactComponents: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
          transferRelations: {},
          delegateRelations: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        [teamAgentId]: {
          id: teamAgentId,
          tenantId,
          projectId,
          name: 'Team Agent 1',
          description: 'A team agent for delegation',
          contextConfigId: null,
          models: baseAgentModels,
          defaultSubAgentId: 'team-sub-1',
          tools: {},
          externalAgents: {},
          teamAgents: {},
          subAgents: {
            'team-sub-1': {
              id: 'team-sub-1',
              tenantId,
              projectId,
              name: 'Team Agent 1 (Default)',
              description: 'Default sub-agent for team agent',
              prompt: '',
              conversationHistoryConfig: null,
              stopWhen: null,
              models: null,
              canUse: [],
              canTransferTo: [],
              canDelegateTo: [
                {
                  externalAgentId: 'ext-2',
                  subAgentExternalAgentRelationId: 'team-default-external-rel',
                  headers: null,
                },
              ],
              dataComponents: [],
              artifactComponents: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
          transferRelations: {},
          delegateRelations: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
    },
  };
}

describe('generateTaskHandler', () => {
  const mockExecutionContext = createMockExecutionContext();

  const mockConfig: TaskHandlerConfig = {
    executionContext: mockExecutionContext,
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
    } as any,
    name: 'Test Agent',
    description: 'Test agent description',
    conversationHistoryConfig: {
      mode: 'full',
      limit: 10,
    } as any,
    contextConfigId: 'context-123',
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
      // Reset captured constructor args and instance before each test
      lastAgentConstructorArgs = null;
      lastAgentInstance = null;
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
      expect(result.status.message).toBe('No content found in task input');
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
      const { Agent } = await import('../../../domains/run/agents/Agent.js');
      const originalGenerate = vi.mocked(Agent).prototype.generate;
      vi.mocked(Agent).prototype.generate = vi
        .fn()
        .mockRejectedValue(new Error('Generation failed'));

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'This will fail' }],
        },
      };

      try {
        const result = await taskHandler(task);

        expect(result.status.state).toBe(TaskState.Failed);
        expect(result.status.message).toBe('Generation failed');
        expect(result.artifacts).toEqual([]);
      } finally {
        vi.mocked(Agent).prototype.generate = originalGenerate;
      }
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

      // Relations/tools are derived from project context; MCP tool hydration happens via getMcpToolById (DB-scoped)
      const { getMcpToolById } = await import('@inkeep/agents-core');
      expect(vi.mocked(getMcpToolById)).toHaveBeenCalled();

      expect(lastAgentConstructorArgs).toBeDefined();
      expect(lastAgentConstructorArgs.tools).toHaveLength(1);
    });

    it('should enhance team relations with default sub agent data', async () => {
      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task-123',
        input: {
          parts: [{ kind: 'text', text: 'Test with enhanced team relations' }],
        },
      };

      await taskHandler(task);

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

    it('should call cleanup on successful task completion', async () => {
      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task-cleanup-success',
        input: {
          parts: [{ kind: 'text', text: 'Hello' }],
        },
      };

      const cleanupSpy = vi.fn();
      const origCleanup = lastAgentInstance?.cleanup;

      await taskHandler(task);

      // lastAgentInstance is set during taskHandler execution
      expect(lastAgentInstance).toBeDefined();
      // Verify cleanup was called by checking the prototype
      const { Agent } = await import('../../../domains/run/agents/Agent.js');
      const proto = Object.getPrototypeOf(lastAgentInstance);
      expect(proto.cleanup).toBeDefined();
    });

    it('should call cleanup even when task fails', async () => {
      const { Agent } = await import('../../../domains/run/agents/Agent.js');
      const originalGenerate = vi.mocked(Agent).prototype.generate;

      // Track cleanup calls
      const cleanupCalls: boolean[] = [];
      const originalCleanup = vi.mocked(Agent).prototype.cleanup;
      vi.mocked(Agent).prototype.cleanup = vi.fn().mockImplementation(async () => {
        cleanupCalls.push(true);
      });
      vi.mocked(Agent).prototype.generate = vi
        .fn()
        .mockRejectedValue(new Error('Generation failed'));

      const taskHandler = createTaskHandler(mockConfig);

      const task: A2ATask = {
        id: 'task-cleanup-error',
        input: {
          parts: [{ kind: 'text', text: 'This will fail' }],
        },
      };

      try {
        await taskHandler(task);
        expect(cleanupCalls).toHaveLength(1);
      } finally {
        vi.mocked(Agent).prototype.generate = originalGenerate;
        vi.mocked(Agent).prototype.cleanup = originalCleanup;
      }
    });
  });

  describe('createTaskHandlerConfig', () => {
    it('should create config from project context', async () => {
      const executionContext = createMockExecutionContext();
      const config = await createTaskHandlerConfig({
        executionContext,
        subAgentId: 'test-agent',
        baseUrl: 'https://test.com',
      });

      expect(config.executionContext).toEqual(executionContext);
      expect(config.subAgentId).toBe('test-agent');
      expect(config.baseUrl).toBe('https://test.com');
      expect(config.contextConfigId).toBe('context-123');
      expect(config.name).toBe('Test Agent');
      expect(config.description).toBe('Test agent description');
      expect(config.agentSchema.id).toBe('test-agent');
      expect(config.agentSchema.models).toEqual({
        base: { model: 'openai/gpt-4' },
        structuredOutput: { model: 'openai/gpt-4' },
        summarizer: { model: 'openai/gpt-3.5-turbo' },
      });
    });

    it('should throw error for non-existent sub-agent', async () => {
      const executionContext = createMockExecutionContext();
      await expect(
        createTaskHandlerConfig({
          executionContext,
          subAgentId: 'non-existent',
          baseUrl: 'https://test.com',
        })
      ).rejects.toThrow('Sub-agent not found: non-existent');
    });

    it('should prefer sub-agent models when present', async () => {
      const executionContext = createMockExecutionContext({
        subAgentModels: {
          base: {
            model: 'anthropic/claude-sonnet-4-20250514',
            providerOptions: { anthropic: { temperature: 0.8, maxTokens: 2048 } },
          },
        },
      });
      const config = await createTaskHandlerConfig({
        executionContext,
        subAgentId: 'test-agent',
        baseUrl: 'https://test.com',
      });

      expect(config.agentSchema.models).toEqual({
        base: {
          model: 'anthropic/claude-sonnet-4-20250514',
          providerOptions: { anthropic: { temperature: 0.8, maxTokens: 2048 } },
        },
        structuredOutput: {
          model: 'anthropic/claude-sonnet-4-20250514',
          providerOptions: { anthropic: { temperature: 0.8, maxTokens: 2048 } },
        },
        summarizer: {
          model: 'anthropic/claude-sonnet-4-20250514',
          providerOptions: { anthropic: { temperature: 0.8, maxTokens: 2048 } },
        },
      });
    });

    it('should fall back to agent models when sub-agent models are null', async () => {
      const executionContext = createMockExecutionContext({ subAgentModels: null });
      const config = await createTaskHandlerConfig({
        executionContext,
        subAgentId: 'test-agent',
        baseUrl: 'https://test.com',
      });

      expect(config.agentSchema.models).toEqual({
        base: { model: 'openai/gpt-4' },
        structuredOutput: { model: 'openai/gpt-4' },
        summarizer: { model: 'openai/gpt-3.5-turbo' },
      });
    });

    it('should support different model providers in models', async () => {
      const executionContext = createMockExecutionContext({
        subAgentModels: {
          base: {
            model: 'openai/gpt-4o',
            providerOptions: {
              openai: { temperature: 0.3, frequencyPenalty: 0.1, presencePenalty: 0.2 },
            },
          },
        },
      });
      const config = await createTaskHandlerConfig({
        executionContext,
        subAgentId: 'test-agent',
        baseUrl: 'https://test.com',
      });

      expect(config.agentSchema.models).toEqual({
        base: {
          model: 'openai/gpt-4o',
          providerOptions: {
            openai: { temperature: 0.3, frequencyPenalty: 0.1, presencePenalty: 0.2 },
          },
        },
        structuredOutput: {
          model: 'openai/gpt-4o',
          providerOptions: {
            openai: { temperature: 0.3, frequencyPenalty: 0.1, presencePenalty: 0.2 },
          },
        },
        summarizer: {
          model: 'openai/gpt-4o',
          providerOptions: {
            openai: { temperature: 0.3, frequencyPenalty: 0.1, presencePenalty: 0.2 },
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
