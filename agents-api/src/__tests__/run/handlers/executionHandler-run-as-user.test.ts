import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { a2aClientConstructorMock, initializeStatusUpdatesMock, mockSendMessage } = vi.hoisted(
  () => ({
    mockSendMessage: vi.fn(),
    a2aClientConstructorMock: vi.fn(),
    initializeStatusUpdatesMock: vi.fn(),
  })
);

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
vi.mock('../../../logger.js', () => createMockLoggerModule().module);
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
vi.mock('../../../domains/run/session/AgentSession.js', () => ({
  agentSessionManager: {
    createSession: vi.fn(),
    enableEmitOperations: vi.fn(),
    initializeStatusUpdates: initializeStatusUpdatesMock,
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
  firstWithModel: vi.fn((...ms: Array<{ model?: string } | null | undefined>) =>
    ms.find((m) => m?.model)
  ),
  resolveModelConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../domains/run/stream/stream-helpers.js', () => ({
  BufferingStreamHelper: vi.fn(),
}));
vi.mock('../../../domains/run/stream/stream-registry.js', () => ({
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

function createExecutionContextWithoutDefaultSubAgent() {
  return {
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentId: 'test-agent',
    apiKey: 'sk_test_key_1234567890123456',
    apiKeyId: 'key-123',
    baseUrl: 'http://localhost:3000',
    resolvedRef: { type: 'branch', name: 'main', hash: 'test-hash' },
    project: {
      id: 'test-project',
      tenantId: 'test-tenant',
      name: 'Test Project',
      models: {
        base: { model: 'project-base-model' },
      },
      agents: {
        'test-agent': {
          id: 'test-agent',
          name: 'Test Agent',
          defaultSubAgentId: null,
          models: {},
          subAgents: {
            'sub-1': { id: 'sub-1', name: 'Sub 1' },
          },
          stopWhen: { transferCountIs: 1 },
          statusUpdates: null,
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

  it('uses project base model for status updates when no default sub-agent is configured', async () => {
    await handler.execute({
      executionContext: createExecutionContextWithoutDefaultSubAgent() as any,
      conversationId: 'conv-123',
      userMessage: 'hello',
      initialAgentId: 'sub-1',
      requestId: 'req-123',
      sseHelper: createMockStreamHelper() as any,
    });

    expect(initializeStatusUpdatesMock).toHaveBeenCalledWith(
      'req-123',
      { enabled: false },
      { model: 'project-base-model' },
      { model: 'project-base-model' }
    );
  });
});

describe('ExecutionHandler - A2A client header override protection', () => {
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

  async function executeWithForwardedHeaders(forwardedHeaders: Record<string, string>) {
    await handler.execute({
      executionContext: createExecutionContext({ type: 'user', id: 'user_abc123' }) as any,
      conversationId: 'conv-123',
      userMessage: 'hello',
      initialAgentId: 'sub-1',
      requestId: 'req-123',
      sseHelper: createMockStreamHelper() as any,
      forwardedHeaders,
    });
  }

  it('does not allow forwardedHeaders to override Authorization', async () => {
    await executeWithForwardedHeaders({
      Authorization: 'Bearer attacker-token',
    });
    const headers = getA2AClientHeaders();
    expect(headers?.Authorization).toBe('Bearer mock-service-token');
  });

  it('does not allow forwardedHeaders to override x-inkeep-tenant-id', async () => {
    await executeWithForwardedHeaders({
      'x-inkeep-tenant-id': 'attacker-tenant',
    });
    const headers = getA2AClientHeaders();
    expect(headers?.['x-inkeep-tenant-id']).toBe('test-tenant');
  });

  it('does not allow forwardedHeaders to override x-inkeep-project-id', async () => {
    await executeWithForwardedHeaders({
      'x-inkeep-project-id': 'attacker-project',
    });
    const headers = getA2AClientHeaders();
    expect(headers?.['x-inkeep-project-id']).toBe('test-project');
  });

  it('does not allow forwardedHeaders to override x-inkeep-agent-id', async () => {
    await executeWithForwardedHeaders({
      'x-inkeep-agent-id': 'attacker-agent',
    });
    const headers = getA2AClientHeaders();
    expect(headers?.['x-inkeep-agent-id']).toBe('test-agent');
  });

  it('does not allow forwardedHeaders to override x-inkeep-sub-agent-id', async () => {
    await executeWithForwardedHeaders({
      'x-inkeep-sub-agent-id': 'attacker-sub-agent',
    });
    const headers = getA2AClientHeaders();
    expect(headers?.['x-inkeep-sub-agent-id']).toBe('sub-1');
  });

  it('blocks case-insensitive override attempts', async () => {
    await executeWithForwardedHeaders({
      authorization: 'Bearer attacker-token',
      'X-INKEEP-TENANT-ID': 'attacker-tenant',
      'X-Inkeep-Project-Id': 'attacker-project',
    });
    const headers = getA2AClientHeaders();
    expect(headers?.Authorization).toBe('Bearer mock-service-token');
    expect(headers?.['x-inkeep-tenant-id']).toBe('test-tenant');
    expect(headers?.['x-inkeep-project-id']).toBe('test-project');
  });

  it('passes through non-conflicting forwarded headers', async () => {
    await executeWithForwardedHeaders({
      'x-forwarded-cookie': 'session=abc123',
      'x-inkeep-client-timezone': 'America/New_York',
      'x-custom-header': 'allowed-value',
    });
    const headers = getA2AClientHeaders();
    expect(headers?.['x-forwarded-cookie']).toBe('session=abc123');
    expect(headers?.['x-inkeep-client-timezone']).toBe('America/New_York');
    expect(headers?.['x-custom-header']).toBe('allowed-value');
  });

  it('blocks all trusted headers simultaneously while allowing legitimate ones', async () => {
    await executeWithForwardedHeaders({
      Authorization: 'Bearer attacker-token',
      'x-inkeep-tenant-id': 'attacker-tenant',
      'x-inkeep-project-id': 'attacker-project',
      'x-inkeep-agent-id': 'attacker-agent',
      'x-inkeep-sub-agent-id': 'attacker-sub-agent',
      'x-inkeep-run-as-user-id': 'attacker-user',
      'x-forwarded-cookie': 'session=legit',
    });
    const headers = getA2AClientHeaders();
    expect(headers?.Authorization).toBe('Bearer mock-service-token');
    expect(headers?.['x-inkeep-tenant-id']).toBe('test-tenant');
    expect(headers?.['x-inkeep-project-id']).toBe('test-project');
    expect(headers?.['x-inkeep-agent-id']).toBe('test-agent');
    expect(headers?.['x-inkeep-sub-agent-id']).toBe('sub-1');
    expect(headers?.['x-inkeep-run-as-user-id']).toBe('user_abc123');
    expect(headers?.['x-forwarded-cookie']).toBe('session=legit');
  });
});
