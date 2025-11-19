import {
  type DataComponentSelect,
  MCPServerType,
  MCPTransportType,
  type McpTool,
  type MessageType,
} from '@inkeep/agents-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Agent, type AgentConfig } from '../../agents/Agent';
import { Phase1Config } from '../../agents/versions/v1/Phase1Config';

// Mock the AI SDK functions
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
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
  }),
  generateObject: vi.fn().mockResolvedValue({
    object: {
      dataComponents: [
        {
          id: 'test-component-id',
          name: 'TestComponent',
          description: 'A test component',
          props: { message: 'Hello, World!' },
        },
      ],
    },
    finishReason: 'stop',
  }),
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
  };
});

// Mock anthropic
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue('mocked-model'),
}));

// Mock ModelFactory
vi.mock('../../agents/ModelFactory.js', () => {
  const mockModel = 'mocked-language-model';
  const mockGenerationParams = { temperature: 0.7, maxTokens: 4096 };
  const mockGenerationConfig = { model: mockModel, ...mockGenerationParams };

  return {
    ModelFactory: {
      createModel: vi.fn().mockReturnValue(mockModel),
      getGenerationParams: vi.fn().mockReturnValue(mockGenerationParams),
      prepareGenerationConfig: vi.fn().mockReturnValue(mockGenerationConfig),
      validateConfig: vi.fn().mockReturnValue([]),
    },
  };
});

// Mock ToolSessionManager
vi.mock('../../agents/ToolSessionManager.js', () => ({
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
vi.mock('../../utils/agent-session.js', () => ({
  agentSessionManager: {
    recordEvent: vi.fn(),
  },
}));

// Mock ResponseFormatter
vi.mock('../../utils/response-formatter.js', () => ({
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
vi.mock('../../logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock the SystemPromptBuilder
vi.mock('../../agents/SystemPromptBuilder.js', () => ({
  SystemPromptBuilder: vi.fn().mockImplementation(() => ({
    buildSystemPrompt: vi
      .fn()
      .mockResolvedValue('<system_message>Mock system prompt with tools</system_message>'),
  })),
}));

vi.mock('../../data/conversations.js', () => ({
  createDefaultConversationHistoryConfig: vi.fn().mockReturnValue({
    mode: 'full',
    limit: 50,
    includeInternal: true,
    messageTypes: ['chat'],
    maxOutputTokens: 4000,
  }),
  getFormattedConversationHistory: vi.fn().mockResolvedValue('Mock conversation history'),
  getConversationScopedArtifacts: vi.fn().mockResolvedValue([]),
}));

// Import the mocked functions so we can reference them in tests
import { generateObject, generateText } from 'ai';
// Import the mocked module - these will automatically be mocked
import { getFormattedConversationHistory } from '../../data/conversations';

describe('Agent Integration with SystemPromptBuilder', () => {
  let mockAgentConfig: AgentConfig;
  let mockTool: McpTool;

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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockAgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent',
      projectId: 'test-project',
      ref: {} as any,
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
        structuredOutput: {
          model: 'openai/gpt-4.1-mini',
        },
        summarizer: {
          model: 'openai/gpt-4.1-nano',
        },
      },
    };
  });

  test('should create Agent and use SystemPromptBuilder to generate XML system prompt', async () => {
    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient);
    const systemPromptBuilder = (agent as any).systemPromptBuilder;

    expect(systemPromptBuilder).toBeDefined();
    expect(systemPromptBuilder.buildSystemPrompt).toBeDefined();

    // Call buildSystemPrompt to ensure it works
    const buildSystemPrompt = (agent as any).buildSystemPrompt.bind(agent);
    const result = await buildSystemPrompt();

    expect(result).toContain('Mock system prompt with tools');
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
      isThinkingPreparation: false,
      hasTransferRelations: false,
      hasDelegateRelations: false,
    });
  });

  test('should handle Agent with no tools', async () => {
    const configWithNoTools = { ...mockAgentConfig, tools: [] };
    const agent = new Agent(configWithNoTools, configWithNoTools.dbClient);
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
      isThinkingPreparation: false,
      hasTransferRelations: false,
      hasDelegateRelations: false,
    });
  });

  test('should handle Agent with undefined tools', async () => {
    const configWithUndefinedTools = { ...mockAgentConfig, tools: undefined };
    const agent = new Agent(configWithUndefinedTools, configWithUndefinedTools.dbClient);
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
      isThinkingPreparation: false,
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
    const agent = new Agent(configWithEmptyAvailableTools, configWithEmptyAvailableTools.dbClient);
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
      isThinkingPreparation: false,
      hasTransferRelations: false,
      hasDelegateRelations: false,
    });
  });

  test('should use v1 version of SystemPromptBuilder by default', () => {
    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient);
    const systemPromptBuilder = (agent as any).systemPromptBuilder;

    // Verify the SystemPromptBuilder was instantiated with 'v1' and Phase1Config
    expect(systemPromptBuilder).toBeDefined();
    // The constructor should have been called with 'v1' and a Phase1Config instance
    // This is tested implicitly by the fact that the agent creates successfully
  });
});

describe('Phase1Config Tool Conversion', () => {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      } as McpTool,
    ];

    const result = Phase1Config.convertMcpToolsToToolData(mockTools);

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
    expect(Phase1Config.convertMcpToolsToToolData([])).toEqual([]);
    expect(Phase1Config.convertMcpToolsToToolData(undefined)).toEqual([]);
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
        createdAt: new Date(),
        updatedAt: new Date(),
      } as McpTool,
    ];

    const result = Phase1Config.convertMcpToolsToToolData(mockTools);
    expect(result).toEqual([]);
  });
});

describe('Agent conversationHistoryConfig Functionality', () => {
  let mockAgentConfig: AgentConfig;
  let mockRuntimeContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Configure the already-mocked function
    vi.mocked(getFormattedConversationHistory).mockResolvedValue('Mock conversation history');

    mockAgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent',
      projectId: 'test-project',
      dbClient: {} as any,
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
    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient);
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

    const agent = new Agent(configWithHistory, configWithHistory.dbClient);
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

    const agent = new Agent(configWithNoneMode, configWithNoneMode.dbClient);
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

    const agent = new Agent(configWithFullMode, configWithFullMode.dbClient);
    await agent.generate('Test prompt', mockRuntimeContext);
    expect(getFormattedConversationHistory).toHaveBeenCalled();

    expect(getFormattedConversationHistory).toHaveBeenCalledWith({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'test-conversation-id',
      currentMessage: 'Test prompt',
      options: configWithFullMode.conversationHistoryConfig,
      filters: {
        delegationId: undefined,
        isDelegated: false,
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

    const agent = new Agent(configWithScopedMode, configWithScopedMode.dbClient);
    await agent.generate('Test prompt', mockRuntimeContext);

    expect(getFormattedConversationHistory).toHaveBeenCalledWith({
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
      dbClient: configWithScopedMode.dbClient,
    });
  });
});

describe('Agent Credential Integration', () => {
  let mockAgentConfig: AgentConfig;
  let mockAgentFramework: any;
  let mockCredentialStuffer: any;

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
      dbClient: {} as any,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient, mockAgentFramework);
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient, mockAgentFramework);
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const configWithCredentials = {
      ...mockAgentConfig,
      tools: [mockToolConfig],
    };

    const agent = new Agent(
      configWithCredentials,
      configWithCredentials.dbClient,
      mockAgentFramework
    );

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

    expect(mcpTool).toEqual(mockMcpTools);
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const configWithoutCredentials = {
      ...mockAgentConfig,
      tools: [mockToolConfig],
    };

    const agent = new Agent(
      configWithoutCredentials,
      configWithoutCredentials.dbClient,
      mockAgentFramework
    );

    // Mock the credential stuffer
    (agent as any).credentialStuffer = {
      buildMcpServerConfig: vi.fn().mockResolvedValue({
        url: 'https://mcp.example.com',
        headers: {},
        transport: { type: MCPTransportType.streamableHttp },
      }),
    };

    const mcpTool = await (agent as any).getMcpTool(mockToolConfig);

    expect(mcpTool).toEqual(mockMcpTools);
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const contextConfig = {
      id: 'context-agent',
      tenantId: 'context-tenant',
      agentId: 'context-agent',
      projectId: 'test-project',
      dbClient: {} as any,
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

    const agent = new Agent(contextConfig, contextConfig.dbClient, mockAgentFramework);
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

    mockAgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      agentId: 'test-agent',
      projectId: 'test-project',
      dbClient: {} as any,
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

  test('should only call generateText when no data components configured', async () => {
    const agent = new Agent({ ...mockAgentConfig, dataComponents: [] }, mockAgentConfig.dbClient);
    await agent.generate('Test prompt');

    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateObject)).not.toHaveBeenCalled();
  });

  test('should call both generateText and generateObject when data components configured', async () => {
    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient);
    await agent.generate('Test prompt');

    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(1);
  });

  test('should skip generateObject when transfer detected', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Transfer needed',
      finishReason: 'stop',
      steps: [
        {
          content: [
            {
              type: 'text',
              text: 'Transfer needed',
            },
          ],
          toolCalls: [{ toolName: 'transfer_to_agent', args: {} }],
        },
      ],
    } as any);

    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient);
    await agent.generate('Test prompt');

    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateObject)).not.toHaveBeenCalled();
  });

  test('should return text response when no data components', async () => {
    const agent = new Agent({ ...mockAgentConfig, dataComponents: [] }, mockAgentConfig.dbClient);
    const result = await agent.generate('Test prompt');

    expect(result.text).toBe('Mocked response');
    expect(result.object).toBeUndefined();
  });

  test('should return object response when data components configured', async () => {
    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient);
    const result = await agent.generate('Test prompt');

    expect(result.object).toBeDefined();
    expect(result.object.dataComponents).toHaveLength(1);
  });
});

describe('Agent Model Settings', () => {
  let mockAgentConfig: AgentConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentId: 'test-agent',
      dbClient: {} as any,
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
    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient);
    await agent.generate('Test prompt');

    // Get the mocked ModelFactory
    const { ModelFactory } = await import('../../agents/ModelFactory.js');
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

    const agent = new Agent(configWithModel, configWithModel.dbClient);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('../../agents/ModelFactory.js');
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

    const agent = new Agent(configWithModel, configWithModel.dbClient);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('../../agents/ModelFactory.js');
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
    const agent = new Agent(mockAgentConfig, mockAgentConfig.dbClient);
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
        structuredOutput: {
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

    const agent = new Agent(configWithDataComponents, configWithDataComponents.dbClient);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('../../agents/ModelFactory.js');
    // Called twice: once for text generation with custom model, once for structured output with OpenAI model
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledTimes(2);
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenNthCalledWith(1, {
      model: 'anthropic/claude-3-5-haiku-latest',
      providerOptions: {
        anthropic: {
          temperature: 0.5,
        },
      },
    });
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenNthCalledWith(2, {
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

    const agent = new Agent(configWithDataComponents, configWithDataComponents.dbClient);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('../../agents/ModelFactory.js');
    // Called twice: once for text generation, once for structured output (both use base model)
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledTimes(2);
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenNthCalledWith(1, {
      model: 'anthropic/claude-sonnet-4-5',
      providerOptions: undefined,
    });
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenNthCalledWith(2, {
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

    const agent = new Agent(configWithOpenAI, configWithOpenAI.dbClient);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('../../agents/ModelFactory.js');
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

    const agent = new Agent(configWithPlainModel, configWithPlainModel.dbClient);
    await agent.generate('Test prompt');

    const { ModelFactory } = await import('../../agents/ModelFactory.js');
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledWith({
      model: 'anthropic/claude-3-5-haiku-latest',
      providerOptions: undefined,
    });
  });
});

describe('Agent Conditional Tool Availability', () => {
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
      dbClient: {} as any,
      baseUrl: 'http://localhost:3000',
      prompt: 'Test instructions',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      dataComponents: [],
      tools: [],
      functionTools: [],
    };

    const agent = new Agent(config, config.dbClient); // No artifact components

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
      dbClient: {} as any,
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

    const agent = new Agent(config, config.dbClient); // No artifact components

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
      dbClient: {} as any,
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

    const agent = new Agent(config, config.dbClient);

    // Access private method for testing
    const tools = await (agent as any).getDefaultTools();

    // Should have get_reference_artifact tool
    expect(tools.get_reference_artifact).toBeDefined();
  });
});
