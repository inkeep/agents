import {
  createFullAgentServerSide,
  deleteFullAgent,
  type FullAgentDefinition,
  getFullAgent,
  updateFullAgentServerSide,
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

describe('Agent Full Service Layer - Unit Tests', () => {
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

  // Helper function to create full agent data
  const createFullAgentData = (
    agentId?: string,
    options: {
      includeDataComponents?: boolean;
      includeExternalAgents?: boolean;
      includeContextConfig?: boolean;
    } = {}
  ): FullAgentDefinition => {
    const id = agentId || nanoid();
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

    const agentData: FullAgentDefinition = {
      id,
      name: `Test Agent ${id}`,
      description: `Test agent description for ${id}`,
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
      agentData.subAgents[externalSubAgentId] = createTestExternalAgentData({
        id: externalSubAgentId,
      });
    }

    // Note: DataComponents are now project-scoped and should be created separately
    // dataComponents are no longer part of the agent definition

    // Add context config if requested
    if (options.includeContextConfig) {
      agentData.contextConfig = createTestContextConfigData(contextConfigId, id, '');
    }

    return agentData;
  };

  describe('createFullAgent', () => {
    it('should create a basic agent with agents only', async () => {
      const tenantId = createTestTenantId('service-create-basic');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      // Create a simple agent with just agents (no project-scoped resources)
      const agentData: FullAgentDefinition = {
        id: `test-agent-${nanoid()}`,
        name: 'Basic Test Agent',
        description: 'A basic test agent with agents only',
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

      const result = await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      expect(result).toBeDefined();
      expect(result.id).toBe(agentData.id);
      expect(result.name).toBe(agentData.name);
      expect(result.defaultSubAgentId).toBe(agentData.defaultSubAgentId);
      expect(Object.keys(result.subAgents)).toHaveLength(2);
    });

    it('should create a complete agent with all entities', async () => {
      const tenantId = createTestTenantId('service-create');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      const result = await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      expect(result).toBeDefined();
      expect(result.id).toBe(agentData.id);
      expect(result.name).toBe(agentData.name);
      expect(result.defaultSubAgentId).toBe(agentData.defaultSubAgentId);
      expect(Object.keys(result.subAgents)).toHaveLength(2);

      // Verify agent relationships were created
      if (agentData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[agentData.defaultSubAgentId];
        expect(defaultSubAgent).toBeDefined();
        if ('canTransferTo' in defaultSubAgent) {
          expect(defaultSubAgent.canTransferTo).toContain(Object.keys(agentData.subAgents)[1]);
        }
        if ('canDelegateTo' in defaultSubAgent) {
          expect(defaultSubAgent.canDelegateTo).toContain(Object.keys(agentData.subAgents)[1]);
        }
        // Verify tool IDs are preserved (but actual tools are project-scoped)
        if ('tools' in defaultSubAgent) {
          expect(defaultSubAgent.tools).toBeDefined();
          expect(Array.isArray(defaultSubAgent.tools)).toBe(true);
        }
      }
    });

    it('should handle agent with single agent and no relationships', async () => {
      const tenantId = createTestTenantId('service-single-agent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const subAgentId = nanoid();
      const agentId = nanoid();

      const agentData: FullAgentDefinition = {
        id: agentId,
        name: 'Single Agent Agent',
        description: 'Agent with single agent',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            ...createTestSubAgentData({ id: subAgentId, suffix: ' Standalone' }),
            name: 'Single Agent',
            description: 'A standalone agent',
          },
        },
        // Note: tools are now project-scoped and not part of the agent definition
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      expect(result).toBeDefined();
      expect(result.id).toBe(agentId);
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

    it('should handle upsert behavior for existing agent', async () => {
      const tenantId = createTestTenantId('service-upsert');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Create the agent first time
      const firstResult = await createFullAgentServerSide(dbClient)(
        { tenantId, projectId },
        agentData
      );
      expect(firstResult.id).toBe(agentData.id);

      // Modify the agent data
      const updatedAgentData = {
        ...agentData,
        name: 'Updated Agent Name',
      };

      // Create again (should update)
      const secondResult = await createFullAgentServerSide(dbClient)(
        { tenantId, projectId },
        updatedAgentData
      );
      expect(secondResult.id).toBe(agentData.id);
      expect(secondResult.name).toBe('Updated Agent Name');
    });

    it('should create a agent with dataComponent references', async () => {
      const tenantId = createTestTenantId('service-create-datacomponents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData(undefined, { includeDataComponents: true });

      const result = await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      expect(result).toBeDefined();
      expect(result.id).toBe(agentData.id);

      // Verify sub-agent has dataComponent IDs (actual components are project-scoped)
      if (agentData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[agentData.defaultSubAgentId];
        expect(defaultSubAgent).toBeDefined();
        if ('dataComponents' in defaultSubAgent) {
          expect(defaultSubAgent.dataComponents).toBeDefined();
          // Note: In the new scoped architecture, dataComponents are not returned in agent objects
          expect(defaultSubAgent.dataComponents).toHaveLength(0);
        }
      }
    });

    it('should create a agent with external agents', async () => {
      const tenantId = createTestTenantId('service-create-external');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData(undefined, { includeExternalAgents: true });

      const result = await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      expect(result).toBeDefined();
      expect(result.id).toBe(agentData.id);

      // Find external subAgent
      const externalAgent = Object.values(result.subAgents).find(
        (subAgent) => 'baseUrl' in subAgent && typeof subAgent.baseUrl === 'string' && subAgent.baseUrl.includes('api.example.com')
      );
      expect(externalAgent).toBeDefined();
      if (externalAgent && 'baseUrl' in externalAgent) {
        expect(externalAgent.baseUrl).toContain('api.example.com');
      }

      // Verify internal subAgent can hand off to external subAgent
      if (agentData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[agentData.defaultSubAgentId];
        if ('canDelegateTo' in defaultSubAgent) {
          expect(defaultSubAgent.canDelegateTo).toContain(externalAgent?.id);
        }
      }
    });

    it('should create a agent with context config', async () => {
      const tenantId = createTestTenantId('service-create-context');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData(undefined, { includeContextConfig: true });

      const result = await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      expect(result).toBeDefined();
      expect(result.id).toBe(agentData.id);
      expect(result.contextConfig).toBeDefined();
    });

    it('should create a agent with all components (comprehensive test)', async () => {
      const tenantId = createTestTenantId('service-create-comprehensive');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData(undefined, {
        includeDataComponents: true,
        includeExternalAgents: true,
        includeContextConfig: true,
      });

      const result = await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      expect(result).toBeDefined();
      expect(result.id).toBe(agentData.id);

      // Verify all subAgents exist
      expect(Object.keys(result.subAgents)).toHaveLength(3); // 2 internal + 1 external
      expect(result.contextConfig).toBeDefined();

      // Verify subAgent relationships and references
      if (agentData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[agentData.defaultSubAgentId];
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
        (subAgent) => 'baseUrl' in subAgent && typeof subAgent.baseUrl === 'string' && subAgent.baseUrl.includes('api.example.com')
      );
      expect(externalAgent).toBeDefined();
    });
  });

  describe('getFullAgent', () => {
    it.skip('should retrieve an existing agent', async () => {
      const tenantId = createTestTenantId('service-get');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Create the agent first
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      // Retrieve it
      const result = await getFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentData.id },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(agentData.id);
      expect(result?.name).toBe(agentData.name);
      if (result) {
        expect(Object.keys(result.subAgents)).toHaveLength(2);
      }
    });

    it.skip('should return null for non-existent agent', async () => {
      const tenantId = createTestTenantId('service-get-nonexistent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const nonExistentId = nanoid();

      const result = await getFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: nonExistentId },
      });

      expect(result).toBeNull();
    });
  });

  describe('updateFullAgent', () => {
    it.skip('should update an existing agent', async () => {
      // TODO: Update this test to work with new scoped architecture
      const tenantId = createTestTenantId('service-update');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Create the agent first
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      // Update it
      const updatedAgentData = {
        ...agentData,
        name: 'Updated Agent Name',
        description: 'Updated description',
      };

      const result = await updateFullAgentServerSide(dbClient)(
        { tenantId, projectId },
        updatedAgentData
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(agentData.id);
      expect(result.name).toBe('Updated Agent Name');
      expect(result.description).toBe('Updated description');
      expect(Object.keys(result.subAgents)).toHaveLength(2);
    });

    it.skip('should create a new agent if it does not exist', async () => {
      const tenantId = createTestTenantId('service-update-create');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Update non-existent agent (should create)
      const result = await updateFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      expect(result).toBeDefined();
      expect(result.id).toBe(agentData.id);
      expect(result.name).toBe(agentData.name);
      expect(Object.keys(result.subAgents)).toHaveLength(2);
    });

    // NOTE: ID mismatch validation may have changed in the new implementation
    it.skip('should throw error for ID mismatch', async () => {
      const tenantId = createTestTenantId('service-update-mismatch');
      const projectId = 'default';

      const agentData = createFullAgentData();
      const differentId = nanoid();

      await expect(
        updateFullAgentServerSide(dbClient)(
          { tenantId, projectId },
          { ...agentData, id: differentId }
        )
      ).rejects.toThrow('Agent ID mismatch');
    });

    it.skip('should handle adding new subAgents in update', async () => {
      const tenantId = createTestTenantId('service-update-add-sub-agents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Create the agent first
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      // Add a new subAgent
      const newSubAgentId = `agent-${agentData.id}-3`;
      const updatedAgentData = {
        ...agentData,
        subAgents: {
          ...agentData.subAgents,
          [newSubAgentId]: createTestSubAgentData({ id: newSubAgentId, suffix: ' New Agent' }),
        },
      };

      // Update existing agent to have relationship with new agent
      // Note: canTransferTo is part of the agent definition in the input, not the returned result
      if (agentData.defaultSubAgentId) {
        const agent = updatedAgentData.subAgents[agentData.defaultSubAgentId];
        if (agent.type === 'internal' && agent.canTransferTo) {
          agent.canTransferTo.push(newSubAgentId);
        }
      }

      const result = await updateFullAgentServerSide(dbClient)(
        { tenantId, projectId },
        updatedAgentData
      );

      expect(result).toBeDefined();
      expect(Object.keys(result.subAgents)).toHaveLength(3);
      expect(result.subAgents).toHaveProperty(newSubAgentId);
      // Verify the relationship was created
      if (agentData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[agentData.defaultSubAgentId];
        if ('canTransferTo' in defaultSubAgent) {
          expect(defaultSubAgent.canTransferTo).toContain(newSubAgentId);
        }
      }
    });

    it.skip('should update agent with dataComponents', async () => {
      const tenantId = createTestTenantId('service-update-datacomponents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Create the agent first (without dataComponents)
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      // Update to include dataComponents
      const updatedAgentData = createFullAgentData(agentData.id, {
        includeDataComponents: true,
      });

      const result = await updateFullAgentServerSide(dbClient)(
        { tenantId, projectId },
        updatedAgentData
      );

      expect(result).toBeDefined();
      // Note: dataComponents are now project-scoped and not part of the agent definition
      // The agent.dataComponents array contains dataComponent IDs, but the actual dataComponent objects are at the project level

      // Verify agent-dataComponent relationship
      if (agentData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[agentData.defaultSubAgentId];
        if ('dataComponents' in defaultSubAgent) {
          expect(defaultSubAgent.dataComponents).toBeDefined();
          expect(defaultSubAgent.dataComponents).toHaveLength(1);
        }
      }
    });

    it.skip('should update agent with external agents', async () => {
      const tenantId = createTestTenantId('service-update-external');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Create the agent first (without external agents)
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      // Update to include external agents
      const updatedAgentData = createFullAgentData(agentData.id, {
        includeExternalAgents: true,
      });

      const result = await updateFullAgentServerSide(dbClient)(
        { tenantId, projectId },
        updatedAgentData
      );

      expect(result).toBeDefined();
      expect(Object.keys(result.subAgents)).toHaveLength(3); // 2 internal + 1 external

      // Find external agent
      const externalAgent = Object.values(result.subAgents).find(
        (subAgent) => 'baseUrl' in subAgent && typeof subAgent.baseUrl === 'string' && subAgent.baseUrl.includes('api.example.com')
      );
      expect(externalAgent).toBeDefined();
    });

    it.skip('should update agent removing dataComponents', async () => {
      const tenantId = createTestTenantId('service-update-remove-datacomponents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData(undefined, { includeDataComponents: true });

      // Create the agent first (with dataComponents)
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      // Update to remove dataComponents
      const updatedAgentData = createFullAgentData(agentData.id);

      const result = await updateFullAgentServerSide(dbClient)(
        { tenantId, projectId },
        updatedAgentData
      );

      expect(result).toBeDefined();

      // Agent should have no dataComponent relationships
      if (agentData.defaultSubAgentId) {
        const defaultSubAgent = result.subAgents[agentData.defaultSubAgentId];
        if ('dataComponents' in defaultSubAgent) {
          expect(defaultSubAgent.dataComponents || []).toHaveLength(0);
        }
      }
    });

    it.skip('should handle complex update with all components', async () => {
      const tenantId = createTestTenantId('service-update-comprehensive');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const initialAgentData = createFullAgentData();

      // Create initial agent
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, initialAgentData);

      // Update with all components
      const updatedAgentData = createFullAgentData(initialAgentData.id, {
        includeDataComponents: true,
        includeExternalAgents: true,
        includeContextConfig: true,
      });

      const result = await updateFullAgentServerSide(dbClient)(
        { tenantId, projectId },
        updatedAgentData
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

      const agentData = createFullAgentData();

      // Add non-existent tool reference
      const subAgentId = Object.keys(agentData.subAgents)[0];
      if (subAgentId && 'tools' in agentData.subAgents[subAgentId]) {
        agentData.subAgents[subAgentId].tools = ['non-existent-tool'];
      }

      await expect(
        createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData)
      ).rejects.toThrow(/Tool reference validation failed/);
    });

    it.skip('should validate dataComponent references in subAgents', async () => {
      const tenantId = createTestTenantId('service-validate-datacomponents');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Add non-existent dataComponent reference
      const subAgentId = Object.keys(agentData.subAgents)[0];
      if (subAgentId && 'dataComponents' in agentData.subAgents[subAgentId]) {
        agentData.subAgents[subAgentId].dataComponents = ['non-existent-datacomponent'];
      }

      await expect(
        createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData)
      ).rejects.toThrow(/DataComponent reference validation failed/);
    });

    it.skip('should validate default subAgent exists', async () => {
      const tenantId = createTestTenantId('service-validate-default-subAgent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Set non-existent default subAgent
      agentData.defaultSubAgentId = 'non-existent-subAgent';

      await expect(
        createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData)
      ).rejects.toThrow(/Default subAgent .* does not exist in subAgents/);
    });

    it.skip('should validate subAgent relationship references', async () => {
      const tenantId = createTestTenantId('service-validate-relationships');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Add non-existent subAgent in relationships
      const subAgentId = Object.keys(agentData.subAgents)[0];
      if (subAgentId && 'canTransferTo' in agentData.subAgents[subAgentId]) {
        agentData.subAgents[subAgentId].canTransferTo = ['non-existent-subAgent'];
      }

      await expect(
        createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData)
      ).rejects.toThrow(/Agent relationship validation failed/);
    });
  });

  describe('deleteFullAgent', () => {
    it.skip('should delete an existing agent', async () => {
      const tenantId = createTestTenantId('service-delete');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Create the agent first
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      // Verify it exists
      const beforeDelete = await getFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentData.id },
      });
      expect(beforeDelete).toBeDefined();

      // Delete it
      const deleteResult = await deleteFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentData.id },
      });
      expect(deleteResult).toBe(true);

      // Verify it's deleted
      const afterDelete = await getFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentData.id },
      });
      expect(afterDelete).toBeNull();
    });

    it.skip('should return false for non-existent agent', async () => {
      const tenantId = createTestTenantId('service-delete-nonexistent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const nonExistentId = nanoid();

      const result = await deleteFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: nonExistentId },
      });

      expect(result).toBe(false);
    });

    it.skip('should handle deletion of agent with complex relationships', async () => {
      const tenantId = createTestTenantId('service-delete-complex');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Add more complex relationships
      // const subAgentIds = Object.keys(agentData.subAgents);
      // Note: canTransferTo and canDelegateTo are set in the createFullAgentData function
      // and are part of the subAgent definition, not the returned agent data

      // Create the agent
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      // Delete it
      const deleteResult = await deleteFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentData.id },
      });
      expect(deleteResult).toBe(true);

      // Verify deletion
      const afterDelete = await getFullAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentData.id },
      });
      expect(afterDelete).toBeNull();
    });
  });

  describe('Error handling', () => {
    it.skip('should handle invalid agent data', async () => {
      const tenantId = createTestTenantId('service-error');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      // Create agent data with empty subAgents object
      const invalidAgentData: FullAgentDefinition = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test description',
        defaultSubAgentId: 'non-existent-subAgent',
        subAgents: {}, // Empty subAgents but defaultSubAgentId references non-existent subAgent
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // This should handle the error gracefully
      await expect(
        createFullAgentServerSide(dbClient)({ tenantId, projectId }, invalidAgentData)
      ).rejects.toThrow();
    });
  });

  describe('Parallel operations', () => {
    it.skip('should handle concurrent agent operations on same tenant', async () => {
      const tenantId = createTestTenantId('service-concurrent');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agent1Data = createFullAgentData();
      const agent2Data = createFullAgentData();

      // Create agent concurrently
      const [result1, result2] = await Promise.all([
        createFullAgentServerSide(dbClient)({ tenantId, projectId }, agent1Data),
        createFullAgentServerSide(dbClient)({ tenantId, projectId }, agent2Data),
      ]);

      expect(result1.id).toBe(agent1Data.id);
      expect(result2.id).toBe(agent2Data.id);
      expect(result1.id).not.toBe(result2.id);

      // Verify both exist
      const [get1, get2] = await Promise.all([
        getFullAgent(dbClient)({ scopes: { tenantId, projectId, agentId: agent1Data.id } }),
        getFullAgent(dbClient)({ scopes: { tenantId, projectId, agentId: agent2Data.id } }),
      ]);

      expect(get1).toBeDefined();
      expect(get2).toBeDefined();
      expect(get1?.id).toBe(agent1Data.id);
      expect(get2?.id).toBe(agent2Data.id);
    });

    it.skip('should handle concurrent operations on same agent', async () => {
      const tenantId = createTestTenantId('service-concurrent-same');
      await ensureTestProject(tenantId, 'default');
      const projectId = 'default';

      const agentData = createFullAgentData();

      // Create the agent first
      await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);

      // Perform concurrent get operations
      const [get1, get2, get3] = await Promise.all([
        getFullAgent(dbClient)({ scopes: { tenantId, projectId, agentId: agentData.id } }),
        getFullAgent(dbClient)({ scopes: { tenantId, projectId, agentId: agentData.id } }),
        getFullAgent(dbClient)({ scopes: { tenantId, projectId, agentId: agentData.id } }),
      ]);

      expect(get1).toBeDefined();
      expect(get2).toBeDefined();
      expect(get3).toBeDefined();
      expect(get1?.id).toBe(agentData.id);
      expect(get2?.id).toBe(agentData.id);
      expect(get3?.id).toBe(agentData.id);
    });
  });
});
