import { TaskState } from '@inkeep/agents-core';
import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { a2aHandler } from '../../a2a/handlers';
import type { A2ATaskResult, JsonRpcRequest, RegisteredAgent } from '../../a2a/types';

// Setup mocks with vi.hoisted to ensure they're available before imports
const { createMessageMock, createTaskMock, updateTaskMock } = vi.hoisted(() => {
  const createMessageMock = vi.fn(() => vi.fn().mockResolvedValue({ id: 'msg-123' }));
  const createTaskMock = vi.fn(() =>
    vi.fn().mockResolvedValue({ id: 'task-123', status: 'working' })
  );
  const updateTaskMock = vi.fn(() =>
    vi.fn().mockResolvedValue({ id: 'task-123', status: 'completed' })
  );
  return { createMessageMock, createTaskMock, updateTaskMock };
});

// Mock dependencies
vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual('@inkeep/agents-core');
  return {
    ...actual,
    createMessage: createMessageMock,
    createTask: createTaskMock,
    updateTask: updateTaskMock,
  };
});

// Mock the database client to prevent circular imports
vi.mock('../../data/db/dbClient.js', () => ({
  default: {},
}));

vi.mock('../../logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('A2A Handlers', () => {
  let mockAgent: RegisteredAgent;
  let mockContext: Context;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock execution context
    const mockExecutionContext = {
      apiKey: 'test-api-key',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentId: 'test-agent',
      apiKeyId: 'test-key',
      baseUrl: 'http://localhost:3003',
      subAgentId: 'test-agent',
    };

    // Mock context with proper get/set methods
    const contextData = new Map();
    contextData.set('executionContext', mockExecutionContext);
    contextData.set('db', {}); // Mock dbClient

    mockContext = {
      req: {
        json: vi.fn(),
        param: vi.fn().mockReturnValue('test-agent'),
      },
      json: vi.fn().mockImplementation((data) => new Response(JSON.stringify(data))),
      text: vi.fn().mockImplementation((text) => new Response(text)),
      get: vi.fn().mockImplementation((key) => {
        if (key === 'executionContext') {
          return mockExecutionContext;
        }
        return contextData.get(key);
      }),
      set: vi.fn().mockImplementation((key, value) => {
        contextData.set(key, value);
      }),
    } as any;

    // Mock registered agent
    mockAgent = {
      subAgentId: 'test-agent',
      tenantId: 'test-tenant',
      agentCard: {
        capabilities: {
          streaming: true,
          transfer: true,
          delegation: true,
        },
      },
      taskHandler: vi.fn(),
    } as any;
  });

  describe('JSON-RPC Request Validation', () => {
    it('should reject non-2.0 JSON-RPC requests', async () => {
      const invalidRequest = {
        jsonrpc: '1.0',
        method: 'message/send',
        id: 'test-id',
        params: {},
      };

      mockContext.set('requestBody', invalidRequest);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request - must be JSON-RPC 2.0',
        },
        id: 'test-id',
      });
    });

    it('should reject unknown methods', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'unknown/method',
        id: 'test-id',
        params: {},
      };

      mockContext.set('requestBody', request);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not found: unknown/method',
        },
        id: 'test-id',
      });
    });

    it('should handle parse errors', async () => {
      // Don't set requestBody to simulate parse error
      mockContext.set('requestBody', undefined);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
        },
        id: null,
      });
    });
  });

  describe('message/send Handler', () => {
    it('should handle basic message send request', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 'test-id',
        params: {
          message: {
            messageId: 'msg-123',
            parts: [{ kind: 'text', text: 'Hello world' }],
            role: 'user',
            contextId: 'conv-123',
            kind: 'message',
          },
          configuration: { blocking: true },
        },
      };

      const mockTaskResult: A2ATaskResult = {
        status: { state: TaskState.Completed },
        artifacts: [
          {
            artifactId: 'artifact-123',
            parts: [{ kind: 'text', text: 'Response message' }],
          },
        ],
      };

      mockContext.set('requestBody', request);
      mockAgent.taskHandler = vi.fn().mockResolvedValue(mockTaskResult);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(mockAgent.taskHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            parts: [{ kind: 'text', text: 'Hello world' }],
          },
          context: expect.objectContaining({
            conversationId: 'conv-123',
          }),
        })
      );

      expect(result.jsonrpc).toBe('2.0');
      expect(result.result.kind).toBe('message');
      expect(result.result.parts).toEqual([{ kind: 'text', text: 'Response message' }]);
    });

    it('should handle non-blocking requests returning Task', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 'test-id',
        params: {
          message: {
            messageId: 'msg-123',
            parts: [{ kind: 'text', text: 'Hello world' }],
            role: 'user',
            contextId: 'conv-123',
            kind: 'message',
          },
          configuration: { blocking: false },
        },
      };

      const mockTaskResult: A2ATaskResult = {
        status: { state: TaskState.Completed },
        artifacts: [
          {
            artifactId: 'artifact-123',
            parts: [{ kind: 'text', text: 'Response message' }],
          },
        ],
      };

      mockContext.set('requestBody', request);
      mockAgent.taskHandler = vi.fn().mockResolvedValue(mockTaskResult);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result.result.kind).toBe('task');
      expect(result.result.status.state).toBe(TaskState.Completed);
    });

    it('should handle transfer artifacts', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 'test-id',
        params: {
          message: {
            messageId: 'msg-123',
            parts: [{ kind: 'text', text: 'Transfer to support' }],
            role: 'user',
            contextId: 'conv-123',
            kind: 'message',
          },
          configuration: { blocking: true },
        },
      };

      const mockTaskResult: A2ATaskResult = {
        status: { state: TaskState.Completed },
        artifacts: [
          {
            artifactId: 'artifact-123',
            parts: [
              {
                kind: 'data',
                data: {
                  type: 'transfer',
                  targetSubAgentId: 'support-agent',
                  fromSubAgentId: 'test-agent',
                  reason: 'User needs support',
                },
              },
            ],
          },
        ],
      };

      mockContext.set('requestBody', request);
      mockAgent.taskHandler = vi.fn().mockResolvedValue(mockTaskResult);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result.result.artifacts[0].parts[0].data.type).toBe('transfer');
      expect(result.result.artifacts[0].parts[0].data.targetSubAgentId).toBe('support-agent');
    });

    it('should handle contextId resolution for delegation', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 'test-id',
        params: {
          message: {
            messageId: 'msg-123',
            parts: [{ kind: 'text', text: 'Hello world' }],
            role: 'user',
            contextId: 'default', // Missing/default contextId
            metadata: {
              conversationId: 'conv-456', // Should fallback to this
            },
            kind: 'message',
          },
          configuration: { blocking: true },
        },
      };

      const mockTaskResult: A2ATaskResult = {
        status: { state: TaskState.Completed },
        artifacts: [],
      };

      mockContext.set('requestBody', request);
      mockAgent.taskHandler = vi.fn().mockResolvedValue(mockTaskResult);

      await a2aHandler(mockContext, mockAgent);

      // Verify task creation used resolved contextId
      expect(createTaskMock).toHaveBeenCalledWith(expect.anything());
      const innerMock = createTaskMock.mock.results[0].value;
      expect(innerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          contextId: 'conv-456',
        })
      );
    });

    it('should store A2A messages for agent-to-agent communication', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 'test-id',
        params: {
          message: {
            messageId: 'msg-123',
            parts: [{ kind: 'text', text: 'Hello from agent' }],
            role: 'agent',
            contextId: 'conv-123',
            metadata: {
              fromSubAgentId: 'source-agent',
            },
            kind: 'message',
          },
          configuration: { blocking: true },
        },
      };

      const mockTaskResult: A2ATaskResult = {
        status: { state: TaskState.Completed },
        artifacts: [],
      };

      mockContext.set('requestBody', request);
      mockAgent.taskHandler = vi.fn().mockResolvedValue(mockTaskResult);

      await a2aHandler(mockContext, mockAgent);

      expect(createMessageMock).toHaveBeenCalledWith(expect.anything());
      const innerMock = createMessageMock.mock.results[0].value;
      expect(innerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant',
          conversationId: 'conv-123',
          role: 'agent',
          fromSubAgentId: 'source-agent',
          toSubAgentId: 'test-agent',
          messageType: 'a2a-request',
        })
      );
    });
  });

  describe('tasks/get Handler', () => {
    it('should return task status', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tasks/get',
        id: 'test-id',
        params: { id: 'task-123' },
      };

      mockContext.set('requestBody', request);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result.jsonrpc).toBe('2.0');
      expect(result.result.id).toBe('task-123');
      expect(result.result.kind).toBe('task');
      expect(result.result.status.state).toBe(TaskState.Completed);
    });
  });

  describe('tasks/cancel Handler', () => {
    it('should acknowledge task cancellation', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tasks/cancel',
        id: 'test-id',
        params: { id: 'task-123' },
      };

      mockContext.set('requestBody', request);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result.jsonrpc).toBe('2.0');
      expect(result.result.success).toBe(true);
    });
  });

  describe('agent.invoke Handler (Legacy)', () => {
    it('should handle legacy agent invoke', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'agent.invoke',
        id: 'test-id',
        params: {
          id: 'task-123',
          input: {
            parts: [{ kind: 'text', text: 'Hello world' }],
          },
        },
      };

      const mockTaskResult: A2ATaskResult = {
        status: { state: TaskState.Completed },
        artifacts: [],
      };

      mockContext.set('requestBody', request);
      mockAgent.taskHandler = vi.fn().mockResolvedValue(mockTaskResult);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(mockAgent.taskHandler).toHaveBeenCalledWith(request.params);
      expect(result.jsonrpc).toBe('2.0');
      expect(result.result).toEqual(mockTaskResult);
    });
  });

  describe('agent.getCapabilities Handler', () => {
    it('should return agent capabilities', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'agent.getCapabilities',
        id: 'test-id',
        params: {},
      };

      mockContext.set('requestBody', request);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result.jsonrpc).toBe('2.0');
      expect(result.result).toEqual({
        streaming: true,
        transfer: true,
        delegation: true,
      });
    });
  });

  describe('agent.getStatus Handler', () => {
    it('should return agent status', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'agent.getStatus',
        id: 'test-id',
        params: {},
      };

      mockContext.set('requestBody', request);

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result.jsonrpc).toBe('2.0');
      expect(result.result.status).toBe('ready');
      expect(result.result.subAgentId).toBe('test-agent');
    });
  });

  describe('Error Handling', () => {
    it('should handle task handler errors', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'message/send',
        id: 'test-id',
        params: {
          message: {
            messageId: 'msg-123',
            parts: [{ kind: 'text', text: 'Hello world' }],
            role: 'user',
            contextId: 'conv-123',
            kind: 'message',
          },
          configuration: { blocking: true },
        },
      };

      mockContext.set('requestBody', request);
      mockAgent.taskHandler = vi.fn().mockRejectedValue(new Error('Task failed'));

      const response = await a2aHandler(mockContext, mockAgent);
      const result = await response.json();

      expect(result.jsonrpc).toBe('2.0');
      expect(result.error.code).toBe(-32603);
      expect(result.error.message).toBe('Internal error during message send');
      expect(result.error.data).toBe('Task failed');
    });
  });
});
