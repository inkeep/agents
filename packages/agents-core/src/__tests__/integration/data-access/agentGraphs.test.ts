import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAgentGraph,
  deleteAgentGraph,
  getAgentGraphById,
  getAgentGraphWithdefaultSubAgent,
  listAgentGraphs,
  listAgentGraphsPaginated,
  updateAgentGraph,
} from '../../../data-access/agentGraphs';
import {
  createSubAgentRelation,
  deleteAgentRelation,
} from '../../../data-access/subAgentRelations';
import { createSubAgent, deleteSubAgent } from '../../../data-access/subAgents';
import type { DatabaseClient } from '../../../db/client';
import * as schema from '../../../db/schema';
import {
  cleanupTestDatabase,
  closeTestDatabase,
  createTestDatabaseClient,
} from '../../../db/test-client';
import { createTestAgentData, createTestGraphData, createTestRelationData } from '../helpers';

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
      // Create agent graph first (before agents, as they need graphId)
      const graphData = createTestGraphData(testTenantId, testProjectId, '1');
      const createdGraph = await createAgentGraph(db)(graphData);

      // Now create an agent with the graphId
      const defaultSubAgentData = createTestAgentData(
        testTenantId,
        testProjectId,
        '1',
        createdGraph.id
      );
      const defaultSubAgent = await createSubAgent(db)({
        ...defaultSubAgentData,
      });

      expect(createdGraph).toMatchObject(graphData);
      expect(createdGraph.models).toEqual(graphData.models);
      expect(createdGraph.createdAt).toBeDefined();
      expect(createdGraph.updatedAt).toBeDefined();

      // Retrieve the graph
      const fetchedGraph = await getAgentGraphById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
      });

      expect(fetchedGraph).not.toBeNull();
      expect(fetchedGraph).toMatchObject(graphData);

      // Delete the agent and graph
      await deleteSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
        subAgentId: defaultSubAgent.id,
      });

      await deleteAgentGraph(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
      });
    });

    it('should return null when graph not found', async () => {
      const result = await getAgentGraphById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: 'non-existent-graph' },
      });

      expect(result).toBeNull();
    });
  });

  describe('getAgentGraphWithdefaultSubAgent', () => {
    it('should retrieve graph with related default agent data', async () => {
      // Create graph first (before agents, as they need graphId)
      const graphData = createTestGraphData(testTenantId, testProjectId, '2');
      await createAgentGraph(db)(graphData);

      // Now create agent with the graphId
      const defaultSubAgentData = createTestAgentData(
        testTenantId,
        testProjectId,
        '2',
        graphData.id
      );
      const defaultSubAgent = await createSubAgent(db)(defaultSubAgentData);

      // Fetch with relations
      const graphWithAgent = await getAgentGraphWithdefaultSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
      });

      // Delete the agent and graph
      await deleteSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
        subAgentId: defaultSubAgent.id,
      });

      await deleteAgentGraph(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
      });

      expect(graphWithAgent).not.toBeNull();
      expect(graphWithAgent?.defaultSubAgent).toBeDefined();
      expect(graphWithAgent?.defaultSubAgent?.name).toBe(defaultSubAgentData.name);
      expect(graphWithAgent?.defaultSubAgent?.id).toBe(defaultSubAgent.id);
    });
  });

  describe('listAgentGraphs & listAgentGraphsPaginated', () => {
    beforeEach(async () => {
      // Set up test data that all tests in this describe block need
      // Create test graphs first
      const graphsData = [
        createTestGraphData(testTenantId, testProjectId, '3'),
        createTestGraphData(testTenantId, testProjectId, '4'),
        createTestGraphData(testTenantId, testProjectId, '5'),
      ];

      for (const graphData of graphsData) {
        await createAgentGraph(db)(graphData);
      }

      // Create agents for the first graph (if needed)
      const firstGraphId = graphsData[0].id;
      const defaultSubAgentData = createTestAgentData(
        testTenantId,
        testProjectId,
        '3',
        firstGraphId
      );
      const _defaultSubAgent = await createSubAgent(db)(defaultSubAgentData);
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
      // Create graph first
      const graphData = createTestGraphData(testTenantId, testProjectId, '7');
      const _createdGraph = await createAgentGraph(db)(graphData);

      // Create agent with graphId
      const agentData = createTestAgentData(testTenantId, testProjectId, '7', graphData.id);
      const agent = await createSubAgent(db)(agentData);

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
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
      });

      expect(updatedGraph).toMatchObject({
        id: graphData.id,
        name: updateData.name,
        description: updateData.description,
        defaultSubAgentId: agent.id, // Should remain unchanged
        models: updateData.models,
      });
    });

    it('should handle model settings clearing', async () => {
      const graphData = createTestGraphData(testTenantId, testProjectId, '8');

      await createAgentGraph(db)(graphData);

      // Update to clear model settings (set to null)
      const updatedGraph = await updateAgentGraph(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
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
        scopes: { tenantId: 'tenant-2', projectId: testProjectId, graphId: tenant1GraphData.id },
        data: {
          name: 'Hacked Name',
        },
      });

      expect(result).toBeNull();

      // Verify original is unchanged
      const original = await getAgentGraphById(db)({
        scopes: { tenantId: 'tenant-1', projectId: testProjectId, graphId: tenant1GraphData.id },
      });

      expect(original?.name).toBe('Test Agent Graph 9');
    });
  });

  describe('deleteAgentGraph', () => {
    it('should delete graph and clean up relationships', async () => {
      // Create graph first (before agents, as they need graphId)
      const graphData = createTestGraphData(testTenantId, testProjectId, '12');
      const _createdGraph = await createAgentGraph(db)(graphData);

      // Create agents with graphId
      const routerAgentData = createTestAgentData(testTenantId, testProjectId, '10', graphData.id);
      const routerAgent = await createSubAgent(db)(routerAgentData);

      const qaAgentData = createTestAgentData(testTenantId, testProjectId, '11', graphData.id);
      const qaAgent = await createSubAgent(db)(qaAgentData);

      // Create a relation in this graph
      const relationData = createTestRelationData(testTenantId, testProjectId, '12');

      const createdRelation = await createSubAgentRelation(db)(relationData);

      // Verify graph exists
      const beforeDelete = await getAgentGraphById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
      });
      expect(beforeDelete).not.toBeNull();

      // Delete relation first (due to foreign key constraints)
      await deleteAgentRelation(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
        relationId: createdRelation.id,
      });

      // Delete graph
      const deleteResult = await deleteAgentGraph(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
      });

      expect(deleteResult).toBe(true);

      // Verify deletion
      const afterDelete = await getAgentGraphById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: graphData.id },
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
      const tenant1GraphData = createTestGraphData('tenant-1', testProjectId, '13');

      await createAgentGraph(db)(tenant1GraphData);

      // Try to delete from different tenant
      await deleteAgentGraph(db)({
        scopes: { tenantId: 'tenant-2', projectId: testProjectId, graphId: tenant1GraphData.id },
      });

      // Verify graph still exists
      const stillExists = await getAgentGraphById(db)({
        scopes: { tenantId: 'tenant-1', projectId: testProjectId, graphId: tenant1GraphData.id },
      });

      expect(stillExists).not.toBeNull();
      expect(stillExists?.name).toBe('Test Agent Graph 13');
    });
  });
});
