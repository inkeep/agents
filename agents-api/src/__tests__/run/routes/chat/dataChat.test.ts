import { describe, expect, it, vi } from 'vitest';
import { pendingToolApprovalManager } from '../../../services/PendingToolApprovalManager';
import { toolApprovalUiBus } from '../../../services/ToolApprovalUiBus';

// Logger mock is now in setup.ts globally

vi.mock('../../../../domains/run/handlers/executionHandler', () => {
  return {
    ExecutionHandler: vi.fn().mockImplementation(() => ({
      execute: vi.fn().mockImplementation(async (args: any) => {
        if (args.sseHelper && typeof args.sseHelper.writeRole === 'function') {
          await args.sseHelper.writeRole();
          await args.sseHelper.writeContent('[{"type":"text", "text":"Test response from agent"}]');
        }

        // Allow tests to simulate delegated approval UI propagation by publishing to the bus.
        if (args.userMessage === '__trigger_approval_ui_bus__') {
          await toolApprovalUiBus.publish(args.requestId, {
            type: 'approval-needed',
            toolCallId: 'call_bus_1',
            toolName: 'delete_file',
            input: { filePath: 'user/readme.md' },
            providerMetadata: { openai: { itemId: 'fc_test' } },
            approvalId: 'aitxt-call_bus_1',
          });
          await toolApprovalUiBus.publish(args.requestId, {
            type: 'approval-resolved',
            toolCallId: 'call_bus_1',
            approved: true,
          });
        }
        return { success: true, iterations: 1 };
      }),
    })),
  };
});

import { makeRequest } from '../../../utils/testRequest';

// Mock context exports used by the chat data stream routes
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
    getConversation: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ id: 'conv-123' })),
  };
});

// No longer need beforeAll/afterAll since ExecutionHandler is mocked at module level

describe('Chat Data Stream Route', () => {
  it('should stream response using Vercel data stream protocol', async () => {
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

    const res = await makeRequest('/run/api/chat', {
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

  it('should stream approval UI events published to ToolApprovalUiBus (simulating delegated agent approval)', async () => {
    // Ensure deterministic requestId inside route subscription (chatds-${Date.now()})
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(12345);

    const body = {
      conversationId: 'conv-123',
      messages: [
        {
          role: 'user',
          content: '__trigger_approval_ui_bus__',
        },
      ],
    };

    const res = await makeRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-vercel-ai-data-stream')).toBe('v2');

    const text = await res.text();
    expect(text).toMatch(/"type":"tool-input-start"/);
    expect(text).toMatch(/"type":"tool-approval-request"/);
    expect(text).toMatch(/"type":"tool-output-available"/);

    nowSpy.mockRestore();
  });

  it('should accept approval responded tool part via the same /api/chat endpoint and return JSON ack', async () => {
    const toolCallId = 'call_test_approval_1';
    const conversationId = 'conv-123';

    // Create a pending approval first
    const approvalPromise = pendingToolApprovalManager.waitForApproval(
      toolCallId,
      'delete_file',
      { filePath: 'user/readme.md' },
      conversationId,
      'test-agent'
    );

    const body = {
      conversationId,
      messages: [
        {
          role: 'assistant',
          content: null,
          parts: [
            { type: 'step-start' },
            {
              type: 'tool-delete_file',
              toolCallId,
              state: 'approval-responded',
              input: { filePath: '/tmp/test.txt' },
              callProviderMetadata: { openai: { itemId: 'fc_test' } },
              approval: { id: `aitxt-${toolCallId}`, approved: true },
            },
          ],
        },
      ],
    };

    const res = await makeRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') || '').toMatch(/application\/json/);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, toolCallId, approved: true });

    await expect(approvalPromise).resolves.toMatchObject({ approved: true });
  });

  it('should treat approval responded tool part for unknown toolCallId as alreadyProcessed (idempotent 200)', async () => {
    const toolCallId = 'call_test_approval_missing';
    const conversationId = 'conv-123';

    const body = {
      conversationId,
      messages: [
        {
          role: 'assistant',
          content: null,
          parts: [
            {
              type: 'tool-delete_file',
              toolCallId,
              state: 'approval-responded',
              approval: { id: `aitxt-${toolCallId}`, approved: true },
            },
          ],
        },
      ],
    };

    const res = await makeRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      success: true,
      toolCallId,
      approved: true,
      alreadyProcessed: true,
    });
  });
});
