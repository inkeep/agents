import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionHandler } from '../../handlers/executionHandler';

// Hoisted mocks for @inkeep/agents-core functions
const {
  createTaskMock,
  getTaskMock,
  updateTaskMock,
  createMessageMock,
  getActiveAgentForConversationMock,
  getFullAgentMock,
} = vi.hoisted(() => {
  const createTaskMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'task-123',
      tenantId: 'test-tenant',
      metadata: { conversation_id: 'conv-123' },
    })
  );
  const getTaskMock = vi.fn(() => vi.fn().mockResolvedValue(null)); // No existing task
  const updateTaskMock = vi.fn(() => vi.fn().mockResolvedValue({}));
  const createMessageMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'msg-123',
      role: 'agent',
      content: { text: 'Hello! How can I help you?' },
    })
  );
  const getActiveAgentForConversationMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      activeSubAgentId: 'default-agent',
      conversationId: 'conv-123',
    })
  );
  const getFullAgentMock = vi.fn(() =>
    vi.fn().mockResolvedValue({
      agents: [],
      relations: [],
    })
  );
  return {
    createTaskMock,
    getTaskMock,
    updateTaskMock,
    createMessageMock,
    getActiveAgentForConversationMock,
    getFullAgentMock,
  };
});

// Mock @inkeep/agents-core
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    createTask: createTaskMock,
    getTask: getTaskMock,
    updateTask: updateTaskMock,
    createMessage: createMessageMock,
    getActiveAgentForConversation: getActiveAgentForConversationMock,
    getFullAgent: getFullAgentMock,
    getTracer: vi.fn(() => ({
      startActiveSpan: vi.fn((_name, options, fn) => {
        // Handle both 2 and 3 argument versions
        const callback = typeof options === 'function' ? options : fn;
        return callback({
          setAttributes: vi.fn(),
          setStatus: vi.fn(),
          end: vi.fn(),
        });
      }),
      startSpan: vi.fn(() => ({
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      })),
    })),
    setSpanWithError: vi.fn(),
  };
});

// Mock database client
vi.mock('../../data/db/dbClient.js', () => ({
  default: {},
}));

vi.mock('../../data/conversations.js', () => ({
  // Keep for any local functions still used
  saveA2AMessageResponse: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../a2a/client.js', () => ({
  A2AClient: vi.fn().mockImplementation(
    () =>
      ({
        sendMessage: vi.fn().mockResolvedValue({
          result: {
            artifacts: [
              {
                parts: [
                  {
                    kind: 'text',
                    text: 'Hello! How can I help you?',
                  },
                ],
              },
            ],
          },
        }),
        getAgentCard: vi.fn().mockResolvedValue({
          capabilities: { streaming: true },
        }),
      }) as any
  ),
}));

vi.mock('../../a2a/transfer.js', () => ({
  isTransferResponse: vi.fn().mockReturnValue(false),
  executeTransfer: vi.fn().mockResolvedValue({
    success: true,
    targetSubAgentId: 'transfer-target',
  }),
}));

vi.mock('../../utils/stream-registry.js', () => ({
  registerStreamHelper: vi.fn(),
  unregisterStreamHelper: vi.fn(),
}));

vi.mock('../../utils/agent-session.js', () => ({
  agentSessionManager: {
    createSession: vi.fn(),
    endSession: vi.fn(),
    getSession: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../../utils/tracer.js', () => ({
  tracer: {
    startActiveSpan: vi.fn((_name, options, fn) => {
      // Handle both 2 and 3 argument versions
      const callback = typeof options === 'function' ? options : fn;
      return callback({
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      });
    }),
    startSpan: vi.fn(() => ({
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    })),
  },
}));

vi.mock('../../env.js', async (importOriginal) => {
  return {
    env: {
      AGENT_BASE_URL: 'http://localhost:3002',
    },
  };
});

vi.mock('../../logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  // Make child return itself for chaining
  mockLogger.child.mockReturnValue(mockLogger);

  return {
    getLogger: () => mockLogger,
  };
});

describe('Integration Tests', () => {
  describe('ExecutionHandler', () => {
    let executionHandler: ExecutionHandler;
    let mockStreamHelper: any;

    // Helper to create test execution context
    const createTestExecutionContext = async () => {
      const { createExecutionContext } = await import('../../types/execution-context.js');
      return createExecutionContext({
        apiKey: 'test-api-key',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        apiKeyId: 'test-key',
        baseUrl: 'http://localhost:3003',
      });
    };

    beforeEach(() => {
      vi.clearAllMocks();
      executionHandler = new ExecutionHandler();

      // Create mock StreamHelper
      mockStreamHelper = {
        writeOperation: vi.fn().mockResolvedValue(undefined),
        writeSummary: vi.fn().mockResolvedValue(undefined),
        writeData: vi.fn().mockResolvedValue(undefined),
        streamText: vi.fn().mockResolvedValue(undefined),
        writeError: vi.fn().mockResolvedValue(undefined),
        complete: vi.fn().mockResolvedValue(undefined), // Add missing complete method
      };
    });

    it.skip('should handle basic message execution flow', async () => {
      const executionContext = await createTestExecutionContext();

      const params = {
        executionContext,
        dbClient: {} as any,
        conversationId: 'conv-123',
        userMessage: 'Hello',
        initialAgentId: 'default-agent',
        requestId: 'req-123',
        sseHelper: mockStreamHelper,
      };

      const result = await executionHandler.execute(params);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.iterations).toBeGreaterThan(0);

      // Verify A2A client was called
      const { A2AClient } = await import('../../a2a/client.js');
      expect(A2AClient).toHaveBeenCalled();

      // Verify message was added to conversation
      expect(createMessageMock).toHaveBeenCalled();
    });

    it.skip('should handle agent transfer scenarios', async () => {
      // Mock transfer response from A2A client
      const { A2AClient } = await import('../../a2a/client.js');
      const mockSendMessage = vi
        .fn()
        .mockResolvedValueOnce({
          // First call returns transfer response
          result: {
            artifacts: [
              {
                parts: [
                  {
                    kind: 'data',
                    data: {
                      targetSubAgentId: 'support-agent',
                    },
                  },
                  {
                    kind: 'text',
                    text: 'Customer needs support',
                  },
                ],
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          // Second call (after transfer) returns completion
          result: {
            artifacts: [
              {
                parts: [
                  {
                    kind: 'text',
                    text: 'Hello! I can help you with your order.',
                  },
                ],
              },
            ],
          },
        });

      vi.mocked(A2AClient).mockImplementation(
        () =>
          ({
            sendMessage: mockSendMessage,
            getAgentCard: vi.fn().mockResolvedValue({ capabilities: { streaming: true } }),
          }) as any
      );

      // Mock transfer detection
      const { isTransferResponse } = await import('../../a2a/transfer.js');
      vi.mocked(isTransferResponse)
        .mockReturnValueOnce(true) // First response is transfer
        .mockReturnValueOnce(false); // Second response is completion

      const executionContext = await createTestExecutionContext();
      const params = {
        executionContext,
        dbClient: {} as any,
        conversationId: 'conv-transfer',
        userMessage: 'I need help with my order',
        initialAgentId: 'router-agent',
        requestId: 'req-transfer',
        sseHelper: mockStreamHelper,
      };

      const result = await executionHandler.execute(params);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.iterations).toBeGreaterThan(1); // Should have multiple iterations for transfer

      // Verify transfer was executed
      const { executeTransfer } = await import('../../a2a/transfer.js');
      expect(executeTransfer).toHaveBeenCalled();
    });

    it.skip('should handle conversation context and history', async () => {
      // Ensure proper A2A mock for this test
      const { A2AClient } = await import('../../a2a/client.js');
      const mockSendMessage = vi.fn().mockResolvedValue({
        result: {
          artifacts: [
            {
              parts: [
                {
                  kind: 'text',
                  text: 'You mentioned you like pizza!',
                },
              ],
            },
          ],
        },
      });

      vi.mocked(A2AClient).mockImplementation(
        () =>
          ({
            sendMessage: mockSendMessage,
            getAgentCard: vi.fn().mockResolvedValue({ capabilities: { streaming: true } }),
          }) as any
      );

      const executionContext = await createTestExecutionContext();
      const params = {
        executionContext,
        dbClient: {} as any,
        conversationId: 'conv-context',
        userMessage: 'What do I like?',
        initialAgentId: 'context-agent',
        requestId: 'req-context',
        sseHelper: mockStreamHelper,
      };

      const result = await executionHandler.execute(params);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      // Verify that A2A message included proper context
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            contextId: 'conv-context',
            parts: expect.arrayContaining([
              expect.objectContaining({
                kind: 'text',
                text: 'What do I like?',
              }),
            ]),
          }),
        })
      );
    });

    it.skip('should handle tool execution requests', async () => {
      // Mock A2A response with tool execution result
      const { A2AClient } = await import('../../a2a/client.js');
      vi.mocked(A2AClient).mockImplementation(
        () =>
          ({
            sendMessage: vi.fn().mockResolvedValue({
              result: {
                artifacts: [
                  {
                    parts: [
                      {
                        kind: 'text',
                        text: 'I calculated that for you: ',
                      },
                      {
                        kind: 'data',
                        data: {
                          type: 'tool_result',
                          name: 'calculator',
                          result: '4',
                        },
                      },
                    ],
                  },
                ],
              },
            }),
            getAgentCard: vi.fn().mockResolvedValue({ capabilities: { streaming: true } }),
          }) as any
      );

      const executionContext = await createTestExecutionContext();
      const params = {
        executionContext,
        dbClient: {} as any,
        conversationId: 'conv-tools',
        userMessage: 'What is 2+2?',
        initialAgentId: 'tool-agent',
        requestId: 'req-tools',
        sseHelper: mockStreamHelper,
      };

      const result = await executionHandler.execute(params);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      // Verify that completion operation was streamed
      expect(mockStreamHelper.writeOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'completion',
        })
      );
    });

    it.skip('should handle error scenarios gracefully', async () => {
      // Mock A2A client to throw an error
      const { A2AClient } = await import('../../a2a/client.js');
      vi.mocked(A2AClient).mockImplementation(
        () =>
          ({
            sendMessage: vi.fn().mockRejectedValue(new Error('Agent communication failed')),
            getAgentCard: vi.fn().mockResolvedValue({ capabilities: { streaming: true } }),
          }) as any
      );

      const executionContext = await createTestExecutionContext();
      const params = {
        executionContext,
        dbClient: {} as any,
        conversationId: 'conv-error',
        userMessage: 'This will cause an error',
        initialAgentId: 'faulty-agent',
        requestId: 'req-error',
        sseHelper: mockStreamHelper,
      };

      const result = await executionHandler.execute(params);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent communication failed');

      // Verify error was streamed to client via operation event
      expect(mockStreamHelper.writeOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('Agent communication failed'),
        })
      );

      // Verify task was marked as failed
      expect(updateTaskMock).toHaveBeenCalled();
      const updateTaskCall = updateTaskMock.mock.results[0]?.value;
      expect(updateTaskCall).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
          }),
        })
      );
    });
  });
});
