import { generateId } from '@inkeep/agents-core';
import { describe, expect, it, vi } from 'vitest';

// Logger mock is now in setup.ts globally

// Mock ExecutionHandler early to prevent errors
vi.mock('../../../handlers/executionHandler', () => {
  return {
    ExecutionHandler: vi.fn().mockImplementation(() => ({
      execute: vi.fn().mockImplementation(async (args: any) => {
        // Ensure sseHelper exists and has required methods
        if (args.sseHelper && typeof args.sseHelper.writeRole === 'function') {
          await args.sseHelper.writeRole();
          await args.sseHelper.writeContent('[{"type":"text", "text":"Test response from agent"}]');
        }
        return { success: true, iterations: 1 };
      }),
    })),
  };
});

import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

// Mock context exports used by the chat data stream routes
vi.mock('../../../context', () => ({
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

// Mock Management API calls used by projectConfigMiddleware so we don't hit network
vi.mock('../../../api/manage-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../packages/agents-core/src/utils/manage-api-client')>();
  return {
    ...actual,
    getResolvedRef: vi.fn().mockImplementation(() =>
      vi.fn().mockResolvedValue({
        type: 'branch',
        name: 'main',
        hash: 'test-hash',
      })
    ),
    getFullProject: vi.fn().mockImplementation(() =>
      vi.fn().mockResolvedValue({
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
          },
        },
        tools: {},
        functions: {},
        dataComponents: {},
        artifactComponents: {},
        externalAgents: {},
        credentialReferences: {},
        statusUpdates: null,
      })
    ),
  };
});

// Mock @inkeep/agents-core functions that are used by the chat data stream routes
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    // Ensure auth middleware doesn't try to hit real DB/JWT paths in tests
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
    getActiveAgentForConversation: vi.fn().mockReturnValue(
      vi.fn().mockResolvedValue({
        activeSubAgentId: 'test-agent',
      })
    ),
    setActiveAgentForConversation: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
  };
});

// No longer need beforeAll/afterAll since ExecutionHandler is mocked at module level

describe('Chat Data Stream Route', () => {
  it('should stream response using Vercel data stream protocol', async () => {
    const tenantId = createTestTenantId('chat-data-stream');
    const projectId = 'default';
    const agentId = generateId();
    const subAgentId = 'test-agent';

    // Ensure project exists first
    // await createTestProject(dbClient, tenantId, projectId);

    // Create agent first
    // await createAgent(dbClient)({
    //   id: agentId,
    //   tenantId,
    //   projectId,
    //   name: 'Test Agent',
    //   description: 'Test agent for data chat',
    //   defaultSubAgentId: subAgentId,
    // });

    // // Then create agent with agentId
    // await createSubAgent(dbClient)({
    //   id: subAgentId,
    //   tenantId,
    //   projectId,
    //   agentId: agentId,
    //   name: 'Test Agent',
    //   description: 'Test agent for streaming',
    //   prompt: 'You are a helpful assistant.',
    // });

    const body = {
      messages: [
        {
          role: 'user',
          content: 'Hello, world!',
        },
      ],
    };

    const res = await makeRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (res.status !== 200) {
      const errorText = await res.text();
      console.error('Request failed:', {
        status: res.status,
        error: errorText,
        body,
      });
    }
    expect(res.status).toBe(200);
    expect(res.headers.get('x-vercel-ai-data-stream')).toBe('v2');

    const text = await res.text();
    // Check for UI Message Stream format
    expect(text).toMatch(/data: {"type":"data-component/);
    expect(text).toMatch(/"data":{"type":"text"/);
    // Check that the mock text is included in the stream
    expect(text).toMatch(/Test/);
    expect(text).toMatch(/response/);
  });
});
