import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the ai package's tool function - must be before imports
vi.mock('ai', () => ({
  tool: (config: any) => ({
    ...config,
    execute: config.execute,
  }),
}));

import type { AgentConfig, ExternalAgentRelationConfig } from '../../agents/Agent';
import { createDelegateToAgentTool, createTransferToAgentTool } from '../../agents/relationTools';
import { saveA2AMessageResponse } from '../../data/conversations';

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
  };
});

// Mock database client
vi.mock('../../data/db/dbClient.js', () => ({
  default: {},
}));

// Credentials moved to @inkeep/agents-core, mocked above

// Mock the A2AClient
const mockSendMessage = vi.fn().mockResolvedValue({ result: 'success', error: null });

vi.mock('../../a2a/client.js', () => ({
  A2AClient: vi.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
  })),
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

// Mock the env
vi.mock('../../env.js', () => ({
  env: {
    AGENT_BASE_URL: 'http://localhost:3000',
  },
}));

// Mock generateId
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    generateId: () => 'test-nanoid-123',
  };
});

// Mock conversations functions (saveA2AMessageResponse is still in local file)
vi.mock('../../data/conversations.js', () => ({
  saveA2AMessageResponse: vi.fn().mockResolvedValue({ id: 'mock-response-message-id' }),
}));

// Mock agent operations
vi.mock('../../utils/agent-operations.js', () => ({
  delegationOp: vi.fn(),
}));

// Mock stream registry
vi.mock('../../utils/stream-registry.js', () => ({
  getStreamHelper: vi.fn(),
}));

// Mock the server files to prevent loading heavy server infrastructure
vi.mock('../../server.js', () => ({
  executionServer: {
    credentialStores: [],
    getLogger: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

// Mock the session managers to prevent loading heavy dependencies
vi.mock('../../utils/agent-session.js', () => ({
  agentSessionManager: {
    getSession: vi.fn(),
    createSession: vi.fn(),
  },
}));

vi.mock('../../agents/ToolSessionManager.js', () => ({
  toolSessionManager: {
    getSession: vi.fn(),
    createSession: vi.fn(),
  },
}));

describe('Relationship Tools', () => {
  let mockAgentConfig: AgentConfig;
  let mockExternalAgentConfig: ExternalAgentRelationConfig;
  let _mockSendMessageInstance: any;
  let mockCredentialStoreRegistry: any;

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
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentId: 'test-agent',
    contextId: 'test-context',
    metadata: {
      conversationId: 'test-conversation',
      threadId: 'test-thread',
    },
    subAgent: {
      getStreamingHelper: vi.fn().mockReturnValue(undefined),
    },
  });

  const getExternalDelegateParams = (config?: Partial<ExternalAgentRelationConfig>) => ({
    delegateConfig: {
      type: 'external' as const,
      config: { ...mockExternalAgentConfig, ...config },
    },
    callingAgentId: 'test-calling-agent',
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentId: 'test-agent',
    contextId: 'test-context',
    metadata: {
      conversationId: 'test-conversation',
      threadId: 'test-thread',
    },
    subAgent: {
      getStreamingHelper: vi.fn().mockReturnValue(undefined),
    },
    get credentialStoreRegistry() {
      return mockCredentialStoreRegistry;
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();

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
      dbClient: {} as any,
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
      dbClient: {} as any,
      baseUrl: 'http://external-agent.example.com',
      relationId: 'test-relation-id',
      relationType: 'test-relation-type',
    };
  });

  describe('createTransferToAgentTool', () => {
    it.skip('should create a transfer tool with correct description', () => {
      const tool = createTransferToAgentTool({
        transferConfig: mockAgentConfig,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });

      expect(tool.description).toContain('Hand off the conversation to agent target-agent');
    });

    it.skip('should have proper tool structure', () => {
      const tool = createTransferToAgentTool({
        transferConfig: mockAgentConfig,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });

      // Verify tool structure
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool).toHaveProperty('execute');
      expect(typeof tool.execute).toBe('function');
    });

    it.skip('should work with different agent configurations', () => {
      const differentAgentConfig: AgentConfig = {
        ...mockAgentConfig,
        id: 'refund-agent',
        name: 'Refund Agent',
      };

      const tool = createTransferToAgentTool({
        transferConfig: differentAgentConfig,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });

      expect(tool.description).toContain('Hand off the conversation to agent refund-agent');
    });

    it.skip('should handle agent IDs with special characters', () => {
      const specialAgentConfig: AgentConfig = {
        ...mockAgentConfig,
        id: 'customer-support-agent-v2',
      };

      const tool = createTransferToAgentTool({
        transferConfig: specialAgentConfig,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });

      expect(tool.description).toContain(
        'Hand off the conversation to agent customer-support-agent-v2'
      );
    });

    it.skip('should handle invalid agent configuration', () => {
      const invalidAgentConfig = {
        ...mockAgentConfig,
        id: '', // Empty ID
      };

      const tool = createTransferToAgentTool({
        transferConfig: invalidAgentConfig,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });

      expect(tool.description).toContain('Hand off the conversation to agent ');
    });

    it.skip('should handle undefined agent config properties', () => {
      const partialAgentConfig = {
        id: 'test-agent',
      } as AgentConfig;

      const tool = createTransferToAgentTool({
        transferConfig: partialAgentConfig,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });

      expect(tool.description).toContain('Hand off the conversation to agent test-agent');
    });
  });

  describe('Unified createDelegateToAgentTool', () => {
    it.skip('should create internal delegation tool when type is internal', () => {
      const tool = createDelegateToAgentTool(getDelegateParams());

      expect(tool.description).toContain('Delegate a specific task to another agent');
    });

    it.skip('should create external delegation tool when type is external', () => {
      const tool = createDelegateToAgentTool(getExternalDelegateParams());

      expect(tool.description).toContain('Delegate a specific task to another agent');
    });

    it.skip('should handle different agent configurations for internal delegation', () => {
      const customAgentConfig = {
        ...mockAgentConfig,
        id: 'custom-agent',
        name: 'Custom Agent',
      };

      const tool = createDelegateToAgentTool(getDelegateParams(customAgentConfig));

      expect(tool.description).toContain('Delegate a specific task to another agent');
    });

    it.skip('should handle different external agent configurations', () => {
      const customExternalAgent = {
        id: 'custom-external',
        name: 'Custom External Agent',
        description: 'A custom external agent',
        baseUrl: 'https://custom-external.com',
      };

      const tool = createDelegateToAgentTool(getExternalDelegateParams(customExternalAgent));

      expect(tool.description).toContain('Delegate a specific task to another agent');
    });

    it.skip('should have consistent tool structure for both internal and external delegation', () => {
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

    it.skip('should execute external delegation with proper message structure', async () => {
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
            fromExternalAgentId: 'test-calling-agent',
            isDelegation: true,
            delegationId: 'del_test-nanoid-123',
          },
        },
      });
    });

    it.skip('should record outgoing external delegation message with external visibility', async () => {
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

    it.skip('should save external delegation response with external visibility', async () => {
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

    it.skip('should handle A2A client errors in external delegation', async () => {
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

    it.skip('should handle network errors in external delegation', async () => {
      mockSendMessage.mockRejectedValue(new Error('Network timeout'));

      const tool = createDelegateToAgentTool(getExternalDelegateParams());

      if (!tool.execute) {
        throw new Error('Tool execute method is undefined');
      }
      await expect(tool.execute({ message: 'Test message' }, mockToolCallOptions)).rejects.toThrow(
        'Network timeout'
      );
    });

    it.skip('should execute internal delegation with proper message structure', async () => {
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
            fromSubAgentId: 'test-calling-agent',
            isDelegation: true,
            delegationId: 'del_test-nanoid-123',
          },
        },
      });
    });

    it.skip('should record outgoing internal delegation message with internal visibility', async () => {
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
    it.skip('should create both transfer and delegate tools for the same agent', () => {
      // Create both tools for the same agent
      const transferTool = createTransferToAgentTool({
        transferConfig: mockAgentConfig,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });
      const delegateTool = createDelegateToAgentTool(getDelegateParams());

      // Both tools should be created successfully
      expect(transferTool.description).toContain('target-agent');
      expect(delegateTool.description).toContain('target-agent');

      // They should have the same target agent
      expect(transferTool.description).toContain(mockAgentConfig.id);
      expect(delegateTool.description).toContain(mockAgentConfig.id);
    });

    it.skip('should create tools for multiple different agents', () => {
      const agent1 = { ...mockAgentConfig, id: 'agent-1' };
      const agent2 = { ...mockAgentConfig, id: 'agent-2' };

      const tool1 = createTransferToAgentTool({
        transferConfig: agent1,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });
      const tool2 = createTransferToAgentTool({
        transferConfig: agent2,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });

      expect(tool1.description).toContain('agent-1');
      expect(tool2.description).toContain('agent-2');

      // Tools should be independent
      expect(tool1.description).not.toContain('agent-2');
      expect(tool2.description).not.toContain('agent-1');
    });

    it.skip('should create all three types of tools (transfer, delegate, external delegate)', () => {
      const transferTool = createTransferToAgentTool({
        transferConfig: mockAgentConfig,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });

      const delegateTool = createDelegateToAgentTool(getDelegateParams());

      const externalDelegateTool = createDelegateToAgentTool(getExternalDelegateParams());

      // All tools should be created successfully
      expect(transferTool.description).toContain('Hand off the conversation to');
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
    it.skip('should handle malformed agent configurations gracefully', () => {
      const malformedConfig = {
        id: null,
        name: undefined,
      } as any;

      // Should not throw during tool creation
      expect(() =>
        createTransferToAgentTool({
          transferConfig: malformedConfig,
          callingAgentId: 'test-agent',
          subAgent: {
            getStreamingHelper: vi.fn().mockReturnValue(undefined),
          },
        })
      ).not.toThrow();

      const tool = createTransferToAgentTool({
        transferConfig: malformedConfig,
        callingAgentId: 'test-agent',
        subAgent: {
          getStreamingHelper: vi.fn().mockReturnValue(undefined),
        },
      });
      expect(tool).toHaveProperty('description');
    });

    it.skip('should handle missing environment variables', () => {
      // Even if env is missing/malformed, tool creation should work
      const tool = createDelegateToAgentTool(getDelegateParams());

      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('execute');
    });
  });
});
