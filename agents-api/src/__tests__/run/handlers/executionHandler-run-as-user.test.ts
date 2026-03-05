import { beforeEach, describe, expect, it, vi } from 'vitest';

const { a2aClientConstructorMock, mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn(),
  a2aClientConstructorMock: vi.fn(),
}));

vi.mock('@inkeep/agents-core', () => ({
  AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT: 10,
  generateServiceToken: vi.fn().mockResolvedValue('mock-service-token'),
  createTask: vi.fn(() =>
    vi.fn().mockResolvedValue({
      id: 'task-123',
      status: { state: 'submitted' },
      contextId: 'test-context',
    })
  ),
  getTask: vi.fn(() => vi.fn().mockResolvedValue(null)),
  generateId: vi.fn().mockReturnValue('test-id-123'),
  getActiveAgentForConversation: vi.fn(() => vi.fn().mockResolvedValue(null)),
  createMessage: vi.fn(() => vi.fn().mockResolvedValue({ id: 'msg-123' })),
  updateTask: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
  setSpanWithError: vi.fn(),
  unwrapError: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
  getInProcessFetch: () => vi.fn().mockResolvedValue(new Response('ok')),
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../../domains/run/a2a/client.js', () => ({
  A2AClient: vi.fn().mockImplementation((...args: any[]) => {
    a2aClientConstructorMock(...args);
    return { sendMessage: mockSendMessage };
  }),
}));

vi.mock('../../../data/db/runDbClient.js', () => ({ default: {} }));
vi.mock('../../../logger.js', () => ({
  getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../../instrumentation.js', () => ({
  flushBatchProcessor: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../domains/run/a2a/transfer.js', () => ({ executeTransfer: vi.fn() }));
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
vi.mock('../../../domains/run/utils/stream-helpers.js', () => ({ BufferingStreamHelper: vi.fn() }));
vi.mock('../../../domains/run/utils/stream-registry.js', () => ({
  registerStreamHelper: vi.fn(),
  unregisterStreamHelper: vi.fn(),
}));
vi.mock('../../../domains/run/utils/tracer.js', () => ({
  tracer: {
    startActiveSpan: vi.fn((_name: string, _opts: any, fn: any) =>
      fn({ setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() })
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

function createExecutionContext(initiatedBy?: { type: string; id: string }) {
  return {
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentId: 'test-agent',
    apiKey: 'sk_test_key_1234567890123456',
    apiKeyId: 'key-123',
    baseUrl: 'http://localhost:3000',
    resolvedRef: { type: 'branch', name: 'main', hash: 'test-hash' },
    metadata: initiatedBy ? { initiatedBy } : undefined,
    project: {
      id: 'test-project',
      tenantId: 'test-tenant',
      name: 'Test Project',
      agents: {
        'test-agent': {
          id: 'test-agent',
          name: 'Test Agent',
          defaultSubAgentId: 'sub-1',
          subAgents: {
            'sub-1': { id: 'sub-1', name: 'Sub 1' },
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
  };
}

function getA2AClientHeaders(): Record<string, string> | undefined {
  const call = a2aClientConstructorMock.mock.calls[0];
  return call?.[1]?.headers;
}

describe('ExecutionHandler - x-inkeep-run-as-user-id forwarding', () => {
  let handler: ExecutionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ExecutionHandler();
    mockSendMessage.mockResolvedValue({
      result: {
        id: 'task-123',
        status: { state: 'completed' },
        contextId: 'test-context',
        artifacts: [{ parts: [{ kind: 'text', text: 'response' }] }],
      },
    });
  });

  async function execute(initiatedBy?: { type: string; id: string }) {
    await handler.execute({
      executionContext: createExecutionContext(initiatedBy) as any,
      conversationId: 'conv-123',
      userMessage: 'hello',
      initialAgentId: 'sub-1',
      requestId: 'req-123',
      sseHelper: createMockStreamHelper() as any,
    });
  }

  it('forwards x-inkeep-run-as-user-id for valid user IDs', async () => {
    await execute({ type: 'user', id: 'user_abc123' });
    const headers = getA2AClientHeaders();
    expect(headers?.['x-inkeep-run-as-user-id']).toBe('user_abc123');
  });

  it('does not forward x-inkeep-run-as-user-id when initiatedBy.id is "system"', async () => {
    await execute({ type: 'user', id: 'system' });
    const headers = getA2AClientHeaders();
    expect(headers?.['x-inkeep-run-as-user-id']).toBeUndefined();
  });

  it('does not forward x-inkeep-run-as-user-id when initiatedBy.id starts with "apikey:"', async () => {
    await execute({ type: 'user', id: 'apikey:sk_test_123' });
    const headers = getA2AClientHeaders();
    expect(headers?.['x-inkeep-run-as-user-id']).toBeUndefined();
  });

  it('does not forward x-inkeep-run-as-user-id when initiatedBy type is not "user"', async () => {
    await execute({ type: 'api_key', id: 'trigger-123' });
    const headers = getA2AClientHeaders();
    expect(headers?.['x-inkeep-run-as-user-id']).toBeUndefined();
  });

  it('does not forward x-inkeep-run-as-user-id when initiatedBy is undefined', async () => {
    await execute(undefined);
    const headers = getA2AClientHeaders();
    expect(headers?.['x-inkeep-run-as-user-id']).toBeUndefined();
  });
});
