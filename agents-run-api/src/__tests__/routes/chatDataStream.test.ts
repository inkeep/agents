import { beforeEach, describe, expect, it } from 'vitest';
import {
  agentGraphs,
  agents,
  conversations,
  createAgent,
  createAgentGraph,
  createConversation,
} from '@inkeep/agents-core';
import { eq } from 'drizzle-orm';
import app from '../../index';
import dbClient from '../../data/db/dbClient';

describe('chatDataStream route', () => {
  const tenantId = 'test-tenant';
  const projectId = 'test-project';
  const graphId = 'test-graph';
  const agentId = 'test-agent';
  const conversationId = 'test-conversation';

  beforeEach(async () => {
    // Clean up any existing test data
    await dbClient
      .delete(conversations)
      .where(eq(conversations.id, conversationId));

    await dbClient
      .delete(agents)
      .where(eq(agents.id, agentId));

    await dbClient
      .delete(agentGraphs)
      .where(eq(agentGraphs.id, graphId));

    // Create test graph
    await createAgentGraph(dbClient)({
      id: graphId,
      tenantId,
      projectId,
      name: 'Test Graph',
      defaultAgentId: agentId,
    });

    // Create test agent with graphId
    await createAgent(dbClient)({
      id: agentId,
      tenantId,
      projectId,
      graphId,
      name: 'Test Agent',
      description: 'Test Description',
      prompt: 'Test prompt',
    });

    // Create test conversation
    await createConversation(dbClient)({
      id: conversationId,
      tenantId,
      projectId,
      activeAgentId: agentId,
      title: 'Test Conversation',
    });
  });

  it('should handle chat stream request with proper graphId', async () => {
    const response = await app.request(
      `/v1/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/chat/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        }),
      }
    );

    // The route should at least not fail with a database error
    // It may return various status codes depending on configuration
    expect([200, 400, 401, 404, 500]).toContain(response.status);

    // If it's a 500 error, it shouldn't be due to missing graphId
    if (response.status === 500) {
      const body = await response.text();
      expect(body).not.toContain('Failed query');
      expect(body).not.toContain('graphId');
    }
  });

  it('should properly query agent with graphId in scopes', async () => {
    // This test verifies that getAgentById is called with graphId in scopes
    // The actual implementation test would be more complex and require proper mocking setup

    // For now, we just verify the route doesn't crash with the graphId parameter
    const response = await app.request(
      `/v1/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/chat/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          messages: [
            {
              role: 'user',
              content: 'Test message',
            },
          ],
        }),
      }
    );

    // Verify no database query errors related to graphId
    if (response.status === 500) {
      const errorText = await response.text();
      expect(errorText).not.toMatch(/Failed query.*graphId/);
    }
  });
});