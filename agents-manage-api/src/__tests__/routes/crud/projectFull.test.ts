import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../../../app';
import dbClient from '../../../data/db/dbClient';
import {
  agentGraph,
  agents,
  apiKeys,
  cleanupTestDatabase,
  closeTestDatabase,
  contextConfigs,
  createTestDatabaseClient,
  externalAgents,
  projects,
  tools,
} from '@inkeep/agents-core';

describe('Project Full API', () => {
  const testTenantId = 'test-tenant-123';
  const testProjectId = 'test-project-456';
  let dbPath: string;

  beforeAll(async () => {
    const dbInfo = await createTestDatabaseClient('projectFull-api-test');
    // Replace dbClient with test database
    Object.assign(dbClient, dbInfo.client);
    dbPath = dbInfo.path;
  });

  afterAll(async () => {
    await closeTestDatabase(dbClient, dbPath);
  });

  beforeEach(async () => {
    // Reset database before each test
    await cleanupTestDatabase(dbClient);

    // Create test project
    await dbClient.insert(projects).values({
      tenantId: testTenantId,
      id: testProjectId,
      name: 'Test Project',
      description: 'A test project for integration tests',
      models: {
        base: { model: 'gpt-4' },
      },
      stopWhen: {
        transferCountIs: 10,
      },
    });
  });

  describe('GET /tenants/:tenantId/projects/:id/full', () => {
    it('should return full project with all related entities', async () => {
      // Setup test data
      // Add an agent graph
      await dbClient.insert(agentGraph).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'test-graph-1',
        name: 'Test Graph',
        description: 'Test graph description',
        defaultAgentId: 'test-agent-1',
      });

      // Add agents
      await dbClient.insert(agents).values([
        {
          tenantId: testTenantId,
          projectId: testProjectId,
          id: 'test-agent-1',
          name: 'Test Agent 1',
          description: 'First test agent',
          prompt: 'You are a test agent',
        },
        {
          tenantId: testTenantId,
          projectId: testProjectId,
          id: 'test-agent-2',
          name: 'Test Agent 2',
          description: 'Second test agent',
          prompt: 'You are another test agent',
        },
      ]);

      // Add tools
      await dbClient.insert(tools).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'test-tool-1',
        name: 'Test Tool',
        config: {
          type: 'mcp',
          mcp: {
            transport: 'stdio',
            command: 'test-command',
          },
        },
      });

      // Add context config
      await dbClient.insert(contextConfigs).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'test-context-1',
        name: 'Test Context',
        description: 'Test context config',
      });

      // Add external agent
      await dbClient.insert(externalAgents).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'test-external-1',
        name: 'External Agent',
        description: 'Test external agent',
        baseUrl: 'https://example.com/agent',
      });

      // Add API key
      await dbClient.insert(apiKeys).values({
        id: 'test-key-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        graphId: 'test-graph-1',
        publicId: 'pub_test_123',
        keyHash: 'hashed_key_value',
        keyPrefix: 'sk-test-',
      });

      // Make request
      const response = await app.request(
        `/tenants/${testTenantId}/projects/${testProjectId}/full`,
        {
          method: 'GET',
        }
      );

      // Assert response
      expect(response.status).toBe(200);
      const body = await response.json();
      
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe(testProjectId);
      expect(body.data.name).toBe('Test Project');
      expect(body.data.description).toBe('A test project for integration tests');

      // Check that all related entities are included
      expect(body.data.agentGraphs).toBeDefined();
      expect(Object.keys(body.data.agentGraphs).length).toBeGreaterThan(0);
      
      expect(body.data.agents).toBeDefined();
      expect(Object.keys(body.data.agents).length).toBe(2);
      expect(body.data.agents['test-agent-1']).toBeDefined();
      expect(body.data.agents['test-agent-1'].name).toBe('Test Agent 1');

      expect(body.data.tools).toBeDefined();
      expect(Object.keys(body.data.tools).length).toBe(1);
      expect(body.data.tools['test-tool-1']).toBeDefined();
      expect(body.data.tools['test-tool-1'].name).toBe('Test Tool');

      expect(body.data.contextConfigs).toBeDefined();
      expect(Object.keys(body.data.contextConfigs).length).toBe(1);
      expect(body.data.contextConfigs['test-context-1']).toBeDefined();

      expect(body.data.externalAgents).toBeDefined();
      expect(Object.keys(body.data.externalAgents).length).toBe(1);
      expect(body.data.externalAgents['test-external-1']).toBeDefined();

      // Check API keys are included
      expect(body.data.apiKeys).toBeDefined();
      expect(body.data.apiKeys.length).toBe(1);
      expect(body.data.apiKeys[0].keyPrefix).toBe('sk-test-');
      expect(body.data.apiKeys[0].name).toBe('pub_test_123'); // publicId used as name
      expect(body.data.apiKeys[0].graphId).toBe('test-graph-1');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await app.request(
        `/tenants/${testTenantId}/projects/non-existent-project/full`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('should handle project with no related entities', async () => {
      // Create a project with no related entities
      await dbClient.insert(projects).values({
        tenantId: testTenantId,
        id: 'empty-project',
        name: 'Empty Project',
        description: 'A project with no related entities',
      });

      const response = await app.request(
        `/tenants/${testTenantId}/projects/empty-project/full`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe('empty-project');
      expect(body.data.name).toBe('Empty Project');

      // Check that entity collections are empty
      expect(Object.keys(body.data.agentGraphs || {}).length).toBe(0);
      expect(Object.keys(body.data.agents || {}).length).toBe(0);
      expect(Object.keys(body.data.tools || {}).length).toBe(0);
      expect(Object.keys(body.data.contextConfigs || {}).length).toBe(0);
      expect(Object.keys(body.data.externalAgents || {}).length).toBe(0);
      expect(body.data.apiKeys).toBeUndefined(); // Should not be included if empty
    });

    it('should include models and stopWhen configuration', async () => {
      const response = await app.request(
        `/tenants/${testTenantId}/projects/${testProjectId}/full`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      
      expect(body.data.models).toBeDefined();
      expect(body.data.models.base.model).toBe('gpt-4');
      expect(body.data.stopWhen).toBeDefined();
      expect(body.data.stopWhen.transferCountIs).toBe(10);
    });

    it('should return proper timestamp formats', async () => {
      const response = await app.request(
        `/tenants/${testTenantId}/projects/${testProjectId}/full`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
      
      // Check that timestamps are valid ISO strings
      expect(() => new Date(body.data.createdAt)).not.toThrow();
      expect(() => new Date(body.data.updatedAt)).not.toThrow();
    });

    it('should handle multiple graphs in a project', async () => {
      // Add multiple graphs
      await dbClient.insert(agentGraph).values([
        {
          tenantId: testTenantId,
          projectId: testProjectId,
          id: 'graph-1',
          name: 'Graph 1',
          description: 'First graph',
          defaultAgentId: 'agent-1',
        },
        {
          tenantId: testTenantId,
          projectId: testProjectId,
          id: 'graph-2',
          name: 'Graph 2',
          description: 'Second graph',
          defaultAgentId: 'agent-2',
        },
      ]);

      // Add agents for the graphs
      await dbClient.insert(agents).values([
        {
          tenantId: testTenantId,
          projectId: testProjectId,
          id: 'agent-1',
          name: 'Agent 1',
          description: 'Agent for graph 1',
          prompt: 'Test prompt 1',
        },
        {
          tenantId: testTenantId,
          projectId: testProjectId,
          id: 'agent-2',
          name: 'Agent 2',
          description: 'Agent for graph 2',
          prompt: 'Test prompt 2',
        },
      ]);

      const response = await app.request(
        `/tenants/${testTenantId}/projects/${testProjectId}/full`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      
      expect(Object.keys(body.data.agentGraphs).length).toBe(2);
      expect(body.data.agentGraphs['graph-1']).toBeDefined();
      expect(body.data.agentGraphs['graph-2']).toBeDefined();
      
      expect(Object.keys(body.data.agents).length).toBe(2);
      expect(body.data.agents['agent-1']).toBeDefined();
      expect(body.data.agents['agent-2']).toBeDefined();
    });
  });
});