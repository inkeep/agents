import {
  type DataComponentSelect,
  MCPServerType,
  MCPTransportType,
  type McpTool,
  type MessageType,
} from '@inkeep/agents-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Agent, type AgentConfig } from '../../../domains/run/agents/Agent';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

// Mock the AI SDK functions
vi.mock('ai', () => ({
  generateText: vi.fn().mockImplementation(async (options: any) => {
    // When Output.object is present in options, return "output" with the correct shape
    if (options?.output && typeof options.output === 'object') {
      // Try to determine the expected output structure from the schema
      const schema = options.output.schema;
      let outputData: any = {};

      // Check if schema expects dataComponents
      if (schema?._def?.shape?.dataComponents) {
        outputData = {
          dataComponents: [
            {
              id: 'test-component',
              name: 'TestComponent',
              props: { message: 'Hello, World!' },
            },
          ],
        };
      } else if (schema?._def?.shape?.statusComponents) {
        outputData = {
          statusComponents: [
            {
              id: 'status-1',
              type: 'text',
              props: { text: 'Status update generated' },
            },
          ],
        };
      }

      return {
        text: 'Mocked response',
        toolCalls: [],
        finishReason: 'stop',
        output: outputData,
        steps: [
          {
            content: [
              {
                type: 'text',
                text: 'Mocked response',
              },
            ],
            toolCalls: [
              {
                toolName: 'thinking_complete',
                args: {},
              },
            ],
            toolResults: [
              {
                toolCallId: 'call_1',
                result: 'Thinking complete',
              },
            ],
          },
        ],
      };
    }
    // Otherwise, return just text as fallback
    return {
      text: 'Mocked response',
      toolCalls: [],
      finishReason: 'stop',
      steps: [
        {
          content: [
            {
              type: 'text',
              text: 'Mocked response',
            },
          ],
          toolCalls: [
            {
              toolName: 'thinking_complete',
              args: {},
            },
          ],
          toolResults: [
            {
              toolCallId: 'call_1',
              result: 'Thinking complete',
            },
          ],
        },
      ],
    };
  }),
  streamText: vi.fn().mockReturnValue({
    textStream: (async function* () {
      yield 'Mocked';
      yield ' response';
    })(),
    fullStream: (async function* () {
      yield { type: 'text-delta', textDelta: 'Mocked response' };
    })(),
  }),
  Output: {
    object: vi.fn().mockImplementation((config: any) => ({
      type: 'object',
      ...config,
    })),
  },
  tool: vi.fn().mockImplementation((config) => config),
}));

// Mock the MCP client (now in @inkeep/agents-core)
let mockMcpTools: any = {};

// Mock @inkeep/agents-core functions using hoisted pattern
const {
  getCredentialReferenceMock,
  getContextConfigByIdMock,
  getLedgerArtifactsMock,
  listTaskIdsByContextIdMock,
  getFullAgentDefinitionMock,
  agentHasArtifactComponentsMock,
  getToolsForAgentMock,
} = vi.hoisted(() => {
  const getCredentialReferenceMock = vi.fn(() => vi.fn().mockResolvedValue(null));
  const getContextConfigByIdMock = vi.fn(() => vi.fn().mockResolvedValue(null));
  const getLedgerArtifactsMock = vi.fn(() => vi.fn().mockResolvedValue([]));
  const listTaskIdsByContextIdMock = vi.fn(() => vi.fn().mockResolvedValue([]));
  const getFullAgentDefinitionMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'test-agent',
      agents: [],
      transferRelations: [],
      delegateRelations: [],
    })
  );
  const agentHasArtifactComponentsMock = vi.fn(() => vi.fn().mockResolvedValue(false));
  const getToolsForAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
  );

  return {
    getCredentialReferenceMock,
    getContextConfigByIdMock,
    getLedgerArtifactsMock,
    listTaskIdsByContextIdMock,
    getFullAgentDefinitionMock,
    agentHasArtifactComponentsMock,
    getToolsForAgentMock,
  };
});

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  const mockModel = 'mocked-language-model';
  const mockGenerationParams = { temperature: 0.7, maxTokens: 4096 };
  const mockGenerationConfig = { model: mockModel, ...mockGenerationParams };

  return {
    ...actual,
    getCredentialReference: getCredentialReferenceMock,
    getContextConfigById: getContextConfigByIdMock,
    getLedgerArtifacts: getLedgerArtifactsMock,
    listTaskIdsByContextId: listTaskIdsByContextIdMock,
    getFullAgentDefinition: getFullAgentDefinitionMock,
    agentHasArtifactComponents: agentHasArtifactComponentsMock,
    getToolsForAgent: getToolsForAgentMock,
    createDatabaseClient: vi.fn().mockReturnValue({}),
    contextValidationMiddleware: vi.fn().mockReturnValue(async (c: any, next: any) => {
      c.set('validatedContext', {
        agentId: 'test-agent',
        tenantId: 'test-tenant',
        projectId: 'default',
      });
      await next();
    }),
    // Mock the MCP client that moved to @inkeep/agents-core
    McpClient: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      tools: vi.fn().mockImplementation(() => Promise.resolve(mockMcpTools)),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
    CredentialStuffer: vi.fn().mockImplementation(function CredentialStuffer() {
      return {
        stuff: vi.fn().mockResolvedValue({}),
      };
    }),
    ModelFactory: {
      createModel: vi.fn().mockReturnValue(mockModel),
      getGenerationParams: vi.fn().mockReturnValue(mockGenerationParams),
      prepareGenerationConfig: vi.fn().mockReturnValue(mockGenerationConfig),
      validateConfig: vi.fn().mockReturnValue([]),
    },
  };
});

// Mock anthropic
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue('mocked-model'),
}));

// Mock conversations module
vi.mock('../../../domains/run/data/conversations', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getConversationHistoryWithCompression: vi
      .fn()
      .mockResolvedValue('Mock conversation history as string'),
  };
});

// Mock ToolSessionManager
vi.mock('../../../domains/run/agents/ToolSessionManager', () => ({
  toolSessionManager: {
    createSession: vi.fn().mockReturnValue('test-session-id'),
    endSession: vi.fn(),
    recordToolResult: vi.fn(),
    getToolResult: vi.fn().mockReturnValue({
      toolName: 'thinking_complete',
      result: 'Thinking complete',
      args: {},
    }),
    getSession: vi.fn().mockReturnValue({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      contextId: 'test-context',
      taskId: 'test-task-id',
    }),
  },
}));

// Mock AgentSessionManager
vi.mock('../../../domains/run/services/AgentSession.js', () => ({
  agentSessionManager: {
    recordEvent: vi.fn(),
  },
}));

// Mock ResponseFormatter
vi.mock('../../../domains/run/services/ResponseFormatter.js', () => ({
  ResponseFormatter: vi.fn().mockImplementation(() => ({
    formatObjectResponse: vi.fn().mockResolvedValue({
      parts: [
        {
          kind: 'data',
          data: {
            id: 'test-component',
            name: 'TestComponent',
            props: { message: 'Test message' },
          },
        },
      ],
    }),
    formatResponse: vi.fn().mockResolvedValue({
      parts: [
        {
          kind: 'text',
          text: 'Formatted response text',
        },
      ],
    }),
  })),
}));

// Mock OpenTelemetry
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracerProvider: vi.fn().mockReturnValue({
      getTracer: vi.fn().mockReturnValue({
        startActiveSpan: vi.fn().mockImplementation((_name, fn) => {
          const mockSpan = {
            setAttributes: vi.fn(),
            addEvent: vi.fn(),
            recordException: vi.fn(),
            setStatus: vi.fn(),
            end: vi.fn(),
          };
          return fn(mockSpan);
        }),
      }),
    }),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
    UNSET: 0,
  },
  context: {
    active: vi.fn().mockReturnValue({}),
    with: vi.fn((_ctx, fn) => fn()),
  },
  propagation: {
    getBaggage: vi.fn().mockReturnValue(null),
    setBaggage: vi.fn().mockReturnValue({}),
    createBaggage: vi.fn().mockReturnValue({
      setEntry: vi.fn().mockReturnThis(),
    }),
  },
}));

// Mock the logger
vi.mock('../../../logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock the SystemPromptBuilder
vi.mock('../../../domains/run/agents/SystemPromptBuilder.js', () => ({
  SystemPromptBuilder: vi.fn().mockImplementation(() => ({
    buildSystemPrompt: vi.fn().mockResolvedValue({
      prompt: '<system_message>Mock system prompt with tools</system_message>',
      breakdown: {
        systemPromptTemplate: 0,
        coreInstructions: 0,
        agentPrompt: 0,
        toolsSection: 0,
        artifactsSection: 0,
        dataComponents: 0,
        artifactComponents: 0,
        transferInstructions: 0,
        delegationInstructions: 0,
        thinkingPreparation: 0,
        conversationHistory: 0,
        total: 0,
      },
    }),
  })),
}));

vi.mock('../../../domains/run/data/conversations.js', () => ({
  createDefaultConversationHistoryConfig: vi.fn().mockReturnValue({
    mode: 'full',
    limit: 50,
    includeInternal: true,
    messageTypes: ['chat'],
    maxOutputTokens: 4000,
  }),
  getFormattedConversationHistory: vi.fn().mockResolvedValue('Mock conversation history'),
  getConversationScopedArtifacts: vi.fn().mockResolvedValue([]),
  getConversationHistoryWithCompression: vi
    .fn()
    .mockResolvedValue('Mock conversation history as string'),
}));

// Import the mocked module - these will automatically be mocked
import {
  getConversationHistoryWithCompression,
  getFormattedConversationHistory,
} from '../../../domains/run/data/conversations';

function createMockExecutionContext(
  overrides: {
    tenantId?: string;
    projectId?: string;
    agentId?: string;
    additionalAgents?: Record<string, any>;
    credentialReferences?: Record<string, any>;
  } = {}
) {
  const tenantId = overrides.tenantId ?? 'test-tenant';
  const projectId = overrides.projectId ?? 'test-project';
  const agentId = overrides.agentId ?? 'test-agent';

  const defaultAgents: Record<string, any> = {
    [agentId]: {
      id: agentId,
      name: 'Test Agent',
      description: 'A test agent',
      subAgents: {
        [agentId]: {
          id: agentId,
          name: 'Test Agent',
          canUse: [],
        },
      },
    },
  };

  return {
    apiKey: 'test-api-key',
    tenantId,
    projectId,
    agentId,
    baseUrl: 'http://localhost:3000',
    apiKeyId: 'test-api-key-id',
    resolvedRef: { name: 'main', type: 'branch' },
    project: {
      id: projectId,
      tenantId,
      name: 'Test Project',
      agents: { ...defaultAgents, ...overrides.additionalAgents },
      tools: {},
      functions: {},
      dataComponents: {},
      artifactComponents: {},
      externalAgents: {},
      credentialReferences: overrides.credentialReferences ?? {},
    },
  };
}

describe('Agent Integration with SystemPromptBuilder', () => {
  let mockAgentConfig: AgentConfig;
  let mockTool: McpTool;
  let mockExecutionContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock MCP tools
    mockMcpTools = {
      search_database: {
        description: 'Search the database for information',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['query'],
        },
        execute: vi.fn().mockResolvedValue('mock result'),
      },
    };

    mockTool = {
      id: 'test-tool-id',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      name: 'Test Tool',
      config: {
        type: 'mcp',
        mcp: {
          server: {
            url: 'http://localhost:3000/mcp',
          },
        },
      },
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
        logging: false,
      },
      status: 'healthy',
      availableTools: [
        {
          name: 'search_database',
          description: 'Search the database for information',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
              },
            },
            required: ['query'],
          },
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockAgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent',
      projectId: 'test-project',
      baseUrl: 'http://localhost:3000',
      name: 'Test Agent',
      description: 'A test agent for integration testing',
      prompt: `You are a helpful test agent that can search databases and assist users.`,
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      tools: [mockTool],
      dataComponents: [],
      models: {
        base: {
          model: 'anthropic/claude-sonnet-4-5',
        },
        summarizer: {
          model: 'openai/gpt-4.1-mini',
        },
      },
    };

    mockExecutionContext = createMockExecutionContext();
  });

  test('should create Agent and use SystemPromptBuilder to generate XML system prompt', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const systemPromptBuilder = (agent as any).systemPromptBuilder;

    expect(systemPromptBuilder).toBeDefined();
    expect(systemPromptBuilder.buildSystemPrompt).toBeDefined();

    // Call buildSystemPrompt to ensure it works
    const buildSystemPrompt = (agent as any).buildSystemPrompt.bind(agent);
    const result = await buildSystemPrompt();

    expect(result.prompt).toContain('Mock system prompt with tools');
    expect(systemPromptBuilder.buildSystemPrompt).toHaveBeenCalledWith({
      corePrompt: `You are a helpful test agent that can search databases and assist users.`,
      prompt: undefined,
      tools: [
        {
          name: 'search_database',
          description: 'Search the database for information',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
              },
            },
            required: ['query'],
          },
          usageGuidelines: 'Use this tool when appropriate for the task at hand.',
        },
      ],
      dataComponents: [],
      artifacts: [],
      artifactComponents: [],
      hasAgentArtifactComponents: false,
      includeDataComponents: false,
      clientCurrentTime: undefined,
      hasTransferRelations: false,
      hasDelegateRelations: false,
    });
  });

  test('should handle Agent with no tools', async () => {
    const configWithNoTools = { ...mockAgentConfig, tools: [] };
    const agent = new Agent(configWithNoTools, mockExecutionContext);
    const buildSystemPrompt = (agent as any).buildSystemPrompt.bind(agent);

    const result = await buildSystemPrompt();

    expect(result).toBeDefined();
    const systemPromptBuilder = (agent as any).systemPromptBuilder;
    expect(systemPromptBuilder.buildSystemPrompt).toHaveBeenCalledWith({
      corePrompt: `You are a helpful test agent that can search databases and assist users.`,
      prompt: undefined,
      tools: [],
      dataComponents: [],
      artifacts: [],
      artifactComponents: [],
      hasAgentArtifactComponents: false,
      includeDataComponents: false,
      clientCurrentTime: undefined,
      hasTransferRelations: false,
      hasDelegateRelations: false,
    });
  });

  test('should handle Agent with undefined tools', async () => {
    const configWithUndefinedTools = { ...mockAgentConfig, tools: undefined };
    const agent = new Agent(configWithUndefinedTools, mockExecutionContext);
    const buildSystemPrompt = (agent as any).buildSystemPrompt.bind(agent);

    const result = await buildSystemPrompt();

    expect(result).toBeDefined();
    const systemPromptBuilder = (agent as any).systemPromptBuilder;
    expect(systemPromptBuilder.buildSystemPrompt).toHaveBeenCalledWith({
      corePrompt: `You are a helpful test agent that can search databases and assist users.`,
      prompt: undefined,
      tools: [],
      dataComponents: [],
      artifacts: [],
      artifactComponents: [],
      hasAgentArtifactComponents: false,
      includeDataComponents: false,
      clientCurrentTime: undefined,
      hasTransferRelations: false,
      hasDelegateRelations: false,
    });
  });

  test('should handle tools without availableTools', async () => {
    // Clear mock MCP tools for this test
    mockMcpTools = {};

    const configWithEmptyAvailableTools = {
      ...mockAgentConfig,
      tools: [
        {
          ...mockAgentConfig.tools?.[0],
          availableTools: undefined,
        } as McpTool,
      ],
    };
    const agent = new Agent(configWithEmptyAvailableTools, mockExecutionContext);
    const buildSystemPrompt = (agent as any).buildSystemPrompt.bind(agent);

    const result = await buildSystemPrompt();

    expect(result).toBeDefined();
    const systemPromptBuilder = (agent as any).systemPromptBuilder;
    expect(systemPromptBuilder.buildSystemPrompt).toHaveBeenCalledWith({
      corePrompt: `You are a helpful test agent that can search databases and assist users.`,
      prompt: undefined,
      tools: [], // Empty tools array since availableTools is undefined
      dataComponents: [],
      artifacts: [],
      artifactComponents: [],
      hasAgentArtifactComponents: false,
      includeDataComponents: false,
      clientCurrentTime: undefined,
      hasTransferRelations: false,
      hasDelegateRelations: false,
    });
  });

  test('should use v1 version of SystemPromptBuilder by default', () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const systemPromptBuilder = (agent as any).systemPromptBuilder;

    // Verify the SystemPromptBuilder was instantiated with 'v1' and PromptConfig
    expect(systemPromptBuilder).toBeDefined();
    // The constructor should have been called with 'v1' and a PromptConfig instance
    // This is tested implicitly by the fact that the agent creates successfully
  });
});

describe('PromptConfig Tool Conversion', () => {
  test('should convert McpTool availableTools to ToolData format correctly', () => {
    const mockTools: McpTool[] = [
      {
        id: 'tool1',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        name: 'Test Server',
        description: 'A test server',
        status: 'healthy',
        config: {
          type: 'mcp',
          mcp: { server: { url: 'http://example.com' } },
        },
        capabilities: {
          tools: true,
          resources: false,
          prompts: false,
          logging: false,
        },
        availableTools: [
          {
            name: 'search',
            description: 'Search for information',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
              },
              required: ['query'],
            },
          },
          {
            name: 'analyze',
            description: 'Analyze data',
            inputSchema: {
              type: 'object',
              properties: {
                data: { type: 'string', description: 'Data to analyze' },
              },
              required: ['data'],
            },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as McpTool,
    ];

    const result = PromptConfig.convertMcpToolsToToolData(mockTools);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'search',
      description: 'Search for information',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
      usageGuidelines: 'Use this tool from Test Server server when appropriate.',
    });
    expect(result[1]).toEqual({
      name: 'analyze',
      description: 'Analyze data',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data to analyze' },
        },
        required: ['data'],
      },
      usageGuidelines: 'Use this tool from Test Server server when appropriate.',
    });
  });

  test('should handle empty or undefined McpTool arrays', () => {
    expect(PromptConfig.convertMcpToolsToToolData([])).toEqual([]);
    expect(PromptConfig.convertMcpToolsToToolData(undefined)).toEqual([]);
  });

  test('should handle McpTools without availableTools', () => {
    const mockTools: McpTool[] = [
      {
        id: 'tool1',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        name: 'Test Server',
        description: 'A test server',
        status: 'healthy',
        config: {
          type: 'mcp',
          mcp: { server: { url: 'http://example.com' } },
        },
        capabilities: {
          tools: true,
          resources: false,
          prompts: false,
          logging: false,
        },
        availableTools: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as McpTool,
    ];

    const result = PromptConfig.convertMcpToolsToToolData(mockTools);
    expect(result).toEqual([]);
  });
});

describe('Agent conversationHistoryConfig Functionality', () => {
  let mockAgentConfig: AgentConfig;
  let mockRuntimeContext: any;
  let mockExecutionContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Configure the already-mocked function
    vi.mocked(getFormattedConversationHistory).mockResolvedValue('Mock conversation history');

    mockAgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent',
      projectId: 'test-project',
      baseUrl: 'http://localhost:3000',
      name: 'Test Agent',
      description: 'A test agent for conversation history testing',
      prompt: `You are a helpful test agent.`,
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      tools: [],
      dataComponents: [],
      models: {
        base: {
          model: 'anthropic/claude-sonnet-4-20250514',
        },
      },
    };

    mockExecutionContext = createMockExecutionContext();

    mockRuntimeContext = {
      contextId: 'test-conversation-id',
      metadata: {
        conversationId: 'test-conversation-id',
        threadId: 'test-thread-id',
        taskId: 'test-task-id',
      },
    };
  });

  test('should apply default conversationHistoryConfig when none provided', () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const config = (agent as any).config;

    expect(config.conversationHistoryConfig).toBeDefined();
    expect(config.conversationHistoryConfig.mode).toBe('full');
    expect(config.conversationHistoryConfig.limit).toBe(50);
    expect(config.conversationHistoryConfig.includeInternal).toBe(true);
    expect(config.conversationHistoryConfig.messageTypes).toEqual(['chat']);
    expect(config.conversationHistoryConfig.maxOutputTokens).toBe(4000);
  });

  test('should use provided conversationHistoryConfig', () => {
    const customConfig = {
      mode: 'scoped' as const,
      limit: 25,
      includeInternal: false,
      messageTypes: ['chat', 'a2a-request'] as MessageType[],
      maxOutputTokens: 2000,
    };

    const configWithHistory = {
      ...mockAgentConfig,
      conversationHistoryConfig: customConfig,
    };

    const agent = new Agent(configWithHistory, mockExecutionContext);
    const config = (agent as any).config;

    expect(config.conversationHistoryConfig).toEqual(customConfig);
  });

  test('should not fetch conversation history when mode is "none"', async () => {
    const configWithNoneMode = {
      ...mockAgentConfig,
      conversationHistoryConfig: {
        mode: 'none' as const,
        limit: 10,
        includeInternal: true,
        messageTypes: ['chat'] as MessageType[],
        maxOutputTokens: 1000,
      },
    };

    const agent = new Agent(configWithNoneMode, mockExecutionContext);
    await agent.generate('Test prompt', mockRuntimeContext);

    expect(getFormattedConversationHistory).not.toHaveBeenCalled();
  });

  test('should fetch full conversation history when mode is "full"', async () => {
    const configWithFullMode = {
      ...mockAgentConfig,
      conversationHistoryConfig: {
        mode: 'full' as const,
        limit: 30,
        includeInternal: false,
        messageTypes: ['chat', 'tool-call'] as MessageType[],
        maxOutputTokens: 3000,
      },
    };

    const agent = new Agent(configWithFullMode, mockExecutionContext);
    await agent.generate('Test prompt', mockRuntimeContext);
    expect(getConversationHistoryWithCompression).toHaveBeenCalled();

    expect(getConversationHistoryWithCompression).toHaveBeenCalledWith({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'test-conversation-id',
      currentMessage: 'Test prompt',
      options: configWithFullMode.conversationHistoryConfig,
      filters: {
        delegationId: undefined,
        isDelegated: false,
      },
      fullContextSize: 0,
      streamRequestId: undefined,
      summarizerModel: {
        model: 'anthropic/claude-sonnet-4-20250514',
        providerOptions: undefined,
      },
    });
  });

  test('should fetch scoped conversation history when mode is "scoped"', async () => {
    const configWithScopedMode = {
      ...mockAgentConfig,
      conversationHistoryConfig: {
        mode: 'scoped' as const,
        limit: 20,
        includeInternal: true,
        messageTypes: ['chat'] as MessageType[],
        maxOutputTokens: 2500,
      },
    };

    const agent = new Agent(configWithScopedMode, mockExecutionContext);
    await agent.generate('Test prompt', mockRuntimeContext);

    expect(getConversationHistoryWithCompression).toHaveBeenCalledWith({
      tenantId: 'test-tenant',
      conversationId: 'test-conversation-id',
      projectId: 'test-project',
      currentMessage: 'Test prompt',
      options: configWithScopedMode.conversationHistoryConfig,
      filters: {
        delegationId: undefined,
        isDelegated: false,
        subAgentId: 'test-agent',
        taskId: 'test-task-id',
      },
      fullContextSize: 0,
      streamRequestId: undefined,
      summarizerModel: {
        model: 'anthropic/claude-sonnet-4-20250514',
        providerOptions: undefined,
      },
    });
  });
});

describe('Agent Credential Integration', () => {
  let mockAgentConfig: AgentConfig;
  let mockAgentFramework: any;
  let mockCredentialStuffer: any;
  let mockExecutionContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getCredentialReference
    getCredentialReferenceMock.mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'test-credential-id',
        credentialStoreId: 'nango-default',
        retrievalParams: {
          connectionId: 'test-connection',
          providerConfigKey: 'test-provider',
        },
      } as any)
    );

    // Mock credential stuffer
    mockCredentialStuffer = {
      buildMcpServerConfig: vi.fn().mockResolvedValue({
        type: MCPTransportType.sse,
        url: 'https://api.nango.dev/mcp',
        headers: {
          Authorization: 'Bearer secret-key',
          'provider-config-key': 'test-provider',
          'connection-id': 'test-connection',
        },
      }),
    };

    // Mock agent framework
    mockAgentFramework = {
      getCredentialStore: vi.fn().mockReturnValue({
        id: 'nango-default',
        get: vi.fn().mockResolvedValue({
          headers: {
            Authorization: 'Bearer secret-key',
            'provider-config-key': 'test-provider',
            'connection-id': 'test-connection',
          },
        }),
      }),
    };

    // Set up mock tools that will be returned by MCP client
    mockMcpTools = {
      search_database: {
        description: 'Search the database for information',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['query'],
        },
        execute: vi.fn(),
      },
    };

    mockAgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent',
      projectId: 'test-project',
      baseUrl: 'http://localhost:3000',
      name: 'Test Agent',
      description: 'A test agent with credentials',
      prompt: `You are a test agent with MCP tools.`,
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      tools: [],
      dataComponents: [],
    };

    mockExecutionContext = createMockExecutionContext({
      credentialReferences: {
        'test-credential-id': {
          id: 'test-credential-id',
          credentialStoreId: 'nango-default',
          retrievalParams: {
            connectionId: 'test-connection',
            providerConfigKey: 'test-provider',
          },
        },
        'context-credential': {
          id: 'context-credential',
          credentialStoreId: 'nango-default',
          retrievalParams: {
            connectionId: 'context-connection',
            providerConfigKey: 'context-provider',
          },
        },
      },
    });
  });

  test('should convert McpTool to MCPToolConfig format', () => {
    const mockMcpTool: McpTool = {
      id: 'test-tool',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      name: 'Test MCP Tool',
      status: 'healthy',
      config: {
        type: 'mcp',
        mcp: {
          server: { url: 'https://api.nango.dev/mcp' },
          transport: { type: MCPTransportType.sse },
        },
      },
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
        logging: false,
      },
      availableTools: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const agent = new Agent(mockAgentConfig, mockExecutionContext, mockAgentFramework);
    const converted = (agent as any).convertToMCPToolConfig(mockMcpTool);

    expect(converted).toEqual({
      id: 'test-tool',
      name: 'Test MCP Tool',
      description: 'Test MCP Tool',
      serverUrl: 'https://api.nango.dev/mcp',
      activeTools: undefined,
      mcpType: MCPServerType.nango,
      transport: { type: MCPTransportType.sse },
      headers: {},
    });
  });

  test('should detect non-Nango MCP tools correctly', () => {
    const mockMcpTool: McpTool = {
      id: 'test-tool',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      name: 'Generic MCP Tool',
      status: 'healthy',
      config: {
        type: 'mcp',
        mcp: {
          server: { url: 'https://mcp.example.com' },
          transport: { type: MCPTransportType.streamableHttp },
        },
      },
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
        logging: false,
      },
      availableTools: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const agent = new Agent(mockAgentConfig, mockExecutionContext, mockAgentFramework);
    const converted = (agent as any).convertToMCPToolConfig(mockMcpTool);

    expect(converted.mcpType).toBe(MCPServerType.generic);
    expect(converted.serverUrl).toBe('https://mcp.example.com');
  });

  test('should build MCP server config with credentials when available', async () => {
    const mockToolConfig: McpTool = {
      id: 'test-tool',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      name: 'Nango Tool',
      status: 'healthy',
      config: {
        type: 'mcp',
        mcp: {
          server: { url: 'https://api.nango.dev/mcp' },
          transport: { type: MCPTransportType.sse },
        },
      },
      credentialReferenceId: 'test-credential-id',
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
        logging: false,
      },
      availableTools: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const configWithCredentials = {
      ...mockAgentConfig,
      tools: [mockToolConfig],
    };

    const agent = new Agent(configWithCredentials, mockExecutionContext, mockAgentFramework);

    // Mock the credential stuffer to simulate credential loading
    (agent as any).credentialStuffer = mockCredentialStuffer;

    const mcpTool = await (agent as any).getMcpTool(mockToolConfig);

    expect(mockCredentialStuffer.buildMcpServerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'test-tenant',
        projectId: 'test-project',
      }),
      expect.objectContaining({
        name: 'Nango Tool',
        serverUrl: 'https://api.nango.dev/mcp',
        mcpType: MCPServerType.nango,
        id: 'test-tool',
        description: 'Nango Tool',
      }),
      {
        credentialStoreId: 'nango-default',
        retrievalParams: {
          connectionId: 'test-connection',
          providerConfigKey: 'test-provider',
        },
      },
      undefined
    );

    expect(mcpTool).toEqual({
      tools: mockMcpTools,
      toolPolicies: {},
      mcpServerId: 'test-tool',
      mcpServerName: 'Nango Tool',
    });
  });

  test('should handle tools without credential reference', async () => {
    const mockToolConfig: McpTool = {
      id: 'test-tool',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      name: 'Generic Tool',
      status: 'healthy',
      config: {
        type: 'mcp',
        mcp: {
          server: { url: 'https://mcp.example.com' },
          transport: { type: MCPTransportType.streamableHttp },
        },
      },
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
        logging: false,
      },
      availableTools: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const configWithoutCredentials = {
      ...mockAgentConfig,
      tools: [mockToolConfig],
    };

    const agent = new Agent(configWithoutCredentials, mockExecutionContext, mockAgentFramework);

    // Mock the credential stuffer
    (agent as any).credentialStuffer = {
      buildMcpServerConfig: vi.fn().mockResolvedValue({
        type: MCPTransportType.streamableHttp,
        url: 'https://mcp.example.com',
        headers: {},
      }),
    };

    const mcpTool = await (agent as any).getMcpTool(mockToolConfig);

    expect(mcpTool).toEqual({
      tools: mockMcpTools,
      toolPolicies: {},
      mcpServerId: 'test-tool',
      mcpServerName: 'Generic Tool',
    });
  });

  test('should pass correct context to credential stuffer', async () => {
    // Mock the specific credential for this test
    getCredentialReferenceMock.mockReturnValueOnce(
      vi.fn().mockResolvedValue({
        id: 'context-credential',
        credentialStoreId: 'nango-default',
        retrievalParams: {
          connectionId: 'context-connection',
          providerConfigKey: 'context-provider',
        },
      } as any)
    );

    const mockToolConfig: McpTool = {
      id: 'context-tool',
      tenantId: 'context-tenant',
      projectId: 'test-project',
      name: 'Context Test Tool',
      status: 'healthy',
      config: {
        type: 'mcp',
        mcp: {
          server: { url: 'https://api.nango.dev/mcp' },
          transport: { type: MCPTransportType.sse },
        },
      },
      credentialReferenceId: 'context-credential',
      capabilities: { tools: true, resources: false, prompts: false, logging: false },
      availableTools: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const contextConfig = {
      id: 'context-agent',
      tenantId: 'context-tenant',
      agentId: 'context-agent',
      projectId: 'test-project',
      baseUrl: 'http://localhost:3000',
      name: 'Context Agent',
      description: 'Agent for testing context',
      prompt: 'Test instructions',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      tools: [mockToolConfig],
      dataComponents: [],
    };

    const agent = new Agent(contextConfig, mockExecutionContext, mockAgentFramework);
    (agent as any).credentialStuffer = mockCredentialStuffer;

    await (agent as any).getMcpTool(mockToolConfig);

    expect(mockCredentialStuffer.buildMcpServerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'context-tenant',
        projectId: 'test-project',
      }),
      expect.objectContaining({
        name: 'Context Test Tool',
        serverUrl: 'https://api.nango.dev/mcp',
        mcpType: MCPServerType.nango,
        id: 'context-tool',
        description: 'Context Test Tool',
      }),
      {
        credentialStoreId: 'nango-default',
        retrievalParams: {
          connectionId: 'context-connection',
          providerConfigKey: 'context-provider',
        },
      },
      undefined
    );
  });
});

describe('Two-Pass Generation System', () => {
  let mockAgentConfig: AgentConfig;
  let mockDataComponent: DataComponentSelect;
  let mockExecutionContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDataComponent = {
      id: 'test-component',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      name: 'TestComponent',
      description: 'Test component',
      props: { type: 'object', properties: { message: { type: 'string' } } },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      render: {
        component: 'console.log("Hello, World!");',
        mockData: { message: 'Hello, World!' },
      },
    };

    mockExecutionContext = createMockExecutionContext();

    mockAgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent',
      projectId: 'test-project',
      baseUrl: 'http://localhost:3000',
      name: 'Test Agent',
      description: 'Test agent',
      prompt: 'Test instructions',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      tools: [],
      dataComponents: [mockDataComponent],
      models: {
        base: {
          model: 'anthropic/claude-sonnet-4-20250514',
        },
      },
    };
  });

  test('should return text response when no data components', async () => {
    const agent = new Agent({ ...mockAgentConfig, dataComponents: [] }, mockExecutionContext);
    const result = await agent.generate('Test prompt');

    expect(result.text).toBe('Mocked response');
    expect(result.object).toBeUndefined();
  });

  test('should return object response when data components configured', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const result = await agent.generate('Test prompt');

    expect(result.object).toBeDefined();
    expect(result.object.dataComponents).toHaveLength(1);
  });
});

describe('Agent Model Settings', () => {
  let mockAgentConfig: AgentConfig;
  let mockExecutionContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExecutionContext = createMockExecutionContext();

    mockAgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentId: 'test-agent',
      baseUrl: 'http://localhost:3000',
      name: 'Test Agent',
      description: 'Test agent for model settingsuration',
      prompt: 'Test instructions',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      models: {
        base: {
          model: 'anthropic/claude-sonnet-4-5',
        },
      },
    };
  });

  test('should use ModelFactory.prepareGenerationConfig with base model configuration', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    await agent.generate('Test prompt');

    // Get the mocked ModelFactory
    const { ModelFactory } = await import('@inkeep/agents-core');
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledWith({
      model: 'anthropic/claude-sonnet-4-5',
      providerOptions: undefined,
    });
  });

  test('should use ModelFactory.prepareGenerationConfig with custom model settingsuration', async () => {
    const configWithModel: AgentConfig = {
      ...mockAgentConfig,
      models: {
        base: {
          model: 'openai/gpt-4o',
          providerOptions: {
            openai: {
              temperature: 0.3,
              maxTokens: 2048,
            },
          },
        },
      },
    };

    const agent = new Agent(configWithModel, mockExecutionContext);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('@inkeep/agents-core');
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledWith({
      model: 'openai/gpt-4o',
      providerOptions: {
        openai: {
          temperature: 0.3,
          maxTokens: 2048,
        },
      },
    });
  });

  test('should use ModelFactory.prepareGenerationConfig with correct provider options', async () => {
    const configWithModel: AgentConfig = {
      ...mockAgentConfig,
      models: {
        base: {
          model: 'anthropic/claude-sonnet-4-5',
          providerOptions: {
            anthropic: {
              temperature: 0.8,
              maxTokens: 3000,
            },
          },
        },
      },
    };

    const agent = new Agent(configWithModel, mockExecutionContext);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('@inkeep/agents-core');
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-sonnet-4-5',
        providerOptions: {
          anthropic: {
            temperature: 0.8,
            maxTokens: 3000,
          },
        },
      })
    );
  });

  test('should pass generation parameters to generateText', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    await agent.generate('Test prompt');

    // Get the mocked generateText function
    const { generateText } = await import('ai');
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mocked-language-model',
        temperature: 0.7,
        maxTokens: 4096,
      })
    );
  });

  test('should use custom model for data component structured output when configured', async () => {
    const configWithDataComponents: AgentConfig = {
      ...mockAgentConfig,
      models: {
        base: {
          model: 'anthropic/claude-3-5-haiku-latest',
          providerOptions: {
            anthropic: {
              temperature: 0.5,
            },
          },
        },
        summarizer: {
          model: 'openai/gpt-4.1-mini',
        },
      },
      dataComponents: [
        {
          id: 'test-component',
          name: 'TestComponent',
          description: 'Test component',
          props: { type: 'object', properties: { message: { type: 'string' } } },
        },
      ],
    };

    const agent = new Agent(configWithDataComponents, mockExecutionContext);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('@inkeep/agents-core');
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledTimes(1);
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledWith({
      model: 'openai/gpt-4.1-mini',
    });
  });

  test('should fall back to base model for structured output when no custom model configured', async () => {
    const configWithDataComponents: AgentConfig = {
      ...mockAgentConfig,
      dataComponents: [
        {
          id: 'test-component',
          name: 'TestComponent',
          description: 'Test component',
          props: { type: 'object', properties: { message: { type: 'string' } } },
        },
      ],
    };

    const agent = new Agent(configWithDataComponents, mockExecutionContext);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('@inkeep/agents-core');
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledTimes(1);
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledWith({
      model: 'anthropic/claude-sonnet-4-5',
      providerOptions: undefined,
    });
  });

  test('should handle OpenAI model settingsuration', async () => {
    const configWithOpenAI: AgentConfig = {
      ...mockAgentConfig,
      models: {
        base: {
          model: 'openai/gpt-4o',
        },
      },
    };

    const agent = new Agent(configWithOpenAI, mockExecutionContext);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('@inkeep/agents-core');
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledWith({
      model: 'openai/gpt-4o',
      providerOptions: undefined,
    });
  });

  test('should handle model without provider prefix', async () => {
    const configWithPlainModel: AgentConfig = {
      ...mockAgentConfig,
      models: {
        base: {
          model: 'anthropic/claude-3-5-haiku-latest',
        },
      },
    };

    const agent = new Agent(configWithPlainModel, mockExecutionContext);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('@inkeep/agents-core');
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledWith({
      model: 'anthropic/claude-3-5-haiku-latest',
      providerOptions: undefined,
    });
  });
});

describe('Agent Conditional Tool Availability', () => {
  let mockExecutionContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExecutionContext = createMockExecutionContext({
      additionalAgents: {
        'test-agent-no-components': {
          id: 'test-agent-no-components',
          name: 'Test Agent No Components',
          description: 'A test agent without components',
          subAgents: {
            'test-agent': {
              id: 'test-agent',
              name: 'Test Agent',
              canUse: [],
              artifactComponents: [],
            },
          },
        },
        'test-agent-with-components': {
          id: 'test-agent-with-components',
          name: 'Test Agent With Components',
          description: 'A test agent with components',
          subAgents: {
            'test-agent': {
              id: 'test-agent',
              name: 'Test Agent',
              canUse: [],
              artifactComponents: [
                {
                  id: 'test-artifact-component',
                  name: 'TestArtifactComponent',
                  description: 'A test artifact component',
                },
              ],
            },
          },
        },
      },
    });
  });

  test('agent without artifact components in agent without components should have no artifact tools', async () => {
    // Mock agentHasArtifactComponents to return false
    agentHasArtifactComponentsMock.mockReturnValue(vi.fn().mockResolvedValue(false));

    const config: AgentConfig = {
      id: 'test-agent',
      projectId: 'test-project',
      name: 'Test Agent',
      description: 'Test agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent-no-components',
      baseUrl: 'http://localhost:3000',
      prompt: 'Test instructions',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      dataComponents: [],
      tools: [],
      functionTools: [],
    };

    const agent = new Agent(config, mockExecutionContext); // No artifact components

    // Access private method for testing
    const tools = await (agent as any).getDefaultTools();

    // Should have no artifact tools
    expect(tools.get_reference_artifact).toBeUndefined();
  });

  test('agent without artifact components in agent with components should have get_reference_artifact', async () => {
    // Mock agentHasArtifactComponents to return true
    agentHasArtifactComponentsMock.mockReturnValue(vi.fn().mockResolvedValue(true));

    const config: AgentConfig = {
      id: 'test-agent',
      projectId: 'test-project',
      name: 'Test Agent',
      description: 'Test agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent-with-components',
      baseUrl: 'http://localhost:3000',
      prompt: 'Test instructions',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      dataComponents: [],
      tools: [],
      functionTools: [],
      artifactComponents: [],
    };

    const agent = new Agent(config, mockExecutionContext); // No artifact components

    // Access private method for testing
    const tools = await (agent as any).getDefaultTools();

    // Should have get_reference_artifact tool
    expect(tools.get_reference_artifact).toBeDefined();
  });

  test('agent with artifact components should have get_reference_artifact tool', async () => {
    // Mock agentHasArtifactComponents to return true
    agentHasArtifactComponentsMock.mockReturnValue(vi.fn().mockResolvedValue(true));

    const mockArtifactComponents = [
      {
        id: 'test-component',
        projectId: 'test-project',
        tenantId: 'test-tenant',
        name: 'TestComponent',
        description: 'Test component',
        props: {
          type: 'object',
          properties: {
            name: { type: 'string', inPreview: true },
            details: { type: 'string', inPreview: false },
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const config: AgentConfig = {
      id: 'test-agent',
      projectId: 'test-project',
      name: 'Test Agent',
      description: 'Test agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent-with-components',
      baseUrl: 'http://localhost:3000',
      prompt: 'Test instructions',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      dataComponents: [],
      tools: [],
      functionTools: [],
      artifactComponents: mockArtifactComponents,
    };

    const agent = new Agent(config, mockExecutionContext);

    // Access private method for testing
    const tools = await (agent as any).getDefaultTools();

    // Should have get_reference_artifact tool
    expect(tools.get_reference_artifact).toBeDefined();
  });
});
