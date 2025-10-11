import { beforeEach, describe, expect, it } from 'vitest';
import { createAgent } from '../../../data-access/agents';
import {
  createConversation,
  getConversation,
  updateConversationActiveAgent,
} from '../../../data-access/conversations';
import { createSubAgent } from '../../../data-access/subAgents';
import type { DatabaseClient } from '../../../db/client';
import * as schema from '../../../db/schema';
import { createTestDatabaseClient } from '../../../db/test-client';
import type { ConversationInsert } from '../../../types/index';
import { createTestAgentData, createtestAgentData } from '../helpers';

const createTestConversationData = (
  tenantId: string,
  projectId: string,
  suffix: string
): ConversationInsert => {
  return {
    id: `test-conversation-${suffix}`,
    tenantId,
    projectId,
    userId: `user-${suffix}`,
    title: `Test Conversation ${suffix}`,
    activeSubAgentId: `test-agent-${suffix}`,
    metadata: {
      userContext: {
        name: `Test User ${suffix}`,
        email: `test-user-${suffix}@example.com`,
        phone: `+1234567890${suffix}`,
      },
    },
  };
};

describe('Conversations Data Access - Integration Tests', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';

  beforeEach(async () => {
    // Create fresh in-memory database for each test
    db = await createTestDatabaseClient();

    // Create test projects and agent for all tenant IDs used in tests
    const tenantIds = [testTenantId, 'tenant-1', 'tenant-2'];
    for (const tenantId of tenantIds) {
      await db
        .insert(schema.projects)
        .values({
          tenantId: tenantId,
          id: testProjectId,
          name: 'Test Project',
          description: 'Project for testing',
        })
        .onConflictDoNothing();

      // Create test agent for each project
      for (let i = 1; i <= 3; i++) {
        const agentId = `test-agent-${i}`;
        const defaultSubAgentId = `test-agent-${i}`;

        await db
          .insert(schema.agents)
          .values({
            tenantId: tenantId,
            projectId: testProjectId,
            id: agentId,
            name: `Test Agent ${i}`,
            description: 'Agent for testing',
            defaultSubAgentId: defaultSubAgentId,
          })
          .onConflictDoNothing();

        // Create the default agent for the agent
        await db
          .insert(schema.subAgents)
          .values({
            tenantId: tenantId,
            projectId: testProjectId,
            agentId,
            id: defaultSubAgentId,
            name: `Default Agent ${i}`,
            description: 'Default agent for testing',
            prompt: 'You are a test agent',
          })
          .onConflictDoNothing();
      }
    }
  });

  describe('createConversation & getConversation', () => {
    it('should create and retrieve a conversation with full configuration', async () => {
      // Create a agent first (before agents, as they need agentId)
      const graphData = createtestAgentData(testTenantId, testProjectId, 'conv-1');
      await createAgent(db)(graphData);

      // Create an agent with agentId
      const _agent = await createSubAgent(db)(
        createTestAgentData(testTenantId, testProjectId, '1', graphData.id)
      );

      const conversationData = createTestConversationData(testTenantId, testProjectId, '1');

      // Create conversation
      const createdConversation = await createConversation(db)(conversationData);

      expect(createdConversation).toMatchObject(conversationData);
      expect(createdConversation.metadata).toEqual(conversationData.metadata);
      expect(createdConversation.createdAt).toBeDefined();
      expect(createdConversation.updatedAt).toBeDefined();
      expect(typeof createdConversation.createdAt).toBe('string');

      // Retrieve conversation
      const fetchedConversation = await getConversation(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: conversationData.id,
      });

      expect(fetchedConversation).not.toBeNull();
      expect(fetchedConversation).toMatchObject(conversationData);
    });

    it('should create conversation with minimal required fields', async () => {
      const minimalConversationData = {
        id: 'minimal-conversation',
        tenantId: testTenantId,
        projectId: testProjectId,
        userId: 'user-minimal',
        title: 'Minimal Conversation',
        activeSubAgentId: 'test-agent-1',
      };

      const createdConversation = await createConversation(db)(minimalConversationData);

      expect(createdConversation.metadata).toBeNull();
      expect(createdConversation.title).toBe(minimalConversationData.title);
      expect(createdConversation.userId).toBe(minimalConversationData.userId);
    });

    it('should return undefined when conversation not found', async () => {
      const result = await getConversation(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: 'non-existent-conversation',
      });

      expect(result).toBeUndefined();
    });

    it('should maintain tenant isolation', async () => {
      const tenant1ConversationData = createTestConversationData('tenant-1', testProjectId, '1');
      const tenant2ConversationData = createTestConversationData('tenant-2', testProjectId, '2');

      // Create conversations for different tenants
      await createConversation(db)(tenant1ConversationData);
      await createConversation(db)(tenant2ConversationData);

      // Tenant 1 should only see their conversation
      const tenant1Result = await getConversation(db)({
        scopes: { tenantId: 'tenant-1', projectId: testProjectId },
        conversationId: tenant1ConversationData.id,
      });
      expect(tenant1Result).not.toBeNull();
      expect(tenant1Result?.title).toBe(tenant1ConversationData.title);

      // Tenant 1 should not see tenant 2's conversation
      const tenant1CrossResult = await getConversation(db)({
        scopes: { tenantId: 'tenant-1', projectId: testProjectId },
        conversationId: tenant2ConversationData.id,
      });
      expect(tenant1CrossResult).toBeUndefined();
    });
  });

  describe('updateConversationActiveAgent', () => {
    it('should update active agent and timestamp', async () => {
      // Create a agent first (before agents, as they need agentId)
      const graphData = createtestAgentData(testTenantId, testProjectId, 'conv-2');
      await createAgent(db)(graphData);

      // Create agents with agentId
      const initialAgentData = createTestAgentData(testTenantId, testProjectId, '1', graphData.id);
      const initialAgent = await createSubAgent(db)(initialAgentData);

      const newAgentData = createTestAgentData(testTenantId, testProjectId, '2', graphData.id);
      const newAgent = await createSubAgent(db)(newAgentData);

      // Create conversation with initial agent
      const conversationData = createTestConversationData(testTenantId, testProjectId, '1');
      conversationData.activeSubAgentId = initialAgent.id;

      const createdConversation = await createConversation(db)(conversationData);

      expect(createdConversation.activeSubAgentId).toBe(initialAgent.id);
      const originalUpdatedAt = createdConversation.updatedAt;

      // Wait a moment to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update active agent
      const updatedConversation = await updateConversationActiveAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: conversationData.id,
        activeSubAgentId: newAgent.id,
      });

      expect(updatedConversation.activeSubAgentId).toBe(newAgent.id);
      expect(updatedConversation.updatedAt).not.toBe(originalUpdatedAt);
      expect(updatedConversation.createdAt).toBe(createdConversation.createdAt); // Should remain unchanged
      expect(updatedConversation.id).toBe(conversationData.id);
      expect(updatedConversation.title).toBe(conversationData.title); // Other fields unchanged
    });

    it('should maintain tenant isolation during agent updates', async () => {
      // Create a agent first (before agents, as they need agentId)
      const graphData = createtestAgentData(testTenantId, testProjectId, 'conv-3');
      await createAgent(db)(graphData);

      // Create agent and conversation for tenant 1
      const agentData = createTestAgentData(testTenantId, testProjectId, '1', graphData.id);
      const agent = await createSubAgent(db)(agentData);

      const conversationData = createTestConversationData(testTenantId, testProjectId, '1');
      conversationData.activeSubAgentId = agent.id;

      await createConversation(db)(conversationData);

      // Try to update from different tenant
      const result = await updateConversationActiveAgent(db)({
        scopes: { tenantId: 'tenant-2', projectId: testProjectId },
        conversationId: conversationData.id,
        activeSubAgentId: 'non-existent-agent',
      });

      expect(result).toBeUndefined();

      // Verify original conversation is unchanged
      const originalConversation = await getConversation(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: conversationData.id,
      });

      expect(originalConversation).not.toBeUndefined();
      expect(originalConversation?.activeSubAgentId).toBe(agent.id);
    });

    it('should return undefined when updating non-existent conversation', async () => {
      const result = await updateConversationActiveAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: 'non-existent-conversation',
        activeSubAgentId: 'non-existent-agent',
      });

      expect(result).toBeUndefined();
    });
  });
});
