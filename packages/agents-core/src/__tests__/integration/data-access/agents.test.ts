import type { SubAgentInsert } from '@inkeep/agents-core/types';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSubAgent,
  deleteSubAgent,
  getSubAgentById,
  listSubAgents,
  updateSubAgent,
} from '../../../data-access/subAgents';
import type { DatabaseClient } from '../../../db/client';
import * as schema from '../../../db/schema';
import { createTestDatabaseClient } from '../../../db/test-client';
import { SubAgentInsertSchema } from '../../../validation/schemas';

describe('Agents Data Access - Integration Tests', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testGraphId = 'test-graph';

  beforeEach(async () => {
    // Create fresh in-memory database for each test
    db = await createTestDatabaseClient();

    // Create test projects and graphs for all tenant IDs used in tests
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

      // Create a test graph with a temporary default agent
      const defaultSubAgentId = 'default-agent-setup';
      await db
        .insert(schema.agents)
        .values({
          tenantId: tenantId,
          projectId: testProjectId,
          id: testGraphId,
          name: 'Test Graph',
          description: 'Graph for testing',
          defaultSubAgentId: defaultSubAgentId,
        })
        .onConflictDoNothing();

      // Create the default agent for the graph
      await db
        .insert(schema.subAgents)
        .values({
          tenantId: tenantId,
          projectId: testProjectId,
          agentId: testGraphId,
          id: defaultSubAgentId,
          name: 'Default Agent',
          description: 'Default agent for testing',
          prompt: 'You are a test agent',
        })
        .onConflictDoNothing();
    }
  });

  describe('createAgent & getAgentById', () => {
    it('should create and retrieve an agent with full configuration', async () => {
      const agentData = {
        id: 'test-agent-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Test Agent',
        description: 'A comprehensive test agent',
        prompt: 'Be helpful and comprehensive in your responses',
        models: {
          base: {
            model: 'gpt-4',
            providerOptions: {
              openai: {
                temperature: 0.7,
                maxTokens: 1000,
              },
            },
          },
          structuredOutput: {
            model: 'gpt-4o-mini',
          },
        },
      };

      // Validate with schema
      const validatedData = SubAgentInsertSchema.parse(agentData);
      expect(validatedData).toMatchObject(agentData);

      // Create agent
      const createdAgent = await createSubAgent(db)(agentData);

      expect(createdAgent).toMatchObject({
        id: agentData.id,
        name: agentData.name,
        description: agentData.description,
        prompt: agentData.prompt,
        tenantId: testTenantId,
        projectId: testProjectId,
      });
      expect(createdAgent.models).toEqual(agentData.models);
      expect(createdAgent.createdAt).toBeDefined();
      expect(createdAgent.updatedAt).toBeDefined();
      expect(typeof createdAgent.createdAt).toBe('string');
      expect(typeof createdAgent.updatedAt).toBe('string');

      // Retrieve agent
      const fetchedAgent = await getSubAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: agentData.id,
      });

      expect(fetchedAgent).not.toBeNull();
      expect(fetchedAgent).toMatchObject({
        id: agentData.id,
        name: agentData.name,
        description: agentData.description,
        prompt: agentData.prompt,
        models: agentData.models,
      });
    });

    it('should create agent with minimal required fields', async () => {
      const minimalAgentData = {
        id: 'minimal-agent',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Minimal Agent',
        description: 'An agent with minimal configuration',
        prompt: 'Be helpful',
      };

      const createdAgent = await createSubAgent(db)(minimalAgentData);

      expect(createdAgent.models).toBeNull();
      expect(createdAgent.name).toBe(minimalAgentData.name);
      expect(createdAgent.description).toBe(minimalAgentData.description);
      expect(createdAgent.prompt).toBe(minimalAgentData.prompt);
    });

    it('should return null when agent not found', async () => {
      const result = await getSubAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: 'non-existent-agent',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('listAgents', () => {
    it('should list agents with proper tenant isolation', async () => {
      const tenant1 = 'tenant-1';
      const tenant2 = 'tenant-2';

      // Create agents for different tenants
      const agent1Data = {
        id: 'agent-1',
        tenantId: tenant1,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Tenant 1 Agent',
        description: 'Agent for tenant 1',
        prompt: 'Help tenant 1',
      } satisfies SubAgentInsert;

      const agent2Data = {
        id: 'agent-2',
        tenantId: tenant2,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Tenant 2 Agent',
        description: 'Agent for tenant 2',
        prompt: 'Help tenant 2',
      } satisfies SubAgentInsert;

      const agent3Data = {
        id: 'agent-3',
        tenantId: tenant1,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Another Tenant 1 Agent',
        description: 'Another agent for tenant 1',
        prompt: 'Also help tenant 1',
      } satisfies SubAgentInsert;

      await createSubAgent(db)(agent1Data);

      await createSubAgent(db)(agent2Data);

      await createSubAgent(db)(agent3Data);

      // List agents for tenant 1 - should see 3 agents (2 created + 1 default from setup)
      const tenant1Agents = await listSubAgents(db)({
        scopes: { tenantId: tenant1, projectId: testProjectId, agentId: testGraphId },
      });

      expect(tenant1Agents).toHaveLength(3); // 2 created in test + 1 default from setup
      expect(tenant1Agents.every((agent) => agent.tenantId === tenant1)).toBe(true);
      const tenant1Names = tenant1Agents.map((a) => a.name).sort();
      expect(tenant1Names).toEqual(['Another Tenant 1 Agent', 'Default Agent', 'Tenant 1 Agent']);

      // List agents for tenant 2 - should see 2 agents (1 created + 1 default from setup)
      const tenant2Agents = await listSubAgents(db)({
        scopes: { tenantId: tenant2, projectId: testProjectId, agentId: testGraphId },
      });

      expect(tenant2Agents).toHaveLength(2); // 1 created in test + 1 default from setup
      const tenant2Names = tenant2Agents.map((a) => a.name).sort();
      expect(tenant2Names).toEqual(['Default Agent', 'Tenant 2 Agent']);
      expect(tenant2Agents.every((agent) => agent.tenantId === tenant2)).toBe(true);
    });

    it('should return empty array when no agents exist', async () => {
      // Use a different graph that has no agents (except the default setup agent)
      const emptyGraphId = 'empty-test-graph';

      // Create a new graph with a default agent
      await db.insert(schema.agents).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: emptyGraphId,
        name: 'Empty Test Graph',
        description: 'Graph for empty test',
        defaultSubAgentId: 'empty-default-agent',
      });

      await db.insert(schema.subAgents).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: emptyGraphId,
        id: 'empty-default-agent',
        name: 'Empty Default Agent',
        description: 'Default agent for empty test',
        prompt: 'You are a test agent',
      });

      // List agents for the empty graph (should only have the default agent)
      const result = await listSubAgents(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: emptyGraphId },
      });

      // Should have exactly one agent (the default)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('empty-default-agent');
    });
  });

  describe('updateAgent', () => {
    it('should update agent properties and timestamps', async () => {
      // Create initial agent
      const initialData = {
        id: 'update-test-agent',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Original Name',
        description: 'Original description',
        prompt: 'Original instructions',
        models: {
          base: {
            model: 'gpt-3.5-turbo',
            providerOptions: {
              openai: {
                temperature: 0.5,
              },
            },
          },
        },
      };

      const createdAgent = await createSubAgent(db)(initialData);

      // Wait a tiny bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Update agent
      const updateData = {
        name: 'Updated Name',
        description: 'Updated description',
        models: {
          base: {
            model: 'gpt-4',
            providerOptions: {
              openai: {
                temperature: 0.8,
                maxTokens: 2000,
              },
            },
          },
        },
      };

      const updatedAgent = await updateSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: initialData.id,
        data: updateData,
      });

      expect(updatedAgent).toMatchObject({
        id: initialData.id,
        name: updateData.name,
        description: updateData.description,
        prompt: initialData.prompt, // Should remain unchanged
        models: updateData.models,
      });
      expect(updatedAgent.updatedAt).not.toBe(createdAgent.updatedAt);
      expect(updatedAgent.createdAt).toBe(createdAgent.createdAt);
    });

    it('should handle partial updates', async () => {
      const agentData = {
        id: 'partial-update-agent',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Original Name',
        description: 'Original description',
        prompt: 'Original instructions',
      };

      await createSubAgent(db)(agentData);

      // Update only the name
      const updatedAgent = await updateSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: agentData.id,
        data: {
          name: 'New Name Only',
        },
      });

      expect(updatedAgent.name).toBe('New Name Only');
      expect(updatedAgent.description).toBe(agentData.description); // Unchanged
      expect(updatedAgent.prompt).toBe(agentData.prompt); // Unchanged
    });
  });

  describe('deleteAgent', () => {
    it('should delete agent and verify removal', async () => {
      const agentData = {
        id: 'delete-test-agent',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Agent to Delete',
        description: 'This agent will be deleted',
        prompt: 'Temporary agent',
      };

      // Create agent
      await createSubAgent(db)(agentData);

      // Verify it exists
      const beforeDelete = await getSubAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: agentData.id,
      });
      expect(beforeDelete).not.toBeNull();

      // Delete agent
      const deleteResult = await deleteSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: agentData.id,
      });

      expect(deleteResult).toBe(true);

      // Verify deletion
      const afterDelete = await getSubAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: agentData.id,
      });
      expect(afterDelete).toBeUndefined();
    });

    it('should maintain tenant isolation during deletion', async () => {
      const tenant1Agent = {
        id: 'delete-isolation-agent',
        tenantId: 'tenant-1',
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Protected Agent',
        description: 'Should not be deletable from other tenant',
        prompt: 'Stay protected',
      };

      await createSubAgent(db)(tenant1Agent);

      // Try to delete from different tenant
      const deleteResult = await deleteSubAgent(db)({
        scopes: { tenantId: 'tenant-2', projectId: testProjectId, agentId: testGraphId }, // Different tenant
        subAgentId: tenant1Agent.id,
      });
      expect(deleteResult).toBe(true);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent agent updates correctly', async () => {
      const agentData = {
        id: 'concurrent-agent',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Concurrent Test Agent',
        description: 'Agent for testing concurrent operations',
        prompt: 'Handle concurrent requests',
      };

      // Create agent first
      await createSubAgent(db)(agentData);

      // Run multiple update operations concurrently
      const updatePromises = Array.from({ length: 5 }, (_, i) =>
        updateSubAgent(db)({
          scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
          subAgentId: agentData.id,
          data: {
            name: `Updated Agent ${i}`,
            description: `Description ${i}`,
          },
        })
      );

      const results = await Promise.all(updatePromises);

      // All operations should succeed
      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.id).toBe(agentData.id);
        expect(result.name).toMatch(/^Updated Agent \d$/);
      });

      // Get final state - one of the updates should have won
      const finalAgent = await getSubAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: agentData.id,
      });

      expect(finalAgent?.name).toMatch(/^Updated Agent \d$/);
      expect(finalAgent?.description).toMatch(/^Description \d$/);
    });
  });

  describe('Model Settings Handling', () => {
    it('should properly store and retrieve complex model settingsurations', async () => {
      const complexModelSettings = {
        base: {
          model: 'gpt-4',
          providerOptions: {
            openai: {
              temperature: 0.7,
              maxTokens: 4000,
              topP: 0.9,
              presencePenalty: 0.1,
              frequencyPenalty: 0.1,
              responseFormat: { type: 'json_object' },
            },
          },
        },
        structuredOutput: {
          model: 'gpt-4o-mini',
        },
        summarizer: {
          model: 'claude-3.5-haiku',
          providerOptions: {
            anthropic: {
              maxTokens: 1000,
              temperature: 0.3,
            },
          },
        },
      };

      const agentData = {
        id: 'complex-config-agent',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Complex Config Agent',
        description: 'Agent with complex model settingsuration',
        prompt: 'Use the complex configuration wisely',
        models: complexModelSettings,
      };

      const createdAgent = await createSubAgent(db)(agentData);

      expect(createdAgent.models).toEqual(complexModelSettings);

      // Verify retrieval
      const fetchedAgent = await getSubAgentById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: agentData.id,
      });

      expect(fetchedAgent?.models).toEqual(complexModelSettings);
      expect((fetchedAgent?.models?.base?.providerOptions?.openai as any)?.temperature).toBe(0.7);
      expect((fetchedAgent?.models?.summarizer?.providerOptions?.anthropic as any)?.maxTokens).toBe(
        1000
      );
    });

    it('should handle null model settingsuration updates', async () => {
      const agentData = {
        id: 'null-config-agent',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testGraphId,
        name: 'Null Config Agent',
        description: 'Agent to test null config',
        prompt: 'Handle null configs',
        models: {
          base: {
            model: 'gpt-4',
            providerOptions: {
              openai: {
                temperature: 0.5,
              },
            },
          },
        },
      };

      const createdAgent = await createSubAgent(db)(agentData);

      expect(createdAgent.models).toBeDefined();

      // Update to remove model settings (set to null)
      const updatedAgent = await updateSubAgent(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testGraphId },
        subAgentId: agentData.id,
        data: {
          models: {},
        },
      });

      expect(updatedAgent.models).toBeNull();
    });
  });
});
