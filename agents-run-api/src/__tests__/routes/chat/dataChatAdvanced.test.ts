import { nanoid } from 'nanoid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as execModule from '../../../handlers/executionHandler';
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

const STREAM_TEXT = '[{"type":"text", "text":"Mock agent response"}]';

beforeAll(() => {
  vi.spyOn(execModule.ExecutionHandler.prototype, 'execute').mockImplementation(
    async (args: any) => {
      await args.sseHelper.writeRole();
      await args.sseHelper.writeContent(STREAM_TEXT);
      return { success: true, iterations: 1 } as any;
    }
  );
});

afterAll(() => {
  vi.restoreAllMocks();
});

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

    // Create agent first, then graph
    await createAgent(dbClient)({
      id: agentId,
      tenantId,
      projectId,
      name: 'Test Agent',
      description: 'Test agent',
      prompt: 'Test instructions',
    });

    await createAgentGraph(dbClient)({
      id: graphId,
      tenantId,
      projectId,
      name: 'Test Graph',
      defaultAgentId: agentId,
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
