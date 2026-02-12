import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the ai package's tool function - must be before imports
vi.mock('ai', () => ({
  tool: (config: any) => ({
    ...config,
    execute: config.execute,
  }),
}));

import { generateServiceToken } from '@inkeep/agents-core';
import { A2AClient } from '../../../domains/run/a2a/client';
import type { AgentConfig, ExternalAgentRelationConfig } from '../../../domains/run/agents/Agent';
import {
  createDelegateToAgentTool,
  createTransferToAgentTool,
} from '../../../domains/run/agents/relationTools';
import { saveA2AMessageResponse } from '../../../domains/run/data/conversations';

function createMockExecutionContext(
  overrides: {
    tenantId?: string;
    projectId?: string;
    agentId?: string;
    credentialReferences?: Record<string, any>;
  } = {}
) {
  const tenantId = overrides.tenantId ?? 'test-tenant';
  const projectId = overrides.projectId ?? 'test-project';
  const agentId = overrides.agentId ?? 'test-agent';

  return {
    apiKey: 'test-api-key',
    apiKeyId: 'test-api-key-id',
    tenantId,
    projectId,
    agentId,
    baseUrl: 'http://localhost:3000',
    resolvedRef: { type: 'branch', name: 'main', hash: 'test-hash' },
    project: {
      id: projectId,
      tenantId,
      name: 'Test Project',
      agents: {
        [agentId]: {
          id: agentId,
          tenantId,
          projectId,
          name: 'Test Agent',
          description: 'Test agent',
          defaultSubAgentId: 'target-agent',
          subAgents: {
            'target-agent': {
              id: 'target-agent',
              tenantId,
              projectId,
              name: 'Target Agent',
              description: 'A target agent for testing',
              prompt: 'You are a target agent.',
              canUse: [],
              canTransferTo: [],
              canDelegateTo: [],
              dataComponents: [],
              artifactComponents: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
          tools: {},
          externalAgents: {},
          teamAgents: {},
          transferRelations: {},
          delegateRelations: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
      tools: {},
      functions: {},
      dataComponents: {},
      artifactComponents: {},
      externalAgents: {},
      credentialReferences: overrides.credentialReferences ?? {},
      statusUpdates: null,
    },
  };
}

// Mock @inkeep/agents-core functions using hoisted pattern
const { createMessageMock, getCredentialReferenceMock, getExternalAgentMock } = vi.hoisted(() => {
  const createMessageMock = vi.fn(() => vi.fn().mockResolvedValue({ id: 'mock-message-id' }));
  const getCredentialReferenceMock = vi.fn(() => vi.fn().mockResolvedValue(null));
  const getExternalAgentMock = vi.fn(() => vi.fn().mockResolvedValue(null));
  return { createMessageMock, getCredentialReferenceMock, getExternalAgentMock };
});

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    createMessage: createMessageMock,
    getCredentialReference: getCredentialReferenceMock,
    getExternalAgent: getExternalAgentMock,
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
    generateServiceToken: vi.fn().mockResolvedValue('test-service-token'),
    getTracer: vi.fn().mockReturnValue({
      startSpan: vi.fn().mockReturnValue({
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      }),
    }),
    createDatabaseClient: vi.fn().mockReturnValue({}),
    contextValidationMiddleware: vi.fn().mockReturnValue(async (c: any, next: any) => {
      c.set('validatedContext', {
        agentId: 'test-agent',
        tenantId: 'test-tenant',
        projectId: 'default',
      });
      await next();
    }),
    CredentialStuffer: vi.fn().mockImplementation(function CredentialStuffer() {
      return {
        getCredentialHeaders: vi.fn().mockResolvedValue({}),
      };
    }),
    ContextResolver: vi.fn().mockImplementation(function ContextResolver() {
      return {
        resolveContext: vi.fn().mockResolvedValue({}),
        stuffCredentials: vi.fn().mockResolvedValue({}),
      };
    }),
    CredentialStoreRegistry: vi.fn().mockImplementation(function CredentialStoreRegistry() {
      return {
        get: vi.fn().mockReturnValue({
          id: 'mock-store',
          type: 'mock',
          get: vi.fn().mockResolvedValue({}),
        }),
        getAll: vi.fn().mockReturnValue([]),
        getIds: vi.fn().mockReturnValue(['mock-store']),
        has: vi.fn().mockReturnValue(true),
      };
    }),
    generateId: vi.fn(() => 'test-nanoid-123'),
  };
});

// Mock database client
vi.mock('../../../data/db/runDbClient.js', () => ({
  default: {},
}));

// Credentials moved to @inkeep/agents-core, mocked above

// Mock ContextResolver used by relationTools (comes from local module)
vi.mock('../../../domains/run/context', () => ({
  ContextResolver: vi.fn().mockImplementation(function ContextResolver() {
    return {
      resolveHeaders: vi.fn().mockResolvedValue({}),
      resolveContext: vi.fn().mockResolvedValue({}),
    };
  }),
}));

// Mock the A2AClient
const mockSendMessage = vi.fn().mockResolvedValue({ result: 'success', error: null });

vi.mock('../../../domains/run/a2a/client', () => ({
  A2AClient: vi.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
  })),
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

// Mock the env
vi.mock('../../../env.js', () => ({
  env: {
    AGENT_BASE_URL: 'http://localhost:3000',
  },
}));

// Mock conversations functions (saveA2AMessageResponse is still in local file)
vi.mock('../../../domains/run/data/conversations', () => ({
  saveA2AMessageResponse: vi.fn().mockResolvedValue({ id: 'mock-response-message-id' }),
}));

// Mock agent operations
vi.mock('../../../domains/run/utils/agent-operations.js', () => ({
  delegationOp: vi.fn(),
}));

// Mock stream registry
vi.mock('../../../domains/run/utils/stream-registry.js', () => ({
  getStreamHelper: vi.fn(),
}));

// Mock the session managers to prevent loading heavy dependencies
vi.mock('../../../domains/run/services/AgentSession.js', () => ({
  agentSessionManager: {
    getSession: vi.fn(),
    createSession: vi.fn(),
  },
}));

describe('Relationship Tools', () => {
  let mockAgentConfig: AgentConfig;
  let mockExternalAgentConfig: ExternalAgentRelationConfig;
  let _mockSendMessageInstance: any;
  let mockCredentialStoreRegistry: any;
  let mockExecutionContext: any;

  const mockToolCallOptions = {
    toolCallId: 'test-tool-call-id',
    messages: [],
  };

  const getDelegateParams = (config?: Partial<AgentConfig>) => ({
    delegateConfig: {
      type: 'internal' as const,
      config: { ...mockAgentConfig, ...config },
    },
    callingAgentId: 'test-calling-agent',
    executionContext: mockExecutionContext,
    contextId: 'test-context',
    metadata: {
      conversationId: 'test-conversation',
      threadId: 'test-thread',
      apiKey: 'test-api-key',
    },
  });

  const getExternalDelegateParams = (config?: Partial<ExternalAgentRelationConfig>) => ({
    delegateConfig: {
      type: 'external' as const,
      config: { ...mockExternalAgentConfig, ...config },
    },
    callingAgentId: 'test-calling-agent',
    executionContext: mockExecutionContext,
    contextId: 'test-context',
    metadata: {
      conversationId: 'test-conversation',
      threadId: 'test-thread',
      apiKey: 'test-api-key',
    },
    get credentialStoreRegistry() {
      return mockCredentialStoreRegistry;
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockExecutionContext = createMockExecutionContext();

    // Create mock credential store registry
    mockCredentialStoreRegistry = {
      get: vi.fn().mockReturnValue({
        id: 'mock-store',
        type: 'mock',
        get: vi.fn().mockResolvedValue({}),
      }),
      getAll: vi.fn().mockReturnValue([]),
      getIds: vi.fn().mockReturnValue(['mock-store']),
      has: vi.fn().mockReturnValue(true),
    };

    mockAgentConfig = {
      id: 'target-agent',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentId: 'test-agent',
      baseUrl: 'http://localhost:3000',
      name: 'Target Agent',
      description: 'A target agent for testing',
      prompt: 'You are a target agent.',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      tools: [],
    };

    mockExternalAgentConfig = {
      id: 'external-agent',
      name: 'External Agent',
      description: 'An external agent for testing',
      baseUrl: 'http://external-agent.example.com',
      ref: { type: 'branch', name: 'main', hash: 'test-hash' },
      headers: null,
      credentialReferenceId: null,
      relationId: 'test-relation-id',
      relationType: 'delegate',
    };
  });

  describe('createTransferToAgentTool', () => {
    it('should create a transfer tool with correct description', () => {
      const tool = createTransferToAgentTool({
        transferConfig: mockAgentConfig,
        callingAgentId: 'test-agent',
      });

      expect(tool.description).toContain(
        'This tool immediately transfers conversation control to agent'
      );
    });

    it('should have proper tool structure', () => {
      const tool = createTransferToAgentTool({
        transferConfig: mockAgentConfig,
        callingAgentId: 'test-agent',
      });

      // Verify tool structure
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool).toHaveProperty('execute');
      expect(typeof tool.execute).toBe('function');
    });

    it('should work with different agent configurations', () => {
      const differentAgentConfig: AgentConfig = {
        ...mockAgentConfig,
        id: 'refund-agent',
        name: 'Refund Agent',
      };

      const tool = createTransferToAgentTool({
        transferConfig: differentAgentConfig,
        callingAgentId: 'test-agent',
      });

      expect(tool.description).toContain(
        'This tool immediately transfers conversation control to agent refund-agent'
      );
    });

    it('should handle agent IDs with special characters', () => {
      const specialAgentConfig: AgentConfig = {
        ...mockAgentConfig,
        id: 'customer-support-agent-v2',
      };

      const tool = createTransferToAgentTool({
        transferConfig: specialAgentConfig,
        callingAgentId: 'test-agent',
      });

      expect(tool.description).toContain(
        'This tool immediately transfers conversation control to agent customer-support-agent-v2'
      );
    });

    it('should handle invalid agent configuration', () => {
      const invalidAgentConfig = {
        ...mockAgentConfig,
        id: '', // Empty ID
      };

      const tool = createTransferToAgentTool({
        transferConfig: invalidAgentConfig,
        callingAgentId: 'test-agent',
      });

      expect(tool.description).toContain(
        'This tool immediately transfers conversation control to agent '
      );
    });

    it('should handle undefined agent config properties', () => {
      const partialAgentConfig = {
        id: 'test-agent',
      } as AgentConfig;

      const tool = createTransferToAgentTool({
        transferConfig: partialAgentConfig,
        callingAgentId: 'test-agent',
      });

      expect(tool.description).toContain(
        'This tool immediately transfers conversation control to agent test-agent'
      );
    });
  });

  describe('Unified createDelegateToAgentTool', () => {
    it('should create internal delegation tool when type is internal', () => {
      const tool = createDelegateToAgentTool(getDelegateParams());

      expect(tool.description).toContain('Delegate a specific task to another agent');
    });

    it('should create external delegation tool when type is external', () => {
      const tool = createDelegateToAgentTool(getExternalDelegateParams());

      expect(tool.description).toContain('Delegate a specific task to another agent');
    });

    it('should handle different agent configurations for internal delegation', () => {
      const customAgentConfig = {
        ...mockAgentConfig,
        id: 'custom-agent',
        name: 'Custom Agent',
      };

      const tool = createDelegateToAgentTool(getDelegateParams(customAgentConfig));

      expect(tool.description).toContain('Delegate a specific task to another agent');
    });

    it('should handle different external agent configurations', () => {
      const customExternalAgent = {
        id: 'custom-external',
        name: 'Custom External Agent',
        description: 'A custom external agent',
        baseUrl: 'https://custom-external.com',
      };

      const tool = createDelegateToAgentTool(getExternalDelegateParams(customExternalAgent));

      expect(tool.description).toContain('Delegate a specific task to another agent');
    });

    it('should have consistent tool structure for both internal and external delegation', () => {
      const internalTool = createDelegateToAgentTool(getDelegateParams());
      const externalTool = createDelegateToAgentTool(getExternalDelegateParams());

      // Both tools should have consistent structure
      for (const tool of [internalTool, externalTool]) {
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('execute');
        expect(typeof tool.execute).toBe('function');
      }
    });

    it('should execute external delegation with proper message structure', async () => {
      mockSendMessage.mockResolvedValue({ result: 'external success', error: null });

      const tool = createDelegateToAgentTool(getExternalDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }

      const result = await tool.execute(
        { message: 'Test external delegation message' },
        mockToolCallOptions
      );

      // Assert that result is not an AsyncIterable
      const syncResult = result as { toolCallId: any; result: any };

      expect(syncResult.result).toBe('external success');
      expect(syncResult.toolCallId).toBe('test-tool-call-id');

      // Verify A2A client was called with correct message structure
      expect(mockSendMessage).toHaveBeenCalledWith({
        message: {
          role: 'agent',
          parts: [{ text: 'Test external delegation message', kind: 'text' }],
          messageId: 'test-nanoid-123',
          kind: 'message',
          contextId: 'test-context',
          metadata: {
            conversationId: 'test-conversation',
            threadId: 'test-thread',
            apiKey: 'test-api-key',
            fromExternalAgentId: 'test-calling-agent',
            isDelegation: true,
            delegationId: 'del_test-nanoid-123',
          },
        },
      });
    });

    it('should record outgoing external delegation message with external visibility', async () => {
      mockSendMessage.mockResolvedValue({ result: 'success', error: null });

      const tool = createDelegateToAgentTool(getExternalDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }
      await tool.execute({ message: 'Test message' }, mockToolCallOptions);

      // Verify createMessage was called with database client
      expect(createMessageMock).toHaveBeenCalledWith(expect.anything());

      // Verify the inner function was called with the message data
      const innerMock = createMessageMock.mock.results[0]?.value;
      expect(innerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant',
          projectId: 'test-project',
          conversationId: 'test-context',
          role: 'agent',
          content: {
            text: 'Test message',
          },
          visibility: 'external',
          messageType: 'a2a-request',
          fromSubAgentId: 'test-calling-agent',
          toExternalAgentId: 'external-agent',
        })
      );
    });

    it('should save external delegation response with external visibility', async () => {
      const mockResponse = { result: 'external response', error: null };
      mockSendMessage.mockResolvedValue(mockResponse);

      const tool = createDelegateToAgentTool(getExternalDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }
      await tool.execute({ message: 'Test message' }, mockToolCallOptions);

      expect(vi.mocked(saveA2AMessageResponse)).toHaveBeenCalledWith(mockResponse, {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        conversationId: 'test-context',
        messageType: 'a2a-response',
        visibility: 'external',
        toSubAgentId: 'test-calling-agent',
        fromExternalAgentId: 'external-agent',
      });
    });

    it('should handle A2A client errors in external delegation', async () => {
      const errorResponse = {
        result: null,
        error: { message: 'External agent connection failed', code: 503 },
      };
      mockSendMessage.mockResolvedValue(errorResponse);

      const tool = createDelegateToAgentTool(getExternalDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }
      await expect(tool.execute({ message: 'Test message' }, mockToolCallOptions)).rejects.toThrow(
        'External agent connection failed'
      );
    });

    it('should handle network errors in external delegation', async () => {
      mockSendMessage.mockRejectedValue(new Error('Network timeout'));

      const tool = createDelegateToAgentTool(getExternalDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }
      await expect(tool.execute({ message: 'Test message' }, mockToolCallOptions)).rejects.toThrow(
        'Network timeout'
      );
    });

    it('should execute internal delegation with proper message structure', async () => {
      mockSendMessage.mockResolvedValue({ result: 'internal success', error: null });

      const tool = createDelegateToAgentTool(getDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }

      const result = await tool.execute(
        { message: 'Test internal delegation message' },
        mockToolCallOptions
      );

      // Assert that result is not an AsyncIterable
      const syncResult = result as { toolCallId: any; result: any };

      expect(syncResult.result).toBe('internal success');
      expect(syncResult.toolCallId).toBe('test-tool-call-id');

      // Verify A2A client was called with correct internal agent URL
      expect(mockSendMessage).toHaveBeenCalledWith({
        message: {
          role: 'agent',
          parts: [{ text: 'Test internal delegation message', kind: 'text' }],
          messageId: 'test-nanoid-123',
          kind: 'message',
          contextId: 'test-context',
          metadata: {
            conversationId: 'test-conversation',
            threadId: 'test-thread',
            apiKey: 'test-api-key',
            fromSubAgentId: 'test-calling-agent',
            isDelegation: true,
            delegationId: 'del_test-nanoid-123',
          },
        },
      });
    });

    it('should record outgoing internal delegation message with internal visibility', async () => {
      mockSendMessage.mockResolvedValue({ result: 'success', error: null });

      const tool = createDelegateToAgentTool(getDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }
      await tool.execute({ message: 'Test message' }, mockToolCallOptions);

      // Verify createMessage was called with database client
      expect(createMessageMock).toHaveBeenCalledWith(expect.anything());

      // Verify the inner function was called with the message data
      const innerMock = createMessageMock.mock.results[0]?.value;
      expect(innerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant',
          projectId: 'test-project',
          conversationId: 'test-context',
          role: 'agent',
          content: {
            text: 'Test message',
          },
          visibility: 'internal',
          messageType: 'a2a-request',
          fromSubAgentId: 'test-calling-agent',
          toSubAgentId: 'target-agent',
        })
      );
    });
  });

  describe('Tool Integration', () => {
    it('should create both transfer and delegate tools for the same agent', () => {
      // Create both tools for the same agent
      const transferTool = createTransferToAgentTool({
        transferConfig: mockAgentConfig,
        callingAgentId: 'test-agent',
      });
      const delegateTool = createDelegateToAgentTool(getDelegateParams());

      // Both tools should be created successfully
      expect(transferTool.description).toContain('target-agent');
      expect(delegateTool.description).toContain('target-agent');

      // They should have the same target agent
      expect(transferTool.description).toContain(mockAgentConfig.id);
      expect(delegateTool.description).toContain(mockAgentConfig.id);
    });

    it('should create tools for multiple different agents', () => {
      const agent1 = { ...mockAgentConfig, id: 'agent-1' };
      const agent2 = { ...mockAgentConfig, id: 'agent-2' };

      const tool1 = createTransferToAgentTool({
        transferConfig: agent1,
        callingAgentId: 'test-agent',
      });
      const tool2 = createTransferToAgentTool({
        transferConfig: agent2,
        callingAgentId: 'test-agent',
      });

      expect(tool1.description).toContain('agent-1');
      expect(tool2.description).toContain('agent-2');

      // Tools should be independent
      expect(tool1.description).not.toContain('agent-2');
      expect(tool2.description).not.toContain('agent-1');
    });

    it('should create all three types of tools (transfer, delegate, external delegate)', () => {
      const transferTool = createTransferToAgentTool({
        transferConfig: mockAgentConfig,
        callingAgentId: 'test-agent',
      });

      const delegateTool = createDelegateToAgentTool(getDelegateParams());

      const externalDelegateTool = createDelegateToAgentTool(getExternalDelegateParams());

      // All tools should be created successfully
      expect(transferTool.description).toContain(
        'This tool immediately transfers conversation control to agent'
      );
      expect(delegateTool.description).toContain('Delegate a specific task to');
      expect(externalDelegateTool.description).toContain('Delegate a specific task to');

      // Each tool should have the correct structure
      for (const tool of [transferTool, delegateTool, externalDelegateTool]) {
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('execute');
        expect(typeof tool.execute).toBe('function');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed agent configurations gracefully', () => {
      const malformedConfig = {
        id: null,
        name: undefined,
      } as any;

      // Should not throw during tool creation
      expect(() =>
        createTransferToAgentTool({
          transferConfig: malformedConfig,
          callingAgentId: 'test-agent',
        })
      ).not.toThrow();

      const tool = createTransferToAgentTool({
        transferConfig: malformedConfig,
        callingAgentId: 'test-agent',
      });
      expect(tool).toHaveProperty('description');
    });

    it('should handle missing environment variables', () => {
      // Even if env is missing/malformed, tool creation should work
      const tool = createDelegateToAgentTool(getDelegateParams());

      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('execute');
    });
  });

  describe('Team Delegation JWT Regeneration', () => {
    it('should generate fresh JWT for internal delegation in team delegation context', async () => {
      mockExecutionContext = createMockExecutionContext();
      mockExecutionContext.metadata = { teamDelegation: true };

      mockSendMessage.mockResolvedValue({ result: 'team delegation success', error: null });

      const tool = createDelegateToAgentTool(getDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }

      await tool.execute({ message: 'Team delegation test' }, mockToolCallOptions);

      // Verify generateServiceToken was called to create a fresh JWT for the target sub-agent
      expect(vi.mocked(generateServiceToken)).toHaveBeenCalledWith({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        originAgentId: 'test-agent',
        targetAgentId: 'target-agent',
      });

      // Verify A2AClient was constructed with the fresh JWT, not the inherited apiKey
      expect(vi.mocked(A2AClient)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-service-token',
          }),
        })
      );
    });

    it('should use inherited apiKey for internal delegation when NOT in team delegation context', async () => {
      mockExecutionContext = createMockExecutionContext();
      // No teamDelegation metadata

      mockSendMessage.mockResolvedValue({ result: 'normal delegation success', error: null });

      const tool = createDelegateToAgentTool(getDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }

      await tool.execute({ message: 'Normal delegation test' }, mockToolCallOptions);

      // generateServiceToken should NOT be called for non-team delegation
      expect(vi.mocked(generateServiceToken)).not.toHaveBeenCalled();

      // A2AClient should use the original metadata.apiKey
      expect(vi.mocked(A2AClient)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should include correct routing headers in team delegation context', async () => {
      mockExecutionContext = createMockExecutionContext();
      mockExecutionContext.metadata = { teamDelegation: true };

      mockSendMessage.mockResolvedValue({ result: 'success', error: null });

      const tool = createDelegateToAgentTool(getDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }

      await tool.execute({ message: 'Header test' }, mockToolCallOptions);

      expect(vi.mocked(A2AClient)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-inkeep-tenant-id': 'test-tenant',
            'x-inkeep-project-id': 'test-project',
            'x-inkeep-agent-id': 'test-agent',
            'x-inkeep-sub-agent-id': 'target-agent',
          }),
        })
      );
    });
  });
});
