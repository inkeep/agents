import {
  createFullGraphServerSide,
  deleteFullAgent,
  type FullGraphDefinition,
  getFullGraph,
  updateFullGraphServerSide,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import { describe, expect, it, vi } from 'vitest';
import dbClient from '../../data/db/dbClient';
import { createTestContextConfigData } from '../utils/testHelpers';
import { ensureTestProject } from '../utils/testProject';
import { createTestExternalAgentData, createTestSubAgentData } from '../utils/testSubAgent';
import { createTestTenantId } from '../utils/testTenant';

// Mock the logger to reduce noise in tests
vi.mock('../../logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('Graph Full Service Layer - Unit Tests', () => {
  // Helper function to create test tool data
  // const createTestToolData = (id: string, suffix = '') => ({
  //   id,
  //   name: `Test Tool${suffix}`,
  //   config: {
  //     type: 'mcp',
  //     mcp: {
  //       server: {
  //         url: `http://localhost:300${suffix || '1'}`,
  //       },
  //     },
  //   },
  //   status: 'unknown' as const,
  //   capabilities: { tools: true },
  //   lastHealthCheck: new Date().toISOString(),
  //   availableTools: [
  //     {
  //       name: `testTool${suffix}`,
  //       description: `Test tool function${suffix}`,
  //     },
  //   ],
  // });

  // Helper function to create test data component data
  // const createTestDataComponentData = (id: string, suffix = '') => ({
  //   id,
  //   name: `Test DataComponent${suffix}`,
  //   description: `Test data component description${suffix}`,
  //   props: {
  //     type: 'object',
  //     properties: {
  //       items: {
  //         type: 'array',
  //         items: { type: 'string' },
  //         description: `Test items array${suffix}`,
  //       },
  //       title: {
  //         type: 'string',
  //         description: `Test title${suffix}`,
  //       },
  //     },
  //     required: ['items'],
  //   },
  // });

  // Helper function to create full graph data
  const createFullGraphData = (
    graphId?: string,
    options: {
      includeDataComponents?: boolean;
      includeExternalAgents?: boolean;
      includeContextConfig?: boolean;
    } = {}
  ): FullGraphDefinition => {
    const id = graphId || nanoid();
    const subAgentId1 = `agent-${id}-1`;
    const subAgentId2 = `agent-${id}-2`;
    const externalSubAgentId = `external-agent-${id}`;
    const toolId1 = `tool-${id}-1`;
    const dataComponentId1 = `datacomponent-${id}-1`;
    const contextConfigId = `context-${id}`;

    const subAgent1 = createTestSubAgentData({ id: subAgentId1, suffix: ' Router' });
    const subAgent2 = createTestSubAgentData({ id: subAgentId2, suffix: ' Specialist' });
    // const tool1 = createTestToolData(toolId1, '1');

    // Set up relationships
    subAgent1.canTransferTo = [subAgentId2];
    subAgent1.canDelegateTo = [subAgentId2];

    // Add tool ID to subAgent (not the tool object)
    subAgent1.tools = [toolId1];

    // Add dataComponent if requested
    if (options.includeDataComponents) {
      subAgent1.dataComponents = [dataComponentId1];
    }

    // Add external subAgent relationships if requested
    if (options.includeExternalAgents) {
      subAgent1.canDelegateTo.push(externalSubAgentId);
    }

    const graphData: FullGraphDefinition = {
      id,
      name: `Test Graph ${id}`,
      description: `Test graph description for ${id}`,
      defaultSubAgentId: subAgentId1,
      subAgents: {
        [subAgentId1]: subAgent1,
        [subAgentId2]: subAgent2,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add external agents if requested
    if (options.includeExternalAgents) {
      graphData.subAgents[externalSubAgentId] = createTestExternalAgentData({
        id: externalSubAgentId,
      });
    }

    // Note: DataComponents are now project-scoped and should be created separately
    // dataComponents are no longer part of the graph definition

    // Add context config if requested
    if (options.includeContextConfig) {
      graphData.contextConfig = createTestContextConfigData(contextConfigId, id, '');
    }

    return graphData;
  };

  describe('createFullGraph', () => {
    it('should create a basic graph with agents only', async () => {
      const tenantId = createTestTenantId('service-create-basic');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      // Create a simple graph with just agents (no project-scoped resources)
      const graphData: FullGraphDefinition = {
        id: `test-graph-${nanoid()}`,
        name: 'Basic Test Graph',
        description: 'A basic test graph with agents only',
        defaultSubAgentId: 'agent-1',
        subAgents: {
          'agent-1': {
            id: 'agent-1',
            name: 'Test Agent 1',
            description: 'Test agent description',
            prompt: 'You are a helpful assistant.',
            canUse: [],
            type: 'internal' as const,
          },
          'agent-2': {
            id: 'agent-2',
            name: 'Test Agent 2',
            description: 'Test agent description',
            prompt: 'You are a helpful assistant.',
            canUse: [],
            canTransferTo: ['agent-1'],
            type: 'internal' as const,
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      expect(result).toBeDefined();
      expect(result.id).toBe(graphData.id);
      expect(result.name).toBe(graphData.name);
      expect(result.defaultSubAgentId).toBe(graphData.defaultSubAgentId);
      expect(Object.keys(result.subAgents)).toHaveLength(2);
    });

    it('should create a complete graph with all entities', async () => {
      const tenantId = createTestTenantId('service-create');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      const result = await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      expect(result).toBeDefined();
      expect(result.id).toBe(graphData.id);
      expect(result.name).toBe(graphData.name);
      expect(result.defaultSubAgentId).toBe(graphData.defaultSubAgentId);
      expect(Object.keys(result.subAgents)).toHaveLength(2);

      // Verify agent relationships were created
      if (graphData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[graphData.defaultSubAgentId];
        expect(defaultSubAgent).toBeDefined();
        if ('canTransferTo' in defaultSubAgent) {
          expect(defaultSubAgent.canTransferTo).toContain(Object.keys(graphData.subAgents)[1]);
        }
        if ('canDelegateTo' in defaultSubAgent) {
          expect(defaultSubAgent.canDelegateTo).toContain(Object.keys(graphData.subAgents)[1]);
        }
        // Verify tool IDs are preserved (but actual tools are project-scoped)
        if ('tools' in defaultSubAgent) {
          expect(defaultSubAgent.tools).toBeDefined();
          expect(Array.isArray(defaultSubAgent.tools)).toBe(true);
        }
      }
    });

    it('should handle graph with single agent and no relationships', async () => {
      const tenantId = createTestTenantId('service-single-agent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const subAgentId = nanoid();
      const graphId = nanoid();

      const graphData: FullGraphDefinition = {
        id: graphId,
        name: 'Single Agent Graph',
        description: 'Graph with single agent',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            ...createTestSubAgentData({ id: subAgentId, suffix: ' Standalone' }),
            name: 'Single Agent',
            description: 'A standalone agent',
          },
        },
        // Note: tools are now project-scoped and not part of the graph definition
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      expect(result).toBeDefined();
      expect(result.id).toBe(graphId);
      expect(Object.keys(result.subAgents)).toHaveLength(1);
      const subAgent = result.subAgents[subAgentId];
      if ('canTransferTo' in subAgent) {
        expect(subAgent.canTransferTo).toHaveLength(0);
      }
      if ('canDelegateTo' in subAgent) {
        expect(subAgent.canDelegateTo).toHaveLength(0);
      }
      if ('tools' in subAgent) {
        expect(subAgent.tools).toHaveLength(0);
      }
    });

    it('should handle upsert behavior for existing graph', async () => {
      const tenantId = createTestTenantId('service-upsert');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Create the graph first time
      const firstResult = await createFullGraphServerSide(dbClient)(
        { tenantId, projectId },
        graphData
      );
      expect(firstResult.id).toBe(graphData.id);

      // Modify the graph data
      const updatedGraphData = {
        ...graphData,
        name: 'Updated Graph Name',
      };

      // Create again (should update)
      const secondResult = await createFullGraphServerSide(dbClient)(
        { tenantId, projectId },
        updatedGraphData
      );
      expect(secondResult.id).toBe(graphData.id);
      expect(secondResult.name).toBe('Updated Graph Name');
    });

    it('should create a graph with dataComponent references', async () => {
      const tenantId = createTestTenantId('service-create-datacomponents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData(undefined, { includeDataComponents: true });

      const result = await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      expect(result).toBeDefined();
      expect(result.id).toBe(graphData.id);

      // Verify sub-agent has dataComponent IDs (actual components are project-scoped)
      if (graphData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[graphData.defaultSubAgentId];
        expect(defaultSubAgent).toBeDefined();
        if ('dataComponents' in defaultSubAgent) {
          expect(defaultSubAgent.dataComponents).toBeDefined();
          // Note: In the new scoped architecture, dataComponents are not returned in agent objects
          expect(defaultSubAgent.dataComponents).toHaveLength(0);
        }
      }
    });

    it('should create a graph with external agents', async () => {
      const tenantId = createTestTenantId('service-create-external');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData(undefined, { includeExternalAgents: true });

      const result = await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      expect(result).toBeDefined();
      expect(result.id).toBe(graphData.id);

      // Find external subAgent
      const externalAgent = Object.values(result.subAgents).find(
        (subAgent) => subAgent.type === 'external' && subAgent.baseUrl?.includes('api.example.com')
      );
      expect(externalAgent).toBeDefined();
      if (externalAgent && externalAgent.type === 'external') {
        expect(externalAgent.baseUrl).toContain('api.example.com');
      }

      // Verify internal subAgent can hand off to external subAgent
      if (graphData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[graphData.defaultSubAgentId];
        if ('canDelegateTo' in defaultSubAgent) {
          expect(defaultSubAgent.canDelegateTo).toContain(externalAgent?.id);
        }
      }
    });

    it('should create a graph with context config', async () => {
      const tenantId = createTestTenantId('service-create-context');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData(undefined, { includeContextConfig: true });

      const result = await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      expect(result).toBeDefined();
      expect(result.id).toBe(graphData.id);
      expect(result.contextConfig).toBeDefined();
    });

    it('should create a graph with all components (comprehensive test)', async () => {
      const tenantId = createTestTenantId('service-create-comprehensive');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData(undefined, {
        includeDataComponents: true,
        includeExternalAgents: true,
        includeContextConfig: true,
      });

      const result = await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      expect(result).toBeDefined();
      expect(result.id).toBe(graphData.id);

      // Verify all subAgents exist
      expect(Object.keys(result.subAgents)).toHaveLength(3); // 2 internal + 1 external
      expect(result.contextConfig).toBeDefined();

      // Verify subAgent relationships and references
      if (graphData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[graphData.defaultSubAgentId];
        if ('dataComponents' in defaultSubAgent) {
          expect(defaultSubAgent.dataComponents).toHaveLength(0);
        }
        if ('canTransferTo' in defaultSubAgent) {
          expect(defaultSubAgent.canTransferTo).toHaveLength(1);
        }
        if ('canDelegateTo' in defaultSubAgent) {
          expect(defaultSubAgent.canDelegateTo).toHaveLength(2);
        }
      }

      // Verify external subAgent exists
      const externalAgent = Object.values(result.subAgents).find(
        (subAgent) => subAgent.type === 'external' && subAgent.baseUrl?.includes('api.example.com')
      );
      expect(externalAgent).toBeDefined();
    });
  });

  describe('getFullGraph', () => {
    it.skip('should retrieve an existing graph', async () => {
      const tenantId = createTestTenantId('service-get');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Create the graph first
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      // Retrieve it
      const result = await getFullGraph(dbClient)({
        scopes: { tenantId, projectId, agentId: graphData.id },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(graphData.id);
      expect(result?.name).toBe(graphData.name);
      if (result) {
        expect(Object.keys(result.subAgents)).toHaveLength(2);
      }
    });

    it.skip('should return null for non-existent graph', async () => {
      const tenantId = createTestTenantId('service-get-nonexistent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const nonExistentId = nanoid();

      const result = await getFullGraph(dbClient)({
        scopes: { tenantId, projectId, agentId: nonExistentId },
      });

      expect(result).toBeNull();
    });
  });

  describe('updateFullGraph', () => {
    it.skip('should update an existing graph', async () => {
      // TODO: Update this test to work with new scoped architecture
      const tenantId = createTestTenantId('service-update');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Create the graph first
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      // Update it
      const updatedGraphData = {
        ...graphData,
        name: 'Updated Graph Name',
        description: 'Updated description',
      };

      const result = await updateFullGraphServerSide(dbClient)(
        { tenantId, projectId },
        updatedGraphData
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(graphData.id);
      expect(result.name).toBe('Updated Graph Name');
      expect(result.description).toBe('Updated description');
      expect(Object.keys(result.subAgents)).toHaveLength(2);
    });

    it.skip('should create a new graph if it does not exist', async () => {
      const tenantId = createTestTenantId('service-update-create');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Update non-existent graph (should create)
      const result = await updateFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      expect(result).toBeDefined();
      expect(result.id).toBe(graphData.id);
      expect(result.name).toBe(graphData.name);
      expect(Object.keys(result.subAgents)).toHaveLength(2);
    });

    // NOTE: ID mismatch validation may have changed in the new implementation
    it.skip('should throw error for ID mismatch', async () => {
      const tenantId = createTestTenantId('service-update-mismatch');
      const projectId = 'default';

      const graphData = createFullGraphData();
      const differentId = nanoid();

      await expect(
        updateFullGraphServerSide(dbClient)(
          { tenantId, projectId },
          { ...graphData, id: differentId }
        )
      ).rejects.toThrow('Graph ID mismatch');
    });

    it.skip('should handle adding new subAgents in update', async () => {
      const tenantId = createTestTenantId('service-update-add-sub-agents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Create the graph first
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      // Add a new subAgent
      const newSubAgentId = `agent-${graphData.id}-3`;
      const updatedGraphData = {
        ...graphData,
        subAgents: {
          ...graphData.subAgents,
          [newSubAgentId]: createTestSubAgentData({ id: newSubAgentId, suffix: ' New Agent' }),
        },
      };

      // Update existing agent to have relationship with new agent
      // Note: canTransferTo is part of the agent definition in the input, not the returned result
      if (graphData.defaultSubAgentId) {
        const agent = updatedGraphData.subAgents[graphData.defaultSubAgentId];
        if (agent.type === 'internal' && agent.canTransferTo) {
          agent.canTransferTo.push(newSubAgentId);
        }
      }

      const result = await updateFullGraphServerSide(dbClient)(
        { tenantId, projectId },
        updatedGraphData
      );

      expect(result).toBeDefined();
      expect(Object.keys(result.subAgents)).toHaveLength(3);
      expect(result.subAgents).toHaveProperty(newSubAgentId);
      // Verify the relationship was created
      if (graphData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[graphData.defaultSubAgentId];
        if ('canTransferTo' in defaultSubAgent) {
          expect(defaultSubAgent.canTransferTo).toContain(newSubAgentId);
        }
      }
    });

    it.skip('should update graph with dataComponents', async () => {
      const tenantId = createTestTenantId('service-update-datacomponents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Create the graph first (without dataComponents)
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      // Update to include dataComponents
      const updatedGraphData = createFullGraphData(graphData.id, {
        includeDataComponents: true,
      });

      const result = await updateFullGraphServerSide(dbClient)(
        { tenantId, projectId },
        updatedGraphData
      );

      expect(result).toBeDefined();
      // Note: dataComponents are now project-scoped and not part of the graph definition
      // The agent.dataComponents array contains dataComponent IDs, but the actual dataComponent objects are at the project level

      // Verify agent-dataComponent relationship
      if (graphData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[graphData.defaultSubAgentId];
        if ('dataComponents' in defaultSubAgent) {
          expect(defaultSubAgent.dataComponents).toBeDefined();
          expect(defaultSubAgent.dataComponents).toHaveLength(1);
        }
      }
    });

    it.skip('should update graph with external agents', async () => {
      const tenantId = createTestTenantId('service-update-external');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Create the graph first (without external agents)
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      // Update to include external agents
      const updatedGraphData = createFullGraphData(graphData.id, {
        includeExternalAgents: true,
      });

      const result = await updateFullGraphServerSide(dbClient)(
        { tenantId, projectId },
        updatedGraphData
      );

      expect(result).toBeDefined();
      expect(Object.keys(result.subAgents)).toHaveLength(3); // 2 internal + 1 external

      // Find external agent
      const externalAgent = Object.values(result.subAgents).find(
        (subAgent) => subAgent.type === 'external' && subAgent.baseUrl?.includes('api.example.com')
      );
      expect(externalAgent).toBeDefined();
    });

    it.skip('should update graph removing dataComponents', async () => {
      const tenantId = createTestTenantId('service-update-remove-datacomponents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData(undefined, { includeDataComponents: true });

      // Create the graph first (with dataComponents)
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      // Update to remove dataComponents
      const updatedGraphData = createFullGraphData(graphData.id);

      const result = await updateFullGraphServerSide(dbClient)(
        { tenantId, projectId },
        updatedGraphData
      );

      expect(result).toBeDefined();

      // Agent should have no dataComponent relationships
      if (graphData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[graphData.defaultSubAgentId];
        if ('dataComponents' in defaultSubAgent) {
          expect(defaultSubAgent.dataComponents || []).toHaveLength(0);
        }
      }
    });

    it.skip('should handle complex update with all components', async () => {
      const tenantId = createTestTenantId('service-update-comprehensive');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const initialGraphData = createFullGraphData();

      // Create initial graph
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, initialGraphData);

      // Update with all components
      const updatedGraphData = createFullGraphData(initialGraphData.id, {
        includeDataComponents: true,
        includeExternalAgents: true,
        includeContextConfig: true,
      });

      const result = await updateFullGraphServerSide(dbClient)(
        { tenantId, projectId },
        updatedGraphData
      );

      expect(result).toBeDefined();
      expect(result.subAgents).toBeDefined();
      expect(Object.keys(result.subAgents || {})).toHaveLength(3);
      expect(result.contextConfig).toBeDefined();
    });
  });

  describe('Validation', () => {
    it.skip('should validate tool references in subAgents', async () => {
      const tenantId = createTestTenantId('service-validate-tools');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Add non-existent tool reference
      const subAgentId = Object.keys(graphData.subAgents)[0];
      if (subAgentId && 'tools' in graphData.subAgents[subAgentId]) {
        graphData.subAgents[subAgentId].tools = ['non-existent-tool'];
      }

      await expect(
        createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData)
      ).rejects.toThrow(/Tool reference validation failed/);
    });

    it.skip('should validate dataComponent references in subAgents', async () => {
      const tenantId = createTestTenantId('service-validate-datacomponents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Add non-existent dataComponent reference
      const subAgentId = Object.keys(graphData.subAgents)[0];
      if (subAgentId && 'dataComponents' in graphData.subAgents[subAgentId]) {
        graphData.subAgents[subAgentId].dataComponents = ['non-existent-datacomponent'];
      }

      await expect(
        createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData)
      ).rejects.toThrow(/DataComponent reference validation failed/);
    });

    it.skip('should validate default subAgent exists', async () => {
      const tenantId = createTestTenantId('service-validate-default-subAgent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Set non-existent default subAgent
      graphData.defaultSubAgentId = 'non-existent-subAgent';

      await expect(
        createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData)
      ).rejects.toThrow(/Default subAgent .* does not exist in subAgents/);
    });

    it.skip('should validate subAgent relationship references', async () => {
      const tenantId = createTestTenantId('service-validate-relationships');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Add non-existent subAgent in relationships
      const subAgentId = Object.keys(graphData.subAgents)[0];
      if (subAgentId && 'canTransferTo' in graphData.subAgents[subAgentId]) {
        graphData.subAgents[subAgentId].canTransferTo = ['non-existent-subAgent'];
      }

      await expect(
        createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData)
      ).rejects.toThrow(/Agent relationship validation failed/);
    });
  });

  describe('deleteFullGraph', () => {
    it.skip('should delete an existing graph', async () => {
      const tenantId = createTestTenantId('service-delete');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Create the graph first
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      // Verify it exists
      const beforeDelete = await getFullGraph(dbClient)({
        scopes: { tenantId, projectId, agentId: graphData.id },
      });
      expect(beforeDelete).toBeDefined();

      // Delete it
      const deleteResult = await deleteFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: graphData.id },
      });
      expect(deleteResult).toBe(true);

      // Verify it's deleted
      const afterDelete = await getFullGraph(dbClient)({
        scopes: { tenantId, projectId, agentId: graphData.id },
      });
      expect(afterDelete).toBeNull();
    });

    it.skip('should return false for non-existent graph', async () => {
      const tenantId = createTestTenantId('service-delete-nonexistent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const nonExistentId = nanoid();

      const result = await deleteFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: nonExistentId },
      });

      expect(result).toBe(false);
    });

    it.skip('should handle deletion of graph with complex relationships', async () => {
      const tenantId = createTestTenantId('service-delete-complex');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Add more complex relationships
      // const subAgentIds = Object.keys(graphData.subAgents);
      // Note: canTransferTo and canDelegateTo are set in the createFullGraphData function
      // and are part of the subAgent definition, not the returned graph data

      // Create the graph
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      // Delete it
      const deleteResult = await deleteFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: graphData.id },
      });
      expect(deleteResult).toBe(true);

      // Verify deletion
      const afterDelete = await getFullGraph(dbClient)({
        scopes: { tenantId, projectId, agentId: graphData.id },
      });
      expect(afterDelete).toBeNull();
    });
  });

  describe('Error handling', () => {
    it.skip('should handle invalid graph data', async () => {
      const tenantId = createTestTenantId('service-error');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      // Create graph data with empty subAgents object
      const invalidGraphData: FullGraphDefinition = {
        id: 'test-graph',
        name: 'Test Graph',
        description: 'Test description',
        defaultSubAgentId: 'non-existent-subAgent',
        subAgents: {}, // Empty subAgents but defaultSubAgentId references non-existent subAgent
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // This should handle the error gracefully
      await expect(
        createFullGraphServerSide(dbClient)({ tenantId, projectId }, invalidGraphData)
      ).rejects.toThrow();
    });
  });

  describe('Parallel operations', () => {
    it.skip('should handle concurrent graph operations on same tenant', async () => {
      const tenantId = createTestTenantId('service-concurrent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graph1Data = createFullGraphData();
      const graph2Data = createFullGraphData();

      // Create graphs concurrently
      const [result1, result2] = await Promise.all([
        createFullGraphServerSide(dbClient)({ tenantId, projectId }, graph1Data),
        createFullGraphServerSide(dbClient)({ tenantId, projectId }, graph2Data),
      ]);

      expect(result1.id).toBe(graph1Data.id);
      expect(result2.id).toBe(graph2Data.id);
      expect(result1.id).not.toBe(result2.id);

      // Verify both exist
      const [get1, get2] = await Promise.all([
        getFullGraph(dbClient)({ scopes: { tenantId, projectId, agentId: graph1Data.id } }),
        getFullGraph(dbClient)({ scopes: { tenantId, projectId, agentId: graph2Data.id } }),
      ]);

      expect(get1).toBeDefined();
      expect(get2).toBeDefined();
      expect(get1?.id).toBe(graph1Data.id);
      expect(get2?.id).toBe(graph2Data.id);
    });

    it.skip('should handle concurrent operations on same graph', async () => {
      const tenantId = createTestTenantId('service-concurrent-same');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const graphData = createFullGraphData();

      // Create the graph first
      await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);

      // Perform concurrent get operations
      const [get1, get2, get3] = await Promise.all([
        getFullGraph(dbClient)({ scopes: { tenantId, projectId, agentId: graphData.id } }),
        getFullGraph(dbClient)({ scopes: { tenantId, projectId, agentId: graphData.id } }),
        getFullGraph(dbClient)({ scopes: { tenantId, projectId, agentId: graphData.id } }),
      ]);

      expect(get1).toBeDefined();
      expect(get2).toBeDefined();
      expect(get3).toBeDefined();
      expect(get1?.id).toBe(graphData.id);
      expect(get2?.id).toBe(graphData.id);
      expect(get3?.id).toBe(graphData.id);
    });
  });
});
