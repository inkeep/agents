import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAgent,
  deleteAgent,
  getAgentById,
  getAgentWithDefaultSubAgent,
  listAgents,
  listAgentsPaginated,
  updateAgent,
} from '../../../data-access/agents';
import {
  createSubAgentRelation,
  deleteSubAgentRelation,
} from '../../../data-access/subAgentRelations';
import { createSubAgent, deleteSubAgent } from '../../../data-access/subAgents';
import type { DatabaseClient } from '../../../db/client';
import * as schema from '../../../db/schema';
import { createTestDatabaseClient } from '../../../db/test-client';
import { createTestSubAgentData, createTestAgentData, createTestRelationData } from '../helpers';

describe('Agent Agent Data Access - Integration Tests', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';

  beforeEach(async () => {
    // Create fresh in-memory database for each test
    db = await createTestDatabaseClient();

    // Create test projects for all tenant IDs used in tests
    const tenantIds = [testTenantId, 'other-tenant', 'tenant-1', 'tenant-2'];
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
    }
  });

  describe('createAgentAgent & getAgentAgentById', () => {
    it('should create and retrieve an agent agent with default agent', async () => {
      // Create agent agent first (before agents, as they need agentId)
      const agentData = createTestAgentData(testTenantId, testProjectId, '1');
      const createdAgent = await createAgent(db)(agentData);

      // Now create an agent with the agentId
      const defaultSubAgentData = createTestSubAgentData(
        testTenantId,
        testProjectId,
        '1',
        createdAgent.id
      );
      const defaultSubAgent = await createSubAgent(db)({
        ...defaultSubAgentData,
      });

      expect(createdAgent).toMatchObject(agentData);
      expect(createdAgent.models).toEqual(agentData.models);
      expect(createdAgent.createdAt).toBeDefined();
      expect(createdAgent.updatedAt).toBeDefined();

      // Retrieve the agent
      const fetchedAgent = await getAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
      });

      expect(fetchedAgent).not.toBeNull();
      expect(fetchedAgent).toMatchObject(agentData);

      // Delete the agent and agent
      await deleteSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
        subAgentId: defaultSubAgent.id,
      });

      await deleteAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
      });
    });

    it('should return null when agent not found', async () => {
      const result = await getAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: 'non-existent-agent' },
      });

      expect(result).toBeNull();
    });
  });

  describe('getAgentAgentWithDefaultSubAgent', () => {
    it('should retrieve agent with related default agent data', async () => {
      // Create agent first (before agents, as they need agentId)
      const agentData = createTestAgentData(testTenantId, testProjectId, '2');
      await createAgent(db)(agentData);

      // Now create agent with the agentId
      const defaultSubAgentData = createTestSubAgentData(
        testTenantId,
        testProjectId,
        '2',
        agentData.id
      );
      const defaultSubAgent = await createSubAgent(db)(defaultSubAgentData);

      // Fetch with relations
      const agentWithAgent = await getAgentWithDefaultSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
      });

      // Delete the agent and agent
      await deleteSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
        subAgentId: defaultSubAgent.id,
      });

      await deleteAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
      });

      expect(agentWithAgent).not.toBeNull();
      expect(agentWithAgent?.defaultSubAgent).toBeDefined();
      expect(agentWithAgent?.defaultSubAgent?.name).toBe(defaultSubAgentData.name);
      expect(agentWithAgent?.defaultSubAgent?.id).toBe(defaultSubAgent.id);
    });
  });

  describe('listAgentAgents & listAgentAgentsPaginated', () => {
    beforeEach(async () => {
      // Set up test data that all tests in this describe block need
      // Create test agent first
      const agentsData = [
        createTestAgentData(testTenantId, testProjectId, '3'),
        createTestAgentData(testTenantId, testProjectId, '4'),
        createTestAgentData(testTenantId, testProjectId, '5'),
      ];

      for (const agentData of agentsData) {
        await createAgent(db)(agentData);
      }

      // Create agents for the first agent (if needed)
      const firstAgentId = agentsData[0].id;
      const defaultSubAgentData = createTestSubAgentData(
        testTenantId,
        testProjectId,
        '3',
        firstAgentId
      );
      const _defaultSubAgent = await createSubAgent(db)(defaultSubAgentData);
    });

    it('should list all agent for tenant', async () => {
      const agent = await listAgents(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(agent).toHaveLength(3);
      expect(agent.map((g) => g.name).sort()).toEqual([
        'Test Agent Agent 3',
        'Test Agent Agent 4',
        'Test Agent Agent 5',
      ]);
      expect(agent.every((g) => g.tenantId === testTenantId)).toBe(true);
      expect(agent.every((g) => g.projectId === testProjectId)).toBe(true);
    });

    it('should maintain tenant isolation in listing', async () => {
      const otherTenantAgentData = createTestAgentData('other-tenant', testProjectId, '6');
      // Create agent for different tenant
      await createAgent(db)(otherTenantAgentData);

      const mainTenantAgents = await listAgents(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(mainTenantAgents).toHaveLength(3); // Only the original 3
      expect(mainTenantAgents.every((g) => g.tenantId === testTenantId)).toBe(true);
    });

    it('should handle pagination correctly', async () => {
      // Test first page
      const page1 = await listAgentsPaginated(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: {
          limit: 2,
          page: 1,
        },
      });

      expect(page1.data).toHaveLength(2);

      // Test second page
      const page2 = await listAgentsPaginated(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: {
          limit: 2,
          page: 2,
        },
      });

      expect(page2.data).toHaveLength(1);

      // Ensure no overlap
      const page1Ids = page1.data.map((g) => g.id);
      const page2Ids = page2.data.map((g) => g.id);
      const intersection = page1Ids.filter((id) => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('should handle pagination without limit/offset', async () => {
      const result = await listAgentsPaginated(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result.data).toHaveLength(3); // Should return all
    });
  });

  describe('updateAgentAgent', () => {
    it('should update agent properties and maintain relationships', async () => {
      // Create agent first
      const agentData = createTestAgentData(testTenantId, testProjectId, '7');
      const _createdAgent = await createAgent(db)(agentData);

      // Create agent with agentId
      const subAgentData = createTestSubAgentData(testTenantId, testProjectId, '7', agentData.id);
      const agent = await createSubAgent(db)(subAgentData);

      // Update agent
      const updateData = {
        name: 'Updated Agent',
        description: 'Updated description',
        models: {
          base: {
            model: 'gpt-4',
            providerOptions: {
              anthropic: {
                temperature: 0.8,
              },
            },
          },
          structuredOutput: {
            model: 'gpt-4o-mini',
          },
        },
      };

      const updatedAgent = await updateAgent(db)({
        data: updateData,
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
      });

      expect(updatedAgent).toMatchObject({
        id: agentData.id,
        name: updateData.name,
        description: updateData.description,
        defaultSubAgentId: agent.id, // Should remain unchanged
        models: updateData.models,
      });
    });

    it('should handle model settings clearing', async () => {
      const agentData = createTestAgentData(testTenantId, testProjectId, '8');

      await createAgent(db)(agentData);

      // Update to clear model settings (set to null)
      const updatedAgent = await updateAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
        data: {
          models: null,
        },
      });

      expect(updatedAgent.models).toBeNull();
    });

    it('should maintain tenant isolation during updates', async () => {
      const tenant1AgentData = createTestAgentData('tenant-1', testProjectId, '9');

      await createAgent(db)(tenant1AgentData);

      // Try to update from different tenant
      const result = await updateAgent(db)({
        scopes: { tenantId: 'tenant-2', projectId: testProjectId, agentId: tenant1AgentData.id },
        data: {
          name: 'Hacked Name',
        },
      });

      expect(result).toBeNull();

      // Verify original is unchanged
      const original = await getAgentById(db)({
        scopes: { tenantId: 'tenant-1', projectId: testProjectId, agentId: tenant1AgentData.id },
      });

      expect(original?.name).toBe('Test Agent Agent 9');
    });
  });

  describe('deleteAgentAgent', () => {
    it('should delete agent and clean up relationships', async () => {
      // Create agent first (before agents, as they need agentId)
      const agentData = createTestAgentData(testTenantId, testProjectId, '12');
      const _createdAgent = await createAgent(db)(agentData);

      // Create agents with agentId
      const routerAgentData = createTestSubAgentData(testTenantId, testProjectId, '10', agentData.id);
      const routerAgent = await createSubAgent(db)(routerAgentData);

      const qaAgentData = createTestSubAgentData(testTenantId, testProjectId, '11', agentData.id);
      const qaAgent = await createSubAgent(db)(qaAgentData);

      // Create a relation in this agent
      const relationData = createTestRelationData(testTenantId, testProjectId, '12');

      const createdRelation = await createSubAgentRelation(db)(relationData);

      // Verify agent exists
      const beforeDelete = await getAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
      });
      expect(beforeDelete).not.toBeNull();

      // Delete relation first (due to foreign key constraints)
      await deleteSubAgentRelation(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
        relationId: createdRelation.id,
      });

      // Delete agent
      const deleteResult = await deleteAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
      });

      expect(deleteResult).toBe(true);

      // Verify deletion
      const afterDelete = await getAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentData.id },
      });
      expect(afterDelete).toBeNull();

      // Verify agents still exist (should not cascade delete)
      const routerStillExists = await db.query.subAgents.findFirst({
        where: (agents, { eq }) => eq(agents.id, routerAgent.id),
      });
      const qaStillExists = await db.query.subAgents.findFirst({
        where: (agents, { eq }) => eq(agents.id, qaAgent.id),
      });

      expect(routerStillExists).not.toBeNull();
      expect(qaStillExists).not.toBeNull();
    });

    it('should maintain tenant isolation during deletion', async () => {
      const tenant1AgentData = createTestAgentData('tenant-1', testProjectId, '13');

      await createAgent(db)(tenant1AgentData);

      // Try to delete from different tenant
      await deleteAgent(db)({
        scopes: { tenantId: 'tenant-2', projectId: testProjectId, agentId: tenant1AgentData.id },
      });

      // Verify agent still exists
      const stillExists = await getAgentById(db)({
        scopes: { tenantId: 'tenant-1', projectId: testProjectId, agentId: tenant1AgentData.id },
      });

      expect(stillExists).not.toBeNull();
      expect(stillExists?.name).toBe('Test Agent Agent 13');
    });
  });
});
