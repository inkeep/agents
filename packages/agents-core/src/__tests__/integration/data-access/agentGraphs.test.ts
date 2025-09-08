import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll } from 'vitest';
import {
  cleanupTestDatabase,
  closeTestDatabase,
  createTestDatabaseClient,
} from '../../../db/test-client';
import { createAgent, deleteAgent } from '../../../data-access/agents';
import {
  createAgentGraph,
  getAgentGraphById,
  getAgentGraphWithDefaultAgent,
  listAgentGraphs,
  listAgentGraphsPaginated,
  updateAgentGraph,
  deleteAgentGraph,
} from '../../../data-access/agentGraphs';
import { createAgentRelation, deleteAgentRelation } from '../../../data-access/agentRelations';
import type { DatabaseClient } from '../../../db/client';
import { createTestAgentData, createTestGraphData, createTestRelationData } from '../helpers';
import * as schema from '../../../db/schema';

describe('Agent Graphs Data Access - Integration Tests', () => {
  let db: DatabaseClient;
  let dbPath: string;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';

  beforeAll(async () => {
    // Create one database for the entire test suite
    const dbInfo = await createTestDatabaseClient('agent-graphs-integration');
    db = dbInfo.client;
    dbPath = dbInfo.path;

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

  afterEach(async () => {
    // Clean up data between tests but keep the database file
    await cleanupTestDatabase(db);

    // Recreate test projects for all tenant IDs for next test
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

  afterAll(async () => {
    // Close database and delete the file after all tests
    await closeTestDatabase(db, dbPath);
  });

  describe('createAgentGraph & getAgentGraphById', () => {
    it('should create and retrieve an agent graph with default agent', async () => {
      // First create an agent to be the default
      const defaultAgentData = createTestAgentData(testTenantId, testProjectId, '1');

      const defaultAgent = await createAgent(db)({
        ...defaultAgentData,
      });

      // Create agent graph
      const graphData = createTestGraphData(testTenantId, testProjectId, '1');

      const createdGraph = await createAgentGraph(db)(graphData);

      expect(createdGraph).toMatchObject(graphData);
      expect(createdGraph.models).toEqual(graphData.models);
      expect(createdGraph.createdAt).toBeDefined();
      expect(createdGraph.updatedAt).toBeDefined();

      // Retrieve the graph
      const fetchedGraph = await getAgentGraphById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: graphData.id,
      });

      expect(fetchedGraph).not.toBeNull();
      expect(fetchedGraph).toMatchObject(graphData);

      // Delete the agent and graph
      await deleteAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        agentId: defaultAgent.id,
      });

      await deleteAgentGraph(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: graphData.id,
      });
    });

    it('should return null when graph not found', async () => {
      const result = await getAgentGraphById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: 'non-existent-graph',
      });

      expect(result).toBeNull();
    });
  });

  describe('getAgentGraphWithDefaultAgent', () => {
    it('should retrieve graph with related default agent data', async () => {
      const defaultAgentData = createTestAgentData(testTenantId, testProjectId, '2');
      const defaultAgent = await createAgent(db)(defaultAgentData);

      // Create graph
      const graphData = createTestGraphData(testTenantId, testProjectId, '2');

      await createAgentGraph(db)(graphData);

      // Fetch with relations
      const graphWithAgent = await getAgentGraphWithDefaultAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: graphData.id,
      });

      // Delete the agent and graph
      await deleteAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        agentId: defaultAgent.id,
      });

      await deleteAgentGraph(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: graphData.id,
      });

      expect(graphWithAgent).not.toBeNull();
      expect(graphWithAgent?.defaultAgent).toBeDefined();
      expect(graphWithAgent?.defaultAgent?.name).toBe(defaultAgentData.name);
      expect(graphWithAgent?.defaultAgent?.id).toBe(defaultAgent.id);
    });
  });

  describe('listAgentGraphs & listAgentGraphsPaginated', () => {
    beforeEach(async () => {
      // Set up test data that all tests in this describe block need
      // First create a default agent
      const defaultAgentData = createTestAgentData(testTenantId, testProjectId, '3');
      const defaultAgent = await createAgent(db)(defaultAgentData);

      // Create test graphs with defaultAgentId
      const graphsData = [
        createTestGraphData(testTenantId, testProjectId, '3'),
        createTestGraphData(testTenantId, testProjectId, '4'),
        createTestGraphData(testTenantId, testProjectId, '5'),
      ];

      for (const graphData of graphsData) {
        await createAgentGraph(db)(graphData);
      }
    });

    it('should list all graphs for tenant', async () => {
      const graphs = await listAgentGraphs(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(graphs).toHaveLength(3);
      expect(graphs.map((g) => g.name).sort()).toEqual([
        'Test Agent Graph 3',
        'Test Agent Graph 4',
        'Test Agent Graph 5',
      ]);
      expect(graphs.every((g) => g.tenantId === testTenantId)).toBe(true);
      expect(graphs.every((g) => g.projectId === testProjectId)).toBe(true);
    });

    it('should maintain tenant isolation in listing', async () => {
      const otherTenantGraphData = createTestGraphData('other-tenant', testProjectId, '6');
      // Create graph for different tenant
      await createAgentGraph(db)(otherTenantGraphData);

      const mainTenantGraphs = await listAgentGraphs(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(mainTenantGraphs).toHaveLength(3); // Only the original 3
      expect(mainTenantGraphs.every((g) => g.tenantId === testTenantId)).toBe(true);
    });

    it('should handle pagination correctly', async () => {
      // Test first page
      const page1 = await listAgentGraphsPaginated(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: {
          limit: 2,
          page: 1,
        },
      });

      expect(page1.data).toHaveLength(2);

      // Test second page
      const page2 = await listAgentGraphsPaginated(db)({
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
      const result = await listAgentGraphsPaginated(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result.data).toHaveLength(3); // Should return all
    });
  });

  describe('updateAgentGraph', () => {
    it('should update graph properties and maintain relationships', async () => {
      // Create agent and graph
      const agentData = createTestAgentData(testTenantId, testProjectId, '7');
      const agent = await createAgent(db)(agentData);

      const graphData = createTestGraphData(testTenantId, testProjectId, '7');

      const createdGraph = await createAgentGraph(db)(graphData);

      // Update graph
      const updateData = {
        name: 'Updated Graph',
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

      const updatedGraph = await updateAgentGraph(db)({
        data: updateData,
        graphId: graphData.id,
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(updatedGraph).toMatchObject({
        id: graphData.id,
        name: updateData.name,
        description: updateData.description,
        defaultAgentId: agent.id, // Should remain unchanged
        models: updateData.models,
      });
    });

    it('should handle model settings clearing', async () => {
      const graphData = createTestGraphData(testTenantId, testProjectId, '8');

      await createAgentGraph(db)(graphData);

      // Update to clear model settings (set to null)
      const updatedGraph = await updateAgentGraph(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: graphData.id,
        data: {
          models: null,
        },
      });

      expect(updatedGraph.models).toBeNull();
    });

    it('should maintain tenant isolation during updates', async () => {
      const tenant1GraphData = createTestGraphData('tenant-1', testProjectId, '9');

      await createAgentGraph(db)(tenant1GraphData);

      // Try to update from different tenant
      const result = await updateAgentGraph(db)({
        scopes: { tenantId: 'tenant-2', projectId: testProjectId },
        graphId: tenant1GraphData.id,
        data: {
          name: 'Hacked Name',
        },
      });

      expect(result).toBeNull();

      // Verify original is unchanged
      const original = await getAgentGraphById(db)({
        scopes: { tenantId: 'tenant-1', projectId: testProjectId },
        graphId: tenant1GraphData.id,
      });

      expect(original?.name).toBe('Test Agent Graph 9');
    });
  });

  describe('deleteAgentGraph', () => {
    it('should delete graph and clean up relationships', async () => {
      // Create agents
      const routerAgentData = createTestAgentData(testTenantId, testProjectId, '10');
      const routerAgent = await createAgent(db)(routerAgentData);

      const qaAgentData = createTestAgentData(testTenantId, testProjectId, '11');
      const qaAgent = await createAgent(db)(qaAgentData);

      // Create graph
      const graphData = createTestGraphData(testTenantId, testProjectId, '12');

      const createdGraph = await createAgentGraph(db)(graphData);

      // Create a relation in this graph
      const relationData = createTestRelationData(testTenantId, testProjectId, '12');

      const createdRelation = await createAgentRelation(db)(relationData);

      // Verify graph exists
      const beforeDelete = await getAgentGraphById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: graphData.id,
      });
      expect(beforeDelete).not.toBeNull();

      // Delete relation first (due to foreign key constraints)
      await deleteAgentRelation(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        relationId: createdRelation.id,
      });

      // Delete graph
      const deleteResult = await deleteAgentGraph(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: graphData.id,
      });

      expect(deleteResult).toBe(true);

      // Verify deletion
      const afterDelete = await getAgentGraphById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: graphData.id,
      });
      expect(afterDelete).toBeNull();

      // Verify agents still exist (should not cascade delete)
      const routerStillExists = await db.query.agents.findFirst({
        where: (agents, { eq }) => eq(agents.id, routerAgent.id),
      });
      const qaStillExists = await db.query.agents.findFirst({
        where: (agents, { eq }) => eq(agents.id, qaAgent.id),
      });

      expect(routerStillExists).not.toBeNull();
      expect(qaStillExists).not.toBeNull();
    });

    it('should maintain tenant isolation during deletion', async () => {
      const tenant1GraphData = createTestGraphData('tenant-1', testProjectId, '13');

      await createAgentGraph(db)(tenant1GraphData);

      // Try to delete from different tenant
      await deleteAgentGraph(db)({
        scopes: { tenantId: 'tenant-2', projectId: testProjectId },
        graphId: tenant1GraphData.id,
      });

      // Verify graph still exists
      const stillExists = await getAgentGraphById(db)({
        scopes: { tenantId: 'tenant-1', projectId: testProjectId },
        graphId: tenant1GraphData.id,
      });

      expect(stillExists).not.toBeNull();
      expect(stillExists?.name).toBe('Test Agent Graph 13');
    });
  });
});
