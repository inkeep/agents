import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../domains/run/handlers/executionHandler', () => {
  return {
    ExecutionHandler: vi.fn().mockImplementation(() => ({
      execute: vi.fn().mockImplementation(async (args: any) => {
        if (args.sseHelper && typeof args.sseHelper.writeRole === 'function') {
          await args.sseHelper.writeRole();
          await args.sseHelper.writeContent('[{"type":"text", "text":"ok"}]');
        }
        return { success: true, iterations: 1 };
      }),
    })),
  };
});

vi.mock('../../../../domains/run/context', () => ({
  handleContextResolution: vi.fn().mockResolvedValue({}),
  contextValidationMiddleware: vi.fn().mockImplementation(async (c: any, next: any) => {
    c.set('validatedContext', {});
    await next();
  }),
}));

const mockProjectConfig = {
  id: 'default',
  tenantId: 'test-tenant',
  name: 'Test Project',
  agents: {
    'test-agent': {
      id: 'test-agent',
      tenantId: 'test-tenant',
      projectId: 'default',
      name: 'Test Agent',
      description: 'Test agent',
      defaultSubAgentId: 'test-agent',
      subAgents: {
        'test-agent': {
          id: 'test-agent',
          tenantId: 'test-tenant',
          projectId: 'default',
          name: 'Test Agent',
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
};

const { mockSetActiveAgent, mockCreateOrGetConversation } = vi.hoisted(() => ({
  mockSetActiveAgent: vi.fn().mockResolvedValue(undefined),
  mockCreateOrGetConversation: vi.fn().mockResolvedValue({ id: 'conv-123' }),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    withRef: vi.fn(async (_pool: any, _resolvedRef: any, fn: any) => await fn({})),
    getFullProjectWithRelationIds: vi.fn(() => vi.fn().mockResolvedValue(mockProjectConfig)),
    validateAndGetApiKey: vi.fn().mockResolvedValue(null),
    verifyServiceToken: vi.fn().mockResolvedValue({ valid: false, error: 'Invalid token' }),
    createMessage: vi.fn().mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'msg-123',
        tenantId: 'test-tenant',
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'test message' },
      })
    ),
    getActiveAgentForConversation: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(null)),
    setActiveAgentForConversation: vi.fn().mockReturnValue(mockSetActiveAgent),
    createOrGetConversation: vi.fn().mockReturnValue(mockCreateOrGetConversation),
    getConversation: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ id: 'conv-123' })),
  };
});

import { makeRequest } from '../../../utils/testRequest';

describe('userProperties in chat requests', () => {
  it('should pass userProperties as metadata.userContext via /chat (Vercel stream)', async () => {
    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
      userProperties: { email: 'test@example.com', plan: 'pro' },
    };

    const res = await makeRequest('/run/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockSetActiveAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { userContext: { email: 'test@example.com', plan: 'pro' } },
      })
    );
  });

  it('should pass userProperties as metadata.userContext via /completions (OpenAI)', async () => {
    const body = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
      userProperties: { company: 'Acme', role: 'admin' },
    };

    const res = await makeRequest('/run/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockCreateOrGetConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { userContext: { company: 'Acme', role: 'admin' } },
      })
    );
  });

  it('should not set metadata when userProperties is omitted', async () => {
    mockSetActiveAgent.mockClear();

    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const res = await makeRequest('/run/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockSetActiveAgent).toHaveBeenCalledWith(
      expect.not.objectContaining({ metadata: expect.anything() })
    );
  });
});
