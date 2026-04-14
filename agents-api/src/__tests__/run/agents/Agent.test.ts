import type {
  DataComponentSelect,
  JsonSchemaForLlmSchemaType,
  McpTool,
  MessageType,
} from '@inkeep/agents-core';
import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { JSONSchema } from 'zod/v4/core';
import { Agent, type AgentConfig } from '../../../domains/run/agents/Agent';
import { buildSystemPrompt } from '../../../domains/run/agents/generation/system-prompt';
import { buildToolResultForConversationHistory } from '../../../domains/run/agents/generation/tool-result-for-conversation-history';
import { buildToolResultForModelInput } from '../../../domains/run/agents/generation/tool-result-for-model-input';
import { getArtifactTools, getDefaultTools } from '../../../domains/run/agents/tools/default-tools';
import { getBlobStorageProvider } from '../../../domains/run/services/blob-storage';
import { createDeniedToolResult } from '../../../domains/run/utils/tool-result';

const makeTextPart = (text: string) => [{ kind: 'text' as const, text }];

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
  getFunctionToolsForSubAgentMock,
  buildPersistedMessageContentMock,
  createDefaultConversationHistoryConfigMock,
  getFormattedConversationHistoryMock,
  getConversationHistoryWithCompressionMock,
  formatMessagesAsConversationHistoryMock,
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
  const getFunctionToolsForSubAgentMock = vi.fn().mockResolvedValue([]);
  const buildPersistedMessageContentMock = vi.fn();
  const createDefaultConversationHistoryConfigMock = vi.fn().mockReturnValue({
    mode: 'full',
    limit: 50,
    includeInternal: true,
    messageTypes: ['chat'],
    maxOutputTokens: 4000,
  });
  const getFormattedConversationHistoryMock = vi
    .fn()
    .mockResolvedValue('Mock conversation history');
  const getConversationHistoryWithCompressionMock = vi.fn().mockResolvedValue([]);
  const formatMessagesAsConversationHistoryMock = vi
    .fn()
    .mockReturnValue('Mock conversation history');

  return {
    getCredentialReferenceMock,
    getContextConfigByIdMock,
    getLedgerArtifactsMock,
    listTaskIdsByContextIdMock,
    getFullAgentDefinitionMock,
    agentHasArtifactComponentsMock,
    getToolsForAgentMock,
    getFunctionToolsForSubAgentMock,
    buildPersistedMessageContentMock,
    createDefaultConversationHistoryConfigMock,
    getFormattedConversationHistoryMock,
    getConversationHistoryWithCompressionMock,
    formatMessagesAsConversationHistoryMock,
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
    getFunctionToolsForSubAgent: getFunctionToolsForSubAgentMock,
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
      getInstructions: vi.fn().mockReturnValue(undefined),
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
    createDefaultConversationHistoryConfig: createDefaultConversationHistoryConfigMock,
    getFormattedConversationHistory: getFormattedConversationHistoryMock,
    getConversationHistoryWithCompression: getConversationHistoryWithCompressionMock,
    formatMessagesAsConversationHistory: formatMessagesAsConversationHistoryMock,
  };
});

// Mock ToolSessionManager
vi.mock('../../../domains/run/agents/services/ToolSessionManager', () => ({
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
vi.mock('../../../domains/run/session/AgentSession.js', () => ({
  agentSessionManager: {
    recordEvent: vi.fn(),
    getArtifactService: vi.fn(),
    getArtifactParser: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../../../domains/run/services/blob-storage', () => ({
  isBlobUri: vi.fn((value: string) => value.startsWith('blob://')),
  fromBlobUri: vi.fn((value: string) => value.slice('blob://'.length)),
  getBlobStorageProvider: vi.fn(() => ({
    download: vi.fn().mockResolvedValue({
      data: Uint8Array.from([137, 80, 78, 71]),
      contentType: 'image/png',
    }),
  })),
}));

vi.mock('../../../domains/run/services/blob-storage/file-upload-helpers', () => ({
  buildPersistedMessageContent: buildPersistedMessageContentMock,
}));

// Mock ResponseFormatter
vi.mock('../../../domains/run/stream/ResponseFormatter.js', () => ({
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
    getActiveSpan: vi.fn().mockReturnValue(null),
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

vi.mock('../../../logger.js', () => createMockLoggerModule().module);

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

vi.mock('../../../domains/run/data/conversations.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createDefaultConversationHistoryConfig: createDefaultConversationHistoryConfigMock,
    getFormattedConversationHistory: getFormattedConversationHistoryMock,
    getConversationHistoryWithCompression: getConversationHistoryWithCompressionMock,
    formatMessagesAsConversationHistory: formatMessagesAsConversationHistoryMock,
  };
});

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
        structuredOutput: {
          model: 'openai/gpt-4.1-mini',
        },
        summarizer: {
          model: 'openai/gpt-4.1-nano',
        },
      },
    };

    mockExecutionContext = createMockExecutionContext();
  });

  test('should create Agent and use SystemPromptBuilder to generate XML system prompt', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const systemPromptBuilder = (agent as any).ctx.systemPromptBuilder;

    expect(systemPromptBuilder).toBeDefined();
    expect(systemPromptBuilder.buildSystemPrompt).toBeDefined();

    // Call buildSystemPrompt to ensure it works
    // buildSystemPrompt now imported from generation/system-prompt
    const result = await buildSystemPrompt((agent as any).ctx, undefined, false, {
      mcpResult: {
        tools: mockMcpTools,
        toolSets: [
          {
            mcpServerName: 'Test Tool',
            serverInstructions: undefined,
            mcpServerId: 'test-tool-id',
            toolPolicies: {},
            tools: mockMcpTools,
          },
        ],
      },
      functionTools: {},
      relationTools: {},
    });

    expect(result.prompt).toContain('Mock system prompt with tools');
    expect(systemPromptBuilder.buildSystemPrompt).toHaveBeenCalledWith({
      corePrompt: `You are a helpful test agent that can search databases and assist users.`,
      prompt: undefined,
      tools: [],
      mcpServerGroups: [
        {
          serverName: 'Test Tool',
          serverInstructions: undefined,
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
            },
          ],
        },
      ],
      skills: [],
      dataComponents: [],
      artifacts: [],
      artifactComponents: [],
      allProjectArtifactComponents: [],
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
    // buildSystemPrompt now imported from generation/system-prompt

    const result = await buildSystemPrompt((agent as any).ctx, undefined, false, {
      mcpResult: { tools: {}, toolSets: [] },
      functionTools: {},
      relationTools: {},
    });

    expect(result).toBeDefined();
    const systemPromptBuilder = (agent as any).ctx.systemPromptBuilder;
    expect(systemPromptBuilder.buildSystemPrompt).toHaveBeenCalledWith({
      corePrompt: `You are a helpful test agent that can search databases and assist users.`,
      prompt: undefined,
      skills: [],
      tools: [],
      mcpServerGroups: [],
      dataComponents: [],
      artifacts: [],
      artifactComponents: [],
      allProjectArtifactComponents: [],
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
    // buildSystemPrompt now imported from generation/system-prompt

    const result = await buildSystemPrompt((agent as any).ctx, undefined, false, {
      mcpResult: { tools: {}, toolSets: [] },
      functionTools: {},
      relationTools: {},
    });

    expect(result).toBeDefined();
    const systemPromptBuilder = (agent as any).ctx.systemPromptBuilder;
    expect(systemPromptBuilder.buildSystemPrompt).toHaveBeenCalledWith({
      corePrompt: `You are a helpful test agent that can search databases and assist users.`,
      prompt: undefined,
      skills: [],
      tools: [],
      mcpServerGroups: [],
      dataComponents: [],
      artifacts: [],
      artifactComponents: [],
      allProjectArtifactComponents: [],
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
    // buildSystemPrompt now imported from generation/system-prompt

    const result = await buildSystemPrompt((agent as any).ctx, undefined, false, {
      mcpResult: {
        tools: {},
        toolSets: [
          {
            mcpServerName: 'Test Tool',
            serverInstructions: undefined,
            mcpServerId: 'test-tool-id',
            toolPolicies: {},
            tools: {},
          },
        ],
      },
      functionTools: {},
      relationTools: {},
    });

    expect(result).toBeDefined();
    const systemPromptBuilder = (agent as any).ctx.systemPromptBuilder;
    expect(systemPromptBuilder.buildSystemPrompt).toHaveBeenCalledWith({
      corePrompt: `You are a helpful test agent that can search databases and assist users.`,
      prompt: undefined,
      tools: [],
      mcpServerGroups: [
        {
          serverName: 'Test Tool',
          serverInstructions: undefined,
          tools: [],
        },
      ],
      skills: [],
      dataComponents: [],
      artifacts: [],
      artifactComponents: [],
      allProjectArtifactComponents: [],
      hasAgentArtifactComponents: false,
      includeDataComponents: false,
      clientCurrentTime: undefined,
      hasTransferRelations: false,
      hasDelegateRelations: false,
    });
  });

  test('should use v1 version of SystemPromptBuilder by default', () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const systemPromptBuilder = (agent as any).ctx.systemPromptBuilder;

    // Verify the SystemPromptBuilder was instantiated with 'v1' and PromptConfig
    expect(systemPromptBuilder).toBeDefined();
    // The constructor should have been called with 'v1' and a PromptConfig instance
    // This is tested implicitly by the fact that the agent creates successfully
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
    const config = (agent as any).ctx.config;

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
    const config = (agent as any).ctx.config;

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
    await agent.generate(makeTextPart('Test prompt'), mockRuntimeContext);

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
    await agent.generate(makeTextPart('Test prompt'), mockRuntimeContext);
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
      baseModel: {
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
    await agent.generate(makeTextPart('Test prompt'), mockRuntimeContext);

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
      baseModel: {
        model: 'anthropic/claude-sonnet-4-20250514',
        providerOptions: undefined,
      },
    });
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
      props: {
        type: 'object',
        properties: { message: { type: 'string' } },
      } satisfies JSONSchema.BaseSchema as unknown as JsonSchemaForLlmSchemaType,
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
    const result = await agent.generate(makeTextPart('Test prompt'));

    expect(result.text).toBe('Mocked response');
    expect(result.object).toBeUndefined();
  });

  test('should return object response when data components configured', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const result = await agent.generate(makeTextPart('Test prompt'));

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
    await agent.generate(makeTextPart('Test prompt'));

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
    await agent.generate(makeTextPart('Test prompt'));

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
    await agent.generate(makeTextPart('Test prompt'));

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
    await agent.generate(makeTextPart('Test prompt'));

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
          model: 'anthropic/claude-3-5-haiku',
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
          props: {
            type: 'object',
            properties: { message: { type: 'string' } },
          } satisfies JSONSchema.BaseSchema as unknown as JsonSchemaForLlmSchemaType,
        },
      ],
    };

    const agent = new Agent(configWithDataComponents, mockExecutionContext);
    await agent.generate(makeTextPart('Test prompt'));

    const { ModelFactory } = await import('@inkeep/agents-core');
    // Single-phase generation: uses structuredOutput model when data components are present
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
          props: {
            type: 'object',
            properties: { message: { type: 'string' } },
          } satisfies JSONSchema.BaseSchema as unknown as JsonSchemaForLlmSchemaType,
        },
      ],
    };

    const agent = new Agent(configWithDataComponents, mockExecutionContext);
    await agent.generate(makeTextPart('Test prompt'));

    const { ModelFactory } = await import('@inkeep/agents-core');
    // Single-phase generation: falls back to base model when no structuredOutput model configured
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
    await agent.generate(makeTextPart('Test prompt'));

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
          model: 'anthropic/claude-3-5-haiku',
        },
      },
    };

    const agent = new Agent(configWithPlainModel, mockExecutionContext);
    await agent.generate(makeTextPart('Test prompt'));

    const { ModelFactory } = await import('@inkeep/agents-core');
    expect(ModelFactory.prepareGenerationConfig).toHaveBeenCalledWith({
      model: 'anthropic/claude-3-5-haiku',
      providerOptions: undefined,
    });
  });
});

describe('Agent Conditional Tool Availability', () => {
  let mockExecutionContext: any;
  const baseConfig: Omit<AgentConfig, 'agentId'> = {
    id: 'test-agent',
    projectId: 'test-project',
    name: 'Test Agent',
    description: 'Test agent',
    tenantId: 'test-tenant',
    baseUrl: 'http://localhost:3000',
    prompt: 'Test instructions',
    subAgentRelations: [],
    transferRelations: [],
    delegateRelations: [],
  };

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
      ...baseConfig,
      agentId: 'test-agent-no-components',
    };

    const agent = new Agent(config, mockExecutionContext); // No artifact components

    // Access private method for testing
    const tools = await getDefaultTools((agent as any).ctx);

    // Should have no artifact tools
    expect(tools.get_reference_artifact).toBeUndefined();
  });

  test('agent without artifact components in agent with components should have get_reference_artifact', async () => {
    // Mock agentHasArtifactComponents to return true
    agentHasArtifactComponentsMock.mockReturnValue(vi.fn().mockResolvedValue(true));

    const config: AgentConfig = {
      ...baseConfig,
      agentId: 'test-agent-with-components',
    };

    const agent = new Agent(config, mockExecutionContext); // No artifact components

    // Access private method for testing
    const tools = await getDefaultTools((agent as any).ctx);

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
        } satisfies JSONSchema.BaseSchema as unknown as JsonSchemaForLlmSchemaType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const config: AgentConfig = {
      ...baseConfig,
      agentId: 'test-agent-with-components',
      artifactComponents: mockArtifactComponents,
    };

    const agent = new Agent(config, mockExecutionContext);

    // Access private method for testing
    const tools = await getDefaultTools((agent as any).ctx);

    // Should have get_reference_artifact tool
    expect(tools.get_reference_artifact).toBeDefined();
  });

  test('agent with on-demand skills should have load_skill tool', async () => {
    agentHasArtifactComponentsMock.mockReturnValue(vi.fn().mockResolvedValue(false));
    const config: AgentConfig = {
      ...baseConfig,
      agentId: 'test-agent-on-demand',
      skills: [
        {
          id: 'always-loaded-skill',
          subAgentSkillId: 'sub-agent-skill-1',
          name: 'always-loaded-skill',
          content: '',
          description: 'Always loaded skill',
          metadata: null,
          index: 0,
          alwaysLoaded: false,
          files: [],
        },
        {
          id: 'on-demand-skill',
          subAgentSkillId: 'sub-agent-skill-2',
          name: 'on-demand-skill',
          content: '',
          description: 'On demand skill',
          metadata: null,
          index: 1,
          alwaysLoaded: false,
          files: [
            {
              filePath: 'SKILL.md',
              content: 'Primary skill instructions',
            },
            {
              filePath: 'templates/example.md',
              content: 'Nested file content',
            },
          ],
        },
      ] as AgentConfig['skills'],
    };

    const agent = new Agent(config, mockExecutionContext);
    const tools = await getDefaultTools((agent as any).ctx);

    expect(tools.load_skill).toBeDefined();
    const result = await (tools.load_skill as any).execute({ name: 'on-demand-skill' });
    expect(result).toMatchObject({
      id: 'on-demand-skill',
      name: 'on-demand-skill',
      files: [
        {
          filePath: 'SKILL.md',
          content: 'Primary skill instructions',
        },
        {
          filePath: 'templates/example.md',
          content: 'Nested file content',
        },
      ],
    });
  });
});

describe('Agent Image Support', () => {
  let mockAgentConfig: AgentConfig;
  let mockExecutionContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExecutionContext = createMockExecutionContext();

    mockAgentConfig = {
      id: 'test-agent',
      projectId: 'test-project',
      name: 'Test Agent',
      description: 'Test agent for image support',
      tenantId: 'test-tenant',
      agentId: 'test-agent',
      baseUrl: 'http://localhost:3000',
      prompt: 'You are a helpful assistant that can analyze images.',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      dataComponents: [],
      tools: [],
      functionTools: [],
      models: {
        base: {
          model: 'anthropic/claude-sonnet-4-5',
        },
      },
    };
  });

  test('passes text-only input to generateText', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const { generateText } = await import('ai');

    await agent.generate(makeTextPart('Simple text prompt'));
    expect(generateText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Simple text prompt'),
          }),
        ]),
      })
    );

    await agent.generate(makeTextPart('Just text, no images'));
    expect(generateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Just text, no images'),
          }),
        ]),
      })
    );
  });

  test('passes image URL(s) to generateText in AI SDK format with optional detail metadata', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);

    await agent.generate([
      { kind: 'text', text: 'Compare these two screenshots' },
      {
        kind: 'file',
        file: {
          uri: 'https://example.com/before.png',
          mimeType: 'image/png',
        },
      },
      {
        kind: 'file',
        file: {
          uri: 'https://example.com/after.png',
          mimeType: 'image/png',
        },
        metadata: { detail: 'high' },
      },
    ]);

    const { generateText } = await import('ai');
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('Compare these two screenshots'),
              }),
              expect.objectContaining({ type: 'image', image: expect.any(URL) }),
              expect.objectContaining({
                type: 'image',
                image: expect.any(URL),
                experimental_providerMetadata: { openai: { imageDetail: 'high' } },
              }),
            ]),
          }),
        ]),
      })
    );
  });

  test('passes base64 image data to generateText', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const expectedDataUrl = `data:image/png;base64,${base64Data}`;

    await agent.generate([
      { kind: 'text', text: 'Describe this screenshot' },
      {
        kind: 'file',
        file: {
          bytes: base64Data,
          mimeType: 'image/png',
        },
      },
    ]);

    const { generateText } = await import('ai');
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'text' }),
              expect.objectContaining({ type: 'image', image: expectedDataUrl }),
            ]),
          }),
        ]),
      })
    );
  });

  test('passes inline PDF data to generateText as file content', async () => {
    const agent = new Agent(mockAgentConfig, mockExecutionContext);
    const pdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n',
      'utf8'
    ).toString('base64');

    await agent.generate([
      { kind: 'text', text: 'Summarize this PDF' },
      {
        kind: 'file',
        file: {
          bytes: pdfBytes,
          mimeType: 'application/pdf',
        },
      },
    ]);

    const { generateText } = await import('ai');
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'text' }),
              expect.objectContaining({ type: 'file', mediaType: 'application/pdf' }),
            ]),
          }),
        ]),
      })
    );
  });
});

describe('Agent tool result persistence', () => {
  const makeAgent = () => {
    const config: AgentConfig = {
      id: 'test-agent',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentId: 'test-agent',
      baseUrl: 'http://localhost:3000',
      name: 'Test Agent',
      description: 'Test agent',
      prompt: 'Test instructions',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      tools: [],
      dataComponents: [],
    };
    const executionContext = createMockExecutionContext() as any;
    return new Agent(config, executionContext);
  };

  const makeRunContext = () => {
    const agent = makeAgent() as any;
    return agent.ctx;
  };

  test('builds message content with uploaded image parts', async () => {
    buildPersistedMessageContentMock.mockResolvedValue({
      text: 'persisted text',
      parts: [
        { kind: 'text', text: '{\n  "success": true\n}' },
        {
          kind: 'file',
          data: 'blob://media/test-tenant/test-project/conv-123/msg-123/hash.webp',
          metadata: { mimeType: 'image/webp' },
        },
      ],
    });

    const result = {
      content: [
        {
          type: 'text',
          text: { success: true },
        },
        {
          type: 'image',
          data: 'base64-image-data',
          mimeType: 'image/webp',
        },
      ],
      isError: false,
    };

    const content = await buildToolResultForConversationHistory(
      makeRunContext(),
      'get_ticket_attachments',
      { ticket_id: 6662 },
      result,
      'toolu_123',
      'conv-123',
      'msg-123',
      'task_conv-123-msg-123'
    );

    expect(buildPersistedMessageContentMock).toHaveBeenCalledWith(
      expect.stringContaining('## Tool: get_ticket_attachments'),
      [
        { kind: 'text', text: '{\n  "success": true\n}' },
        {
          kind: 'file',
          file: {
            bytes: 'base64-image-data',
            mimeType: 'image/webp',
          },
        },
      ],
      {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        conversationId: 'conv-123',
        messageId: 'msg-123',
        taskId: 'task_conv-123-msg-123',
        toolCallId: 'toolu_123',
        source: 'tool-result',
      }
    );
    expect(content.parts).toEqual([
      { kind: 'text', text: '{\n  "success": true\n}' },
      {
        kind: 'file',
        data: 'blob://media/test-tenant/test-project/conv-123/msg-123/hash.webp',
        metadata: { mimeType: 'image/webp' },
      },
    ]);
  });

  test('maps image content to image tool result output parts', () => {
    const output = buildToolResultForModelInput({
      content: [
        {
          type: 'image',
          data: 'base64-image-data',
          mimeType: 'image/webp',
        },
        {
          type: 'image',
          url: 'https://example.com/image.webp',
        },
      ],
    });

    expect(output).toEqual({
      type: 'content',
      value: [
        {
          type: 'image-data',
          data: 'base64-image-data',
          mediaType: 'image/webp',
        },
        {
          type: 'image-url',
          url: 'https://example.com/image.webp',
        },
      ],
    });
  });

  test('maps hydrated file tool results to model input parts', () => {
    const output = buildToolResultForModelInput({
      content: [
        {
          type: 'file',
          data: 'base64-image-data',
          mimeType: 'image/webp',
          filename: 'cat.webp',
        },
        {
          type: 'file',
          data: 'JVBERi0xLjQK',
          mimeType: 'application/pdf',
          filename: 'doc.pdf',
        },
      ],
    });

    expect(output).toEqual({
      type: 'content',
      value: [
        {
          type: 'image-data',
          data: 'base64-image-data',
          mediaType: 'image/webp',
        },
        {
          type: 'file-data',
          data: 'JVBERi0xLjQK',
          mediaType: 'application/pdf',
          filename: 'doc.pdf',
        },
      ],
    });
  });

  test('get_reference_artifact hydrates blob-backed binary artifacts into file content', async () => {
    const artifactService = {
      getArtifactFull: vi.fn().mockResolvedValue({
        artifactId: 'art-1',
        toolCallId: 'tool-1',
        name: 'cutecat',
        description: 'binary image',
        type: 'binary_attachment',
        data: {
          blobUri: 'blob://v1/t_test/artifact-data/p_test/a_art-1/sha256-abc.png',
          mimeType: 'image/png',
          binaryType: 'image',
        },
      }),
    };

    const { agentSessionManager } = await import('../../../domains/run/session/AgentSession.js');
    vi.mocked(agentSessionManager.getArtifactService).mockReturnValue(artifactService as any);

    const runContext = makeRunContext();
    runContext.streamRequestId = 'stream-123';

    const tool = getArtifactTools(runContext as any) as any;

    const result = await tool.execute(
      {
        artifactId: 'art-1',
        toolCallId: 'tool-1',
      },
      undefined
    );

    expect(artifactService.getArtifactFull).toHaveBeenCalledWith('art-1', 'tool-1');
    expect(result).toEqual({
      artifactId: 'art-1',
      name: 'cutecat',
      description: 'binary image',
      type: 'binary_attachment',
      data: {
        blobUri: 'blob://v1/t_test/artifact-data/p_test/a_art-1/sha256-abc.png',
        mimeType: 'image/png',
        binaryType: 'image',
      },
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            artifactId: 'art-1',
            name: 'cutecat',
            description: 'binary image',
            type: 'binary_attachment',
            mimeType: 'image/png',
            binaryType: 'image',
          }),
        },
        {
          type: 'file',
          data: 'iVBORw==',
          mimeType: 'image/png',
          filename: 'sha256-abc.png',
        },
      ],
    });
  });

  test('get_reference_artifact from default tools: toModelOutput maps hydrated PNG file parts to image-data', async () => {
    const artifactService = {
      getArtifactFull: vi.fn().mockResolvedValue({
        artifactId: 'art-1',
        toolCallId: 'tool-1',
        name: 'cutecat',
        description: 'binary image',
        type: 'binary_attachment',
        data: {
          blobUri: 'blob://v1/t_test/artifact-data/p_test/a_art-1/sha256-abc.png',
          mimeType: 'image/png',
          binaryType: 'image',
        },
      }),
    };

    const { agentSessionManager } = await import('../../../domains/run/session/AgentSession.js');
    vi.mocked(agentSessionManager.getArtifactService).mockReturnValue(artifactService as any);

    const runContext = makeRunContext();
    runContext.streamRequestId = 'stream-123';
    runContext.executionContext.project.agents[runContext.config.agentId].subAgents[
      runContext.config.id
    ].artifactComponents = [
      {
        id: 'artifact-component',
        name: 'ArtifactComponent',
        description: 'Test artifact component',
      },
    ];

    const tools = await getDefaultTools(runContext as any, 'stream-123');
    const tool = tools.get_reference_artifact as any;

    const hydratedResult = await tool.execute(
      {
        artifactId: 'art-1',
        toolCallId: 'tool-1',
      },
      {
        toolCallId: 'toolu_reference_artifact',
      }
    );

    expect(tool.toModelOutput({ output: hydratedResult })).toEqual({
      type: 'content',
      value: [
        {
          type: 'text',
          text: JSON.stringify({
            artifactId: 'art-1',
            name: 'cutecat',
            description: 'binary image',
            type: 'binary_attachment',
            mimeType: 'image/png',
            binaryType: 'image',
          }),
        },
        {
          type: 'image-data',
          data: 'iVBORw==',
          mediaType: 'image/png',
        },
      ],
    });
  });

  test('get_reference_artifact hydrates text/plain artifacts into a decoded text content part', async () => {
    const fileBody = 'Important Context:\nphone number: 123-456-7890\n';
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new TextEncoder().encode(fileBody),
        contentType: 'text/plain',
      }),
    } as any);

    const artifactService = {
      getArtifactFull: vi.fn().mockResolvedValue({
        artifactId: 'art-text-1',
        toolCallId: 'tool-1',
        name: 'context',
        description: 'text attachment',
        type: 'binary_attachment',
        data: {
          blobUri: 'blob://v1/t_test/media/p_test/conv/c_1/m_1/sha256-abc.txt',
          mimeType: 'text/plain',
          binaryType: 'file',
          filename: 'context.txt',
        },
      }),
    };

    const { agentSessionManager } = await import('../../../domains/run/session/AgentSession.js');
    vi.mocked(agentSessionManager.getArtifactService).mockReturnValue(artifactService as any);

    const runContext = makeRunContext();
    runContext.streamRequestId = 'stream-123';

    const tool = getArtifactTools(runContext as any) as any;

    const result = await tool.execute(
      {
        artifactId: 'art-text-1',
        toolCallId: 'tool-1',
      },
      undefined
    );

    expect(artifactService.getArtifactFull).toHaveBeenCalledWith('art-text-1', 'tool-1');
    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify({
        artifactId: 'art-text-1',
        name: 'context',
        description: 'text attachment',
        type: 'binary_attachment',
        mimeType: 'text/plain',
        binaryType: 'file',
      }),
    });
    expect(result.content[1]).toEqual({
      type: 'text',
      text:
        '<attached_file filename="context.txt" media_type="text/plain">\n' +
        `${fileBody}\n` +
        '</attached_file>',
    });
    expect(result.content.some((part: any) => part.type === 'file')).toBe(false);
  });

  test('get_reference_artifact from default tools: toModelOutput maps hydrated text/plain to text parts', async () => {
    const fileBody = 'line one\nline two\n';
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new TextEncoder().encode(fileBody),
        contentType: 'text/plain',
      }),
    } as any);

    const artifactService = {
      getArtifactFull: vi.fn().mockResolvedValue({
        artifactId: 'art-text-2',
        toolCallId: 'tool-1',
        name: 'notes',
        description: 'markdown notes',
        type: 'binary_attachment',
        data: {
          blobUri: 'blob://v1/t_test/media/p_test/conv/c_1/m_1/sha256-def.md',
          mimeType: 'text/markdown',
          binaryType: 'file',
          filename: 'notes.md',
        },
      }),
    };

    const { agentSessionManager } = await import('../../../domains/run/session/AgentSession.js');
    vi.mocked(agentSessionManager.getArtifactService).mockReturnValue(artifactService as any);

    const runContext = makeRunContext();
    runContext.streamRequestId = 'stream-123';
    runContext.executionContext.project.agents[runContext.config.agentId].subAgents[
      runContext.config.id
    ].artifactComponents = [
      {
        id: 'artifact-component',
        name: 'ArtifactComponent',
        description: 'Test artifact component',
      },
    ];

    const tools = await getDefaultTools(runContext as any, 'stream-123');
    const tool = tools.get_reference_artifact as any;

    const hydratedResult = await tool.execute(
      {
        artifactId: 'art-text-2',
        toolCallId: 'tool-1',
      },
      {
        toolCallId: 'toolu_reference_artifact',
      }
    );

    const modelOutput = tool.toModelOutput({ output: hydratedResult });
    expect(modelOutput.type).toBe('content');
    for (const part of modelOutput.value) {
      expect(part.type).toBe('text');
    }
    expect(
      modelOutput.value.some(
        (part: any) =>
          part.type === 'text' &&
          part.text.includes('<attached_file filename="notes.md" media_type="text/markdown">') &&
          part.text.includes('line one\nline two')
      )
    ).toBe(true);
  });

  test('get_reference_artifact falls back to file-data when text decode fails', async () => {
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: Uint8Array.from([0x01, 0x02, 0x03]),
        contentType: 'text/plain',
      }),
    } as any);

    const artifactService = {
      getArtifactFull: vi.fn().mockResolvedValue({
        artifactId: 'art-text-3',
        toolCallId: 'tool-1',
        name: 'corrupt',
        description: 'mislabeled text',
        type: 'binary_attachment',
        data: {
          blobUri: 'blob://v1/t_test/media/p_test/conv/c_1/m_1/sha256-ghi.txt',
          mimeType: 'text/plain',
          binaryType: 'file',
          filename: 'corrupt.txt',
        },
      }),
    };

    const { agentSessionManager } = await import('../../../domains/run/session/AgentSession.js');
    vi.mocked(agentSessionManager.getArtifactService).mockReturnValue(artifactService as any);

    const runContext = makeRunContext();
    runContext.streamRequestId = 'stream-123';

    const tool = getArtifactTools(runContext as any) as any;

    const result = await tool.execute(
      {
        artifactId: 'art-text-3',
        toolCallId: 'tool-1',
      },
      undefined
    );

    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect(result.content[1]).toEqual({
      type: 'file',
      data: Buffer.from(Uint8Array.from([0x01, 0x02, 0x03])).toString('base64'),
      mimeType: 'text/plain',
      filename: 'sha256-ghi.txt',
    });
  });

  test('prepends _toolCallId and _structureHints as a text part for MCP content results', () => {
    const structureHints = { terminalPaths: ['result.foo[string]'] };

    const output = buildToolResultForModelInput({
      content: [{ type: 'text', text: 'some text' }],
      _toolCallId: 'toolu_abc',
      _structureHints: structureHints,
    });

    expect(output).toEqual({
      type: 'content',
      value: [
        {
          type: 'text',
          text: JSON.stringify({ _toolCallId: 'toolu_abc', _structureHints: structureHints }),
        },
        { type: 'text', text: 'some text' },
      ],
    });
  });

  test('get_reference_artifact falls back to metadata-only when blob download fails', async () => {
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      download: vi.fn().mockRejectedValue(new Error('not found')),
    } as any);

    const artifactService = {
      getArtifactFull: vi.fn().mockResolvedValue({
        artifactId: 'art-1',
        toolCallId: 'tool-1',
        name: 'cutecat',
        description: 'binary image',
        type: 'binary_attachment',
        data: {
          blobUri: 'blob://v1/t_test/artifact-data/p_test/a_art-1/sha256-abc.png',
          mimeType: 'image/png',
          binaryType: 'image',
        },
      }),
    };

    const { agentSessionManager } = await import('../../../domains/run/session/AgentSession.js');
    vi.mocked(agentSessionManager.getArtifactService).mockReturnValue(artifactService as any);

    const runContext = makeRunContext();
    runContext.streamRequestId = 'stream-123';

    const tool = getArtifactTools(runContext as any) as any;

    const result = await tool.execute(
      {
        artifactId: 'art-1',
        toolCallId: 'tool-1',
      },
      undefined
    );

    expect(result).toEqual({
      artifactId: 'art-1',
      name: 'cutecat',
      description: 'binary image',
      type: 'binary_attachment',
      data: {
        blobUri: 'blob://v1/t_test/artifact-data/p_test/a_art-1/sha256-abc.png',
        mimeType: 'image/png',
        binaryType: 'image',
      },
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            artifactId: 'art-1',
            name: 'cutecat',
            description: 'binary image',
            type: 'binary_attachment',
            mimeType: 'image/png',
            binaryType: 'image',
            hydrationStatus: 'metadata_only',
          }),
        },
      ],
    });
  });

  test('preserves execution-denied tool result output type', () => {
    const output = buildToolResultForModelInput(
      createDeniedToolResult('toolu_123', 'User denied this tool call')
    );

    expect(output).toEqual({
      type: 'execution-denied',
      reason: 'User denied this tool call',
    });
  });
});
