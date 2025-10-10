import {
  associateDataComponentWithAgent,
  createAgent,
  createDataComponent,
  createSubAgent,
  getAgentsUsingDataComponent,
  getDataComponentsForAgent,
  isDataComponentAssociatedWithAgent,
  removeDataComponentFromAgent,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import dbClient from '../../data/db/dbClient';
import { ensureTestProject } from '../utils/testProject';
import { createTestTenantId } from '../utils/testTenant';

describe('Data Component Agent Associations', () => {
  const tenantId = createTestTenantId('datacomponent-associations');

  beforeAll(async () => {
    await ensureTestProject(tenantId, 'default');
  });
  const projectId = 'default';
  let subAgentId: string;
  let dataComponentId: string;
  let agentId: string;

  beforeEach(async () => {
    // Create a test graph first
    agentId = nanoid();
    subAgentId = nanoid();

    await createAgent(dbClient)({
      id: agentId,
      tenantId,
      projectId,
      name: 'Test Graph',
      defaultSubAgentId: subAgentId,
    });

    // Create test agent with agentId
    const _ = await createSubAgent(dbClient)({
      id: subAgentId,
      tenantId,
      projectId,
      agentId: agentId,
      name: 'Test Agent',
      description: 'Test agent for data component testing',
      prompt: 'You are a test agent',
    });

    // Create test data component
    const dataComponent = await createDataComponent(dbClient)({
      id: nanoid(),
      tenantId,
      projectId,
      name: 'TestComponent',
      description: 'Test component for associations',
      props: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['title'],
      },
    });
    dataComponentId = dataComponent.id;
  });

  describe('associateDataComponentWithAgent', () => {
    it.skip('should successfully associate a data component with an agent', async () => {
      const association = await associateDataComponentWithAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });

      expect(association).toBeDefined();
      expect(association.tenantId).toBe(tenantId);
      expect(association.subAgentId).toBe(subAgentId);
      expect(association.dataComponentId).toBe(dataComponentId);
      expect(association.id).toBeDefined();
      expect(association.createdAt).toBeDefined();
    });
  });

  describe('getDataComponentsForAgent', () => {
    it.skip('should return empty array when agent has no data components', async () => {
      const components = await getDataComponentsForAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
      });

      expect(components).toEqual([]);
    });

    it.skip('should return associated data components for an agent', async () => {
      // Associate the component
      await associateDataComponentWithAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });

      const components = await getDataComponentsForAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
      });

      expect(components).toHaveLength(1);
      expect(components[0].id).toBe(dataComponentId);
      expect(components[0].name).toBe('TestComponent');
      expect(components[0].description).toBe('Test component for associations');
      expect(components[0].props).toEqual({
        type: 'object',
        properties: {
          title: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['title'],
      });
    });

    it.skip('should only return components for the specific agent and graph', async () => {
      // Create another agent in the same graph
      const agent2 = await createSubAgent(dbClient)({
        tenantId,
        projectId,
        agentId: agentId,
        id: nanoid(),
        name: 'Test Agent 2',
        description: 'Second test agent',
        prompt: 'You are another test agent',
      });

      // Associate component with first agent only
      await associateDataComponentWithAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });

      // First agent should have the component
      const agent1Components = await getDataComponentsForAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
      });
      expect(agent1Components).toHaveLength(1);

      // Second agent should not have the component
      const agent2Components = await getDataComponentsForAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId: agent2.id },
      });
      expect(agent2Components).toHaveLength(0);
    });
  });

  describe('removeDataComponentFromAgent', () => {
    it.skip('should remove association between data component and agent', async () => {
      // Create association
      await associateDataComponentWithAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });

      // Verify association exists
      let components = await getDataComponentsForAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
      });
      expect(components).toHaveLength(1);

      // Remove association
      const removed = await removeDataComponentFromAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });
      expect(removed).toBe(true);

      // Verify association is gone
      components = await getDataComponentsForAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
      });
      expect(components).toHaveLength(0);
    });

    it.skip('should return false when trying to remove non-existent association', async () => {
      const removed = await removeDataComponentFromAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });
      expect(removed).toBe(false);
    });
  });

  describe('getAgentsUsingDataComponent', () => {
    it.skip('should return empty array when no agents use the component', async () => {
      const agents = await getAgentsUsingDataComponent(dbClient)({
        scopes: { tenantId, projectId },
        dataComponentId,
      });
      expect(agents).toEqual([]);
    });

    it.skip('should return all agents using a data component', async () => {
      // Create second agent in the same graph
      const subAgent2 = await createSubAgent(dbClient)({
        id: nanoid(),
        tenantId,
        projectId,
        agentId: agentId,
        name: 'Test Agent 2',
        description: 'Second test agent',
        prompt: 'You are another test agent',
      });

      // Associate component with both agents
      await associateDataComponentWithAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });
      await associateDataComponentWithAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId: subAgent2.id },
        dataComponentId,
      });

      const agents = await getAgentsUsingDataComponent(dbClient)({
        scopes: { tenantId, projectId },
        dataComponentId,
      });

      expect(agents).toHaveLength(2);
      const subAgentIds = agents.map((a) => a.subAgentId);
      expect(subAgentIds).toContain(subAgentId);
      expect(subAgentIds).toContain(subAgent2.id);
    });
  });

  describe('isDataComponentAssociatedWithAgent', () => {
    it.skip('should return false when component is not associated with agent', async () => {
      const isAssociated = await isDataComponentAssociatedWithAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });
      expect(isAssociated).toBe(false);
    });

    it.skip('should return true when component is associated with agent', async () => {
      await associateDataComponentWithAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });

      const isAssociated = await isDataComponentAssociatedWithAgent(dbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
        dataComponentId,
      });
      expect(isAssociated).toBe(true);
    });
  });
});
