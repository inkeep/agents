import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getFullProjectMock,
  createWorkflowExecutionMock,
  getActiveWorkflowExecutionMock,
  createMessageMock,
  startWorkflowMock,
} = vi.hoisted(() => ({
  getFullProjectMock: vi.fn(),
  createWorkflowExecutionMock: vi.fn(() => vi.fn().mockResolvedValue({ id: 'exec-123' })),
  getActiveWorkflowExecutionMock: vi.fn(() => vi.fn().mockResolvedValue(null)),
  createMessageMock: vi.fn(() => vi.fn().mockResolvedValue({ id: 'msg-123' })),
  startWorkflowMock: vi.fn().mockResolvedValue({ runId: 'run-123' }),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    withRef: vi.fn(async (_pool: unknown, _resolvedRef: unknown, fn: (db: unknown) => unknown) =>
      fn({})
    ),
    getFullProjectWithRelationIds: vi.fn(() => vi.fn().mockImplementation(getFullProjectMock)),
    createWorkflowExecution: createWorkflowExecutionMock,
    getActiveWorkflowExecution: getActiveWorkflowExecutionMock,
    createMessage: createMessageMock,
  };
});

vi.mock('workflow/api', () => ({
  start: startWorkflowMock,
}));

vi.mock('../../../domains/run/workflow/functions/agentExecution.js', () => ({
  agentExecutionWorkflow: vi.fn(),
}));

import { ExecutionModeSchema } from '@inkeep/agents-core';
import { makeRequest } from '../../utils/testRequest';

function buildProjectConfig(overrides?: {
  agentId?: string;
  executionMode?: string | null;
  includeAgent?: boolean;
}) {
  const agentId = overrides?.agentId ?? 'test-agent';
  const executionMode =
    overrides && 'executionMode' in overrides ? overrides.executionMode : 'durable';
  const includeAgent = overrides?.includeAgent ?? true;

  const agents: Record<string, unknown> = {};
  if (includeAgent) {
    agents[agentId] = {
      id: agentId,
      tenantId: 'test-tenant',
      projectId: 'default',
      name: 'Test Agent',
      description: 'Test agent',
      defaultSubAgentId: 'default-sub',
      executionMode,
      subAgents: {
        'default-sub': {
          id: 'default-sub',
          name: 'Default Sub',
          description: 'Default sub agent',
          prompt: 'You are helpful.',
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
      statusUpdates: { enabled: false },
    };
  }

  return {
    id: 'default',
    tenantId: 'test-tenant',
    name: 'Test Project',
    agents,
    tools: {},
    functions: {},
    dataComponents: {},
    artifactComponents: {},
    externalAgents: {},
    credentialReferences: {},
    statusUpdates: null,
  };
}

describe('Durable Executions Routes', () => {
  beforeEach(() => {
    process.env.ENVIRONMENT = 'test';
    getFullProjectMock.mockResolvedValue(buildProjectConfig());
    createWorkflowExecutionMock.mockReturnValue(vi.fn().mockResolvedValue({ id: 'exec-123' }));
    getActiveWorkflowExecutionMock.mockReturnValue(vi.fn().mockResolvedValue(null));
    createMessageMock.mockReturnValue(vi.fn().mockResolvedValue({ id: 'msg-123' }));
    startWorkflowMock.mockResolvedValue({ runId: 'run-123' });
  });

  describe('POST /run/v1/executions - validation', () => {
    it('returns 400 when agent does not have executionMode set to durable', async () => {
      getFullProjectMock.mockResolvedValueOnce(buildProjectConfig({ executionMode: 'classic' }));

      const response = await makeRequest('/run/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 400 when agent executionMode is null', async () => {
      getFullProjectMock.mockResolvedValueOnce(buildProjectConfig({ executionMode: null }));

      const response = await makeRequest('/run/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when no user message is provided', async () => {
      const response = await makeRequest('/run/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          messages: [],
        }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when agent is not found', async () => {
      getFullProjectMock.mockResolvedValueOnce(buildProjectConfig({ includeAgent: false }));

      const response = await makeRequest('/run/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      const body = await response.json();
      expect(response.status).toBe(404);
      expect(body.error).toBeDefined();
    });

    it('returns 400 when user message has no text content', async () => {
      const response = await makeRequest('/run/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: '' }],
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /run/v1/executions - concurrency guard', () => {
    it('returns 409 when an active execution already exists for the conversation', async () => {
      getActiveWorkflowExecutionMock.mockReturnValueOnce(
        vi.fn().mockResolvedValue({ id: 'existing-exec-456', status: 'running' })
      );

      const response = await makeRequest('/run/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          conversationId: 'conv-existing',
        }),
      });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.existingExecutionId).toBe('existing-exec-456');
    });
  });

  describe('POST /run/v1/executions - success', () => {
    it('starts a durable execution and returns execution details', async () => {
      const response = await makeRequest('/run/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello, what can you do?' }],
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.executionId).toBeDefined();
      expect(body.runId).toBe('run-123');
      expect(body.conversationId).toBeDefined();
      expect(body.status).toBe('running');
    });

    it('uses provided conversationId when specified', async () => {
      const response = await makeRequest('/run/v1/executions', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          conversationId: 'my-conv-id',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.conversationId).toBe('my-conv-id');
    });
  });

  describe('GET /run/v1/executions/:executionId/status', () => {
    it('returns 404 for non-existent execution', async () => {
      const response = await makeRequest('/run/v1/executions/non-existent/status', {
        method: 'GET',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('ExecutionMode schema validation', () => {
    it('accepts "classic" as a valid execution mode', () => {
      const result = ExecutionModeSchema.safeParse('classic');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('classic');
    });

    it('accepts "durable" as a valid execution mode', () => {
      const result = ExecutionModeSchema.safeParse('durable');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('durable');
    });

    it('accepts null as a valid execution mode', () => {
      const result = ExecutionModeSchema.safeParse(null);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeNull();
    });

    it('accepts undefined as a valid execution mode', () => {
      const result = ExecutionModeSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeUndefined();
    });

    it('rejects invalid execution mode values', () => {
      const result = ExecutionModeSchema.safeParse('invalid-mode');
      expect(result.success).toBe(false);
    });

    it('rejects numeric values', () => {
      const result = ExecutionModeSchema.safeParse(123);
      expect(result.success).toBe(false);
    });
  });
});
