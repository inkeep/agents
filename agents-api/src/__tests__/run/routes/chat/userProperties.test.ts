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

const { mockSetActiveAgent, mockCreateOrGetConversation, mockCreateMessage } = vi.hoisted(() => ({
  mockSetActiveAgent: vi.fn().mockResolvedValue(undefined),
  mockCreateOrGetConversation: vi.fn().mockResolvedValue({ id: 'conv-123' }),
  mockCreateMessage: vi.fn().mockResolvedValue({
    id: 'msg-123',
    tenantId: 'test-tenant',
    conversationId: 'conv-123',
    role: 'user',
    content: { text: 'test message' },
  }),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    withRef: vi.fn(async (_pool: any, _resolvedRef: any, fn: any) => await fn({})),
    getFullProjectWithRelationIds: vi.fn(() => vi.fn().mockResolvedValue(mockProjectConfig)),
    validateAndGetApiKey: vi.fn().mockResolvedValue(null),
    verifyServiceToken: vi.fn().mockResolvedValue({ valid: false, error: 'Invalid token' }),
    createMessage: vi.fn().mockReturnValue(mockCreateMessage),
    getActiveAgentForConversation: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(null)),
    setActiveAgentForConversation: vi.fn().mockReturnValue(mockSetActiveAgent),
    createOrGetConversation: vi.fn().mockReturnValue(mockCreateOrGetConversation),
    getConversation: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ id: 'conv-123' })),
  };
});

import { makeRequest } from '../../../utils/testRequest';

describe('userProperties in chat requests', () => {
  it('writes body.userProperties to top-level conversations.userProperties via /chat (Vercel stream)', async () => {
    mockSetActiveAgent.mockClear();
    mockCreateMessage.mockClear();

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
        userProperties: { email: 'test@example.com', plan: 'pro' },
      })
    );
  });

  it('does NOT write body.userProperties into metadata.userContext (D36 refinement)', async () => {
    mockSetActiveAgent.mockClear();

    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
      userProperties: { email: 'test@example.com', plan: 'pro' },
    };

    await makeRequest('/run/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const callArg = mockSetActiveAgent.mock.calls[0]?.[0] as { metadata?: unknown } | undefined;
    expect(callArg?.metadata).not.toMatchObject({ userContext: expect.anything() });
  });

  it('writes body.userProperties + body.properties to top-level columns via /chat (Vercel stream)', async () => {
    mockSetActiveAgent.mockClear();

    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
      userProperties: { email: 'stream@example.com', plan: 'pro' },
      properties: { url: '/stream-page', referrer: 'duck' },
    };

    const res = await makeRequest('/run/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockSetActiveAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        userProperties: { email: 'stream@example.com', plan: 'pro' },
        properties: { url: '/stream-page', referrer: 'duck' },
      })
    );
  });

  it('snapshots body.userProperties onto user-message inserts via /chat (Vercel stream, D37)', async () => {
    mockCreateMessage.mockClear();

    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
      userProperties: { userId: 'stream-msg-user', plan: 'free' },
    };

    await makeRequest('/run/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'user',
          userProperties: { userId: 'stream-msg-user', plan: 'free' },
        }),
      })
    );
  });

  it('writes body.userProperties + body.properties to top-level columns via /completions (OpenAI)', async () => {
    mockCreateOrGetConversation.mockClear();

    const body = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
      userProperties: { company: 'Acme', role: 'admin' },
      properties: { url: '/docs', referrer: 'google' },
    };

    const res = await makeRequest('/run/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockCreateOrGetConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        userProperties: { company: 'Acme', role: 'admin' },
        properties: { url: '/docs', referrer: 'google' },
      })
    );
  });

  it('snapshots body.userProperties onto each user-message insert (D37)', async () => {
    mockCreateMessage.mockClear();

    const body = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
      userProperties: { userId: 'msg-snapshot-user', plan: 'free' },
    };

    await makeRequest('/run/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'user',
          userProperties: { userId: 'msg-snapshot-user', plan: 'free' },
        }),
      })
    );
  });

  it('does not set userProperties or metadata when both are omitted', async () => {
    mockSetActiveAgent.mockClear();
    mockCreateMessage.mockClear();

    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const res = await makeRequest('/run/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockSetActiveAgent).toHaveBeenCalledWith(
      expect.not.objectContaining({ userProperties: expect.anything() })
    );
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ userProperties: expect.anything() }),
      })
    );
  });

  it.each([
    ['ANONYMOUS', { id: '1hb1l6c4cg9435m125i6p', identificationType: 'ANONYMOUS' }],
    ['COOKIED', { id: '1hb1l6c4cg9435m125i6p', identificationType: 'COOKIED' }],
  ])('drops widget auto-mint identityType=%s userProperties', async (_label, userProperties) => {
    mockSetActiveAgent.mockClear();
    mockCreateMessage.mockClear();

    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
      userProperties,
    };

    const res = await makeRequest('/run/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockSetActiveAgent).toHaveBeenCalledWith(
      expect.not.objectContaining({ userProperties: expect.anything() })
    );
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ userProperties: expect.anything() }),
      })
    );
  });

  it('drops ANONYMOUS userProperties supplied via x-inkeep-user-properties header', async () => {
    mockSetActiveAgent.mockClear();
    mockCreateMessage.mockClear();

    const body = { messages: [{ role: 'user', content: 'Hello' }] };

    const res = await makeRequest('/run/api/chat', {
      method: 'POST',
      headers: {
        'x-inkeep-user-properties': JSON.stringify({
          id: '1hb1l6c4cg9435m125i6p',
          identificationType: 'ANONYMOUS',
        }),
      },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockSetActiveAgent).toHaveBeenCalledWith(
      expect.not.objectContaining({ userProperties: expect.anything() })
    );
  });

  it('preserves ID_PROVIDED userProperties (header) and strips identificationType marker', async () => {
    mockSetActiveAgent.mockClear();
    mockCreateMessage.mockClear();

    const body = { messages: [{ role: 'user', content: 'Hello' }] };
    const headerUserProperties = {
      id: 'customer-42',
      identificationType: 'ID_PROVIDED',
      email: 'customer@example.com',
    };

    const res = await makeRequest('/run/api/chat', {
      method: 'POST',
      headers: {
        'x-inkeep-user-properties': JSON.stringify(headerUserProperties),
      },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockSetActiveAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        userProperties: { id: 'customer-42', email: 'customer@example.com' },
      })
    );
    expect(mockSetActiveAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        userProperties: expect.not.objectContaining({ identificationType: expect.anything() }),
      })
    );
  });
});
