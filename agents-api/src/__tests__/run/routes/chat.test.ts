import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as execModule from '../../../domains/run/handlers/executionHandler';
import { makeRequest } from '../../utils/testRequest';

// Mock context exports used by the chat route (routes/chat.ts imports from ../context)
vi.mock('../../../domains/run/context', () => ({
  handleContextResolution: vi.fn().mockResolvedValue({}),
  contextValidationMiddleware: vi.fn().mockImplementation(async (c: any, next: any) => {
    c.set('validatedContext', {
      agentId: 'test-agent',
      tenantId: 'test-tenant',
      projectId: 'default',
    });
    await next();
  }),
}));

// Mock Management API calls used by projectConfigMiddleware so tests don't hit network
const getFullProjectMock = vi.fn();

// Mock @inkeep/agents-core functions that are used by the chat routes
// This mock is merged with the one below

// We'll mock the ExecutionHandler prototype in beforeEach like the working test

// Remove the old conversations mock since functions moved to @inkeep/agents-core

// Logger mock is now in setup.ts globally

vi.mock('../../data/threads.js', () => ({
  getActiveAgentForThread: vi.fn().mockResolvedValue(null),
  setActiveAgentForThread: vi.fn(),
}));

// Mock database client with required methods
vi.mock('../../data/db/dbClient', () => {
  const mockDbClient = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    // Add $client property so getPoolFromClient returns null (which triggers the fallback)
    $client: null,
  };
  return {
    default: mockDbClient,
  };
});

vi.mock('../../data/db/dbClient.js', () => {
  const mockDbClient = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    $client: null,
  };
  return {
    default: mockDbClient,
  };
});

vi.mock('../../../domains/run/utils/stream-helpers.js', () => ({
  createSSEStreamHelper: vi.fn().mockReturnValue({
    writeRole: vi.fn().mockResolvedValue(undefined),
    writeContent: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    writeError: vi.fn().mockResolvedValue(undefined),
    writeData: vi.fn().mockResolvedValue(undefined),
    writeOperation: vi.fn().mockResolvedValue(undefined),
    writeSummary: vi.fn().mockResolvedValue(undefined),
    streamText: vi.fn().mockResolvedValue(undefined),
    streamData: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../domains/run/utils/stream-helpers', () => ({
  createSSEStreamHelper: vi.fn().mockReturnValue({
    writeRole: vi.fn().mockResolvedValue(undefined),
    writeContent: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    writeError: vi.fn().mockResolvedValue(undefined),
    writeData: vi.fn().mockResolvedValue(undefined),
    writeOperation: vi.fn().mockResolvedValue(undefined),
    writeSummary: vi.fn().mockResolvedValue(undefined),
    streamText: vi.fn().mockResolvedValue(undefined),
    streamData: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    // projectConfigMiddleware now loads project config via withRef + getFullProjectWithRelationIds
    withRef: vi.fn(async (_pool: any, _resolvedRef: any, fn: any) => await fn({})),
    getFullProjectWithRelationIds: vi.fn(() => vi.fn().mockImplementation(getFullProjectMock)),
    createOrGetConversation: vi.fn().mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'conv-123',
        tenantId: 'test-tenant',
        activeSubAgentId: 'default-agent',
      })
    ),
    createMessage: vi.fn().mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'msg-123',
        tenantId: 'test-tenant',
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'test message' },
      })
    ),
    getActiveAgentForConversation: vi.fn().mockReturnValue(
      vi.fn().mockResolvedValue({
        activeSubAgentId: 'default-agent',
      })
    ),
    setActiveAgentForConversation: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
  };
});

// Mock opentelemetry
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: vi.fn().mockReturnValue({
      setAttributes: vi.fn(),
      addEvent: vi.fn(),
    }),
    getTracerProvider: vi.fn().mockReturnValue({
      addSpanProcessor: vi.fn(),
    }),
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

describe('Chat Routes', () => {
  beforeEach(async () => {
    // Ensure ENVIRONMENT is set to 'test' so branchScopedDbMiddleware uses the simple path
    process.env.ENVIRONMENT = 'test';
    // Don't use clearAllMocks as it clears the initial vi.mock() setup
    // Instead, just reset the specific mocks we need
    getFullProjectMock.mockResolvedValue({
      id: 'default',
      tenantId: 'test-tenant',
      name: 'Test Project',
      agents: {
        'test-agent': {
          id: 'test-agent',
          tenantId: 'test-tenant',
          projectId: 'default',
          name: 'Test Agent',
          description: 'Test agent description',
          defaultSubAgentId: 'default-agent',
          subAgents: {
            'default-agent': {
              id: 'default-agent',
              tenantId: 'test-tenant',
              projectId: 'default',
              name: 'Default Agent',
              description: 'A helpful assistant',
              prompt: 'You are a helpful assistant.',
              canUse: [],
              canTransferTo: [],
              canDelegateTo: [],
              dataComponents: [],
              artifactComponents: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
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
    });

    // Mock ExecutionHandler.prototype.execute like the working dataChat test
    vi.spyOn(execModule.ExecutionHandler.prototype, 'execute').mockImplementation(
      async (args: any) => {
        if (args.sseHelper) {
          await args.sseHelper.writeRole();
          await args.sseHelper.writeContent('Hello! How can I help you?');
          await args.sseHelper.complete(); // Need to complete the stream
        }
        return { success: true, iterations: 1 } as any;
      }
    );
  });

  describe('POST /chat/completions', () => {
    it('should handle basic chat completion', async () => {
      const response = await makeRequest('/run/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'Hello, how are you?' }],
          conversationId: 'conv-123',
        }),
      });

      if (response.status !== 200) {
        const errorText = await response.text();
        console.error('Request failed:', { status: response.status, error: errorText });
      }
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
    });

    it('should handle streaming chat completion', async () => {
      const response = await makeRequest('/run/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'Stream this response' }],
          conversationId: 'conv-123',
          stream: true,
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
    });

    it('should handle conversation creation', async () => {
      const response = await makeRequest('/run/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'Start new conversation' }],
        }),
      });

      expect(response.status).toBe(200);

      const { createOrGetConversation } = await import('@inkeep/agents-core');
      // For curried functions, we need to check if the first part was called with dbClient
      expect(createOrGetConversation).toHaveBeenCalled();
      // And that the returned function was called with the actual parameters
      expect(vi.mocked(createOrGetConversation).mock.results[0].value).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant',
        })
      );
    });

    it('should validate required fields', async () => {
      const response = await makeRequest('/run/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          // Missing required 'model' field to trigger validation error
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toBeDefined();
    });

    it('should handle missing agent', async () => {
      getFullProjectMock.mockResolvedValueOnce({
        id: 'default',
        tenantId: 'test-tenant',
        name: 'Test Project',
        agents: {},
        tools: {},
        functions: {},
        dataComponents: {},
        artifactComponents: {},
        externalAgents: {},
        credentialReferences: {},
        statusUpdates: null,
      });

      const response = await makeRequest('/run/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(response.status).toBe(404);
    });

    // Additional tests can be added here for specific functionality
  });

  describe('Error Handling', () => {
    it('should handle execution errors', async () => {
      // Override the spy for this specific test
      vi.spyOn(execModule.ExecutionHandler.prototype, 'execute').mockRejectedValueOnce(
        new Error('Execution failed')
      );

      const response = await makeRequest('/run/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'This will fail' }],
        }),
      });

      // For streaming responses, the status is set before execution starts
      // So even if execution fails, the response will have started with 200
      // The error handling should be in the stream content, not the status code
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
    });
  });
});
