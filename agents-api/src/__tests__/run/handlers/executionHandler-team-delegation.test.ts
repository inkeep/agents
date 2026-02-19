import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before all imports
const {
  generateServiceTokenMock,
  createTaskMock,
  getTaskMock,
  generateIdMock,
  getActiveAgentForConversationMock,
  createMessageMock,
  updateTaskMock,
  setSpanWithErrorMock,
  mockSendMessage,
  a2aClientConstructorMock,
} = vi.hoisted(() => ({
  generateServiceTokenMock: vi.fn().mockResolvedValue('fresh-jwt-for-sub-agent'),
  createTaskMock: vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'task-123',
      status: { state: 'submitted' },
      contextId: 'test-context',
    })
  ),
  getTaskMock: vi.fn(() => vi.fn().mockResolvedValue(null)),
  generateIdMock: vi.fn().mockReturnValue('test-id-123'),
  getActiveAgentForConversationMock: vi.fn(() => vi.fn().mockResolvedValue(null)),
  createMessageMock: vi.fn(() => vi.fn().mockResolvedValue({ id: 'msg-123' })),
  updateTaskMock: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
  setSpanWithErrorMock: vi.fn(),
  mockSendMessage: vi.fn(),
  a2aClientConstructorMock: vi.fn(),
}));

// Mock agents-core
vi.mock('@inkeep/agents-core', () => ({
  AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT: 10,
  generateServiceToken: generateServiceTokenMock,
  createTask: createTaskMock,
  getTask: getTaskMock,
  generateId: generateIdMock,
  getActiveAgentForConversation: getActiveAgentForConversationMock,
  createMessage: createMessageMock,
  updateTask: updateTaskMock,
  setSpanWithError: setSpanWithErrorMock,
  unwrapError: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
  getInProcessFetch: () => vi.fn().mockResolvedValue(new Response('ok')),
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock A2AClient - capture constructor calls to inspect headers
vi.mock('../../../domains/run/a2a/client.js', () => ({
  A2AClient: vi.fn().mockImplementation((...args: any[]) => {
    a2aClientConstructorMock(...args);
    return {
      sendMessage: mockSendMessage,
    };
  }),
}));

vi.mock('../../../data/db/runDbClient.js', () => ({
  default: {},
}));

vi.mock('../../../logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../../instrumentation.js', () => ({
  flushBatchProcessor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../domains/run/a2a/transfer.js', () => ({
  executeTransfer: vi.fn(),
}));

vi.mock('../../../domains/run/a2a/types.js', () => ({
  isTransferTask: vi.fn().mockReturnValue(false),
  extractTransferData: vi.fn(),
}));

vi.mock('../../../domains/run/constants/execution-limits', () => ({
  AGENT_EXECUTION_MAX_CONSECUTIVE_ERRORS: 3,
}));

vi.mock('../../../domains/run/services/AgentSession.js', () => ({
  agentSessionManager: {
    createSession: vi.fn(),
    enableEmitOperations: vi.fn(),
    recordEvent: vi.fn(),
    getSession: vi.fn().mockReturnValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../domains/run/utils/agent-operations.js', () => ({
  agentInitializingOp: vi.fn(),
  completionOp: vi.fn(),
  errorOp: vi.fn(),
}));

vi.mock('../../../domains/run/utils/model-resolver.js', () => ({
  resolveModelConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../domains/run/utils/stream-helpers.js', () => ({
  BufferingStreamHelper: vi.fn(),
}));

vi.mock('../../../domains/run/utils/stream-registry.js', () => ({
  registerStreamHelper: vi.fn(),
  unregisterStreamHelper: vi.fn(),
}));

vi.mock('../../../domains/run/utils/tracer.js', () => ({
  tracer: {
    startActiveSpan: vi.fn((_name: string, _opts: any, fn: any) =>
      fn({
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      })
    ),
  },
}));

vi.mock('../../evals/services/conversationEvaluation.js', () => ({
  triggerConversationEvaluation: vi.fn(),
}));

import { ExecutionHandler } from '../../../domains/run/handlers/executionHandler';

function createMockStreamHelper() {
  return {
    sendEvent: vi.fn(),
    close: vi.fn(),
    complete: vi.fn().mockResolvedValue(undefined),
    writeOperation: vi.fn().mockResolvedValue(undefined),
    getCapturedResponse: vi.fn().mockReturnValue(undefined),
    write: vi.fn(),
    enqueue: vi.fn(),
  };
}

describe('ExecutionHandler - Team Delegation JWT Regeneration', () => {
  let executionHandler: ExecutionHandler;

  const createMockExecutionContext = (teamDelegation: boolean) => ({
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentId: 'parent-agent',
    apiKey: teamDelegation ? 'eyJoriginal-jwt-token' : 'sk_test_regular_api_key_123456',
    apiKeyId: teamDelegation ? 'team-agent-token' : 'key-123',
    baseUrl: 'http://localhost:3000',
    resolvedRef: { type: 'branch', name: 'main', hash: 'test-hash' },
    metadata: teamDelegation
      ? { teamDelegation: true, originAgentId: 'remote-origin-agent' }
      : undefined,
    project: {
      id: 'test-project',
      tenantId: 'test-tenant',
      name: 'Test Project',
      agents: {
        'parent-agent': {
          id: 'parent-agent',
          name: 'Parent Agent',
          defaultSubAgentId: 'sub-agent-1',
          subAgents: {
            'sub-agent-1': {
              id: 'sub-agent-1',
              name: 'Sub Agent 1',
            },
          },
          stopWhen: { transferCountIs: 1 },
        },
      },
      tools: {},
      functions: {},
      dataComponents: {},
      artifactComponents: {},
      externalAgents: {},
      credentialReferences: {},
      statusUpdates: null,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    executionHandler = new ExecutionHandler();

    // Re-establish default mock behaviors after clearAllMocks
    generateServiceTokenMock.mockResolvedValue('fresh-jwt-for-sub-agent');
    createTaskMock.mockImplementation(() =>
      vi.fn().mockResolvedValue({
        id: 'task-123',
        status: { state: 'submitted' },
        contextId: 'test-context',
      })
    );
    getActiveAgentForConversationMock.mockImplementation(() => vi.fn().mockResolvedValue(null));
    createMessageMock.mockImplementation(() => vi.fn().mockResolvedValue({ id: 'msg-123' }));
    updateTaskMock.mockImplementation(() => vi.fn().mockResolvedValue(undefined));

    // Default: A2A call returns a completed task
    mockSendMessage.mockResolvedValue({
      result: {
        id: 'task-123',
        status: { state: 'completed' },
        artifacts: [
          {
            parts: [{ kind: 'text', text: 'Agent response' }],
          },
        ],
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should generate fresh JWT for sub-agent calls in team delegation context', async () => {
    const executionContext = createMockExecutionContext(true);
    const mockStreamHelper = createMockStreamHelper();

    await executionHandler.execute({
      executionContext: executionContext as any,
      conversationId: 'conv-123',
      userMessage: 'Test message',
      initialAgentId: 'sub-agent-1',
      requestId: 'req-123',
      sseHelper: mockStreamHelper as any,
    });

    // Verify generateServiceToken was called with correct params for the sub-agent
    expect(generateServiceTokenMock).toHaveBeenCalledWith({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      originAgentId: 'parent-agent',
      targetAgentId: 'sub-agent-1',
    });

    // Verify A2AClient was constructed with the fresh JWT, not the inherited token
    expect(a2aClientConstructorMock).toHaveBeenCalledWith(
      'http://localhost:3000/run/agents',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-jwt-for-sub-agent',
        }),
      })
    );
  });

  it('should use original apiKey for sub-agent calls when NOT in team delegation context', async () => {
    const executionContext = createMockExecutionContext(false);
    const mockStreamHelper = createMockStreamHelper();

    await executionHandler.execute({
      executionContext: executionContext as any,
      conversationId: 'conv-123',
      userMessage: 'Test message',
      initialAgentId: 'sub-agent-1',
      requestId: 'req-123',
      sseHelper: mockStreamHelper as any,
    });

    // generateServiceToken should NOT be called in non-team delegation context
    expect(generateServiceTokenMock).not.toHaveBeenCalled();

    // A2AClient should use the original apiKey
    expect(a2aClientConstructorMock).toHaveBeenCalledWith(
      'http://localhost:3000/run/agents',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_regular_api_key_123456',
        }),
      })
    );
  });

  it('should include correct routing headers in A2A calls', async () => {
    const executionContext = createMockExecutionContext(true);
    const mockStreamHelper = createMockStreamHelper();

    await executionHandler.execute({
      executionContext: executionContext as any,
      conversationId: 'conv-123',
      userMessage: 'Test message',
      initialAgentId: 'sub-agent-1',
      requestId: 'req-123',
      sseHelper: mockStreamHelper as any,
    });

    expect(a2aClientConstructorMock).toHaveBeenCalledWith(
      'http://localhost:3000/run/agents',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-inkeep-tenant-id': 'test-tenant',
          'x-inkeep-project-id': 'test-project',
          'x-inkeep-agent-id': 'parent-agent',
          'x-inkeep-sub-agent-id': 'sub-agent-1',
        }),
      })
    );
  });
});
