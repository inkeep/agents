import { nanoid } from 'nanoid';
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
          await args.sseHelper.writeContent('[{"type":"text", "text":"Mock agent response"}]');
        }
        return { success: true, iterations: 1 };
      }),
    })),
  };
});

import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

// Mock @inkeep/agents-core functions that are used by the chat data stream routes
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getAgentGraphWithDefaultAgent: vi.fn().mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'test-graph',
        name: 'Test Graph',
        tenantId: 'test-tenant',
        projectId: 'default',
        defaultAgentId: 'test-agent',
      })
    ),
    getAgentById: vi.fn().mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'test-agent',
        tenantId: 'test-tenant',
        name: 'Test Agent',
        description: 'A helpful assistant',
        prompt: 'You are a helpful assistant.',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ),
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
        activeAgentId: 'test-agent',
      })
    ),
    setActiveAgentForConversation: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
    contextValidationMiddleware: vi.fn().mockReturnValue(async (c: any, next: any) => {
      c.set('validatedContext', {
        graphId: 'test-graph',
        tenantId: 'test-tenant',
        projectId: 'default',
      });
      await next();
    }),
  };
});

// No longer need beforeAll/afterAll since ExecutionHandler is mocked at module level

describe('Chat Data Stream Advanced', () => {
  async function setupGraph() {
    const tenantId = createTestTenantId(`advanced-${nanoid().slice(0, 8)}`);
    const projectId = 'default';
    const graphId = nanoid();
    const agentId = nanoid(); // Use unique agent ID for each test

    // Import here to avoid circular dependencies
    const { createAgent, createAgentGraph } = await import('@inkeep/agents-core');
    const dbClient = (await import('../../../data/db/dbClient.js')).default;
    const { ensureTestProject } = await import('../../utils/testProject.js');

    // Ensure project exists first
    await ensureTestProject(tenantId, projectId);

    // Create graph first
    await createAgentGraph(dbClient)({
      id: graphId,
      tenantId,
      projectId,
      name: 'Test Graph',
      description: 'Test graph for advanced data chat',
      defaultAgentId: agentId,
    });

    // Then create agent with graphId
    await createAgent(dbClient)({
      id: agentId,
      tenantId,
      projectId,
      graphId,
      name: 'Test Agent',
      description: 'Test agent',
      prompt: 'Test instructions',
    });

    return { tenantId, projectId, graphId, agentId };
  }

  it('streams expected completion content', async () => {
    const { tenantId, projectId, graphId } = await setupGraph();

    const res = await makeRequest('/api/chat', {
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
