import { generateId } from '@inkeep/agents-core';
import { describe, expect, it, vi } from 'vitest';

// Logger mock is now in setup.ts globally

// Mock ExecutionHandler early to prevent errors
vi.mock('../../../../domains/run/handlers/executionHandler', () => {
  return {
    ExecutionHandler: vi.fn().mockImplementation(() => ({
      execute: vi.fn().mockImplementation(async (args: any) => {
        // Ensure sseHelper exists and has required methods
        if (args.sseHelper && typeof args.sseHelper.writeRole === 'function') {
          await args.sseHelper.writeRole();
          await args.sseHelper.writeContent('[{"type":"text", "text":"Mock agent response"}]');
        }
        return { success: true, iterations: 1 };
      }),
    })),
  };
});

import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantId } from '../../../utils/testTenant';

// Mock context exports used by the chat data stream route
vi.mock('../../../../domains/run/context', () => ({
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

// Mock project config returned by ManagementApiClient
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

// Mock @inkeep/agents-core functions that are used by the chat data stream routes
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    // projectConfigMiddleware now loads project config via withRef + getFullProjectWithRelationIds
    withRef: vi.fn(async (_pool: any, _resolvedRef: any, fn: any) => await fn({})),
    getFullProjectWithRelationIds: vi.fn(() => vi.fn().mockResolvedValue(mockProjectConfig)),
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

describe('Chat Data Stream Advanced', () => {
  async function setupAgent() {
    const tenantId = createTestTenantId(`advanced-${generateId().slice(0, 8)}`);
    const projectId = 'default';
    const agentId = generateId();
    const subAgentId = 'test-agent'; // Use consistent ID that matches mocks

    return { tenantId, projectId, agentId, subAgentId };
  }

  it('streams expected completion content', async () => {
    await setupAgent();

    const res = await makeRequest('/run/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Test message' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-vercel-ai-data-stream')).toBe('v2');

    const text = await res.text();
    // Check for UI Message Stream format
    expect(text).toMatch(/data: {"type":"data-component/);
    expect(text).toMatch(/"data":{"type":"text"/);
    // Check that the mock text is included in the stream
    expect(text).toMatch(/Mock/);
    expect(text).toMatch(/agent/);
    expect(text).toMatch(/response/);
  });
});
