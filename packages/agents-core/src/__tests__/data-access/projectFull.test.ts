import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getFullProject } from '../../data-access/projectFull';
import {
  agentGraph,
  agents,
  apiKeys,
  contextConfigs,
  externalAgents,
  projects,
  tools,
} from '../../db/schema';
import type { DatabaseClient } from '../../db/client';
import {
  cleanupTestDatabase,
  closeTestDatabase,
  createTestDatabaseClient,
} from '../../db/test-client';

describe('getFullProject', () => {
  let db: DatabaseClient;
  let dbPath: string;
  const testTenantId = 'test-tenant-proj';
  const testProjectId = 'test-project-full';

  beforeAll(async () => {
    const dbInfo = await createTestDatabaseClient('projectFull-test');
    db = dbInfo.client;
    dbPath = dbInfo.path;
  });

  afterAll(async () => {
    await closeTestDatabase(db, dbPath);
  });

  it('should retrieve a full project with all related entities', async () => {
    // Clean database
    await cleanupTestDatabase(db);
    
    // Insert test project
    await db.insert(projects).values({
      tenantId: testTenantId,
      id: testProjectId,
      name: 'Test Project',
      description: 'A test project for unit tests',
      models: {
        base: { model: 'gpt-4' },
      },
      stopWhen: {
        transferCountIs: 5,
      },
    });

    // Add an agent graph
    await db.insert(agentGraph).values({
      tenantId: testTenantId,
      projectId: testProjectId,
      id: 'test-graph-1',
      name: 'Test Graph',
      description: 'Test graph description',
      defaultAgentId: 'test-agent-1',
    });

    // Add agents
    await db.insert(agents).values([
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
    await db.insert(tools).values({
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
    await db.insert(contextConfigs).values({
      tenantId: testTenantId,
      projectId: testProjectId,
      id: 'test-context-1',
      name: 'Test Context',
      description: 'Test context config',
    });

    // Add external agent
    await db.insert(externalAgents).values({
      tenantId: testTenantId,
      projectId: testProjectId,
      id: 'test-external-1',
      name: 'External Agent',
      description: 'Test external agent',
      baseUrl: 'https://example.com/agent',
    });

    // Add API key
    await db.insert(apiKeys).values({
      id: 'test-key-1',
      tenantId: testTenantId,
      projectId: testProjectId,
      graphId: 'test-graph-1',
      publicId: 'pub_test_123',
      keyHash: 'hashed_key_value',
      keyPrefix: 'sk-test-',
    });

    // Execute the function
    const result = await getFullProject(db)({
      tenantId: testTenantId,
      projectId: testProjectId,
    });

    // Assert the result
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result?.id).toBe(testProjectId);
    expect(result?.name).toBe('Test Project');
    expect(result?.description).toBe('A test project for unit tests');

    // Check that related entities are included
    expect(result?.agentGraphs).toBeDefined();
    expect(Object.keys(result?.agentGraphs || {}).length).toBeGreaterThan(0);

    // The agents are retrieved through the graph, so we check if they exist
    expect(result?.agents).toBeDefined();
    
    expect(result?.tools).toBeDefined();

    expect(result?.contextConfigs).toBeDefined();
    expect(Object.keys(result?.contextConfigs || {}).length).toBe(1);

    expect(result?.externalAgents).toBeDefined();
    expect(Object.keys(result?.externalAgents || {}).length).toBe(1);

    // Check API keys are included
    expect(result?.apiKeys).toBeDefined();
    expect(result?.apiKeys?.length).toBe(1);
    expect(result?.apiKeys?.[0].keyPrefix).toBe('sk-test-');
    expect(result?.apiKeys?.[0].name).toBe('pub_test_123'); // publicId used as name
  });

  it('should return null for non-existent project', async () => {
    await cleanupTestDatabase(db);
    
    const result = await getFullProject(db)({
      tenantId: testTenantId,
      projectId: 'non-existent-project',
    });

    expect(result).toBeNull();
  });

  it('should handle project with no related entities', async () => {
    await cleanupTestDatabase(db);
    
    // Create a project with no related entities
    await db.insert(projects).values({
      tenantId: testTenantId,
      id: 'empty-project',
      name: 'Empty Project',
      description: 'A project with no related entities',
    });

    const result = await getFullProject(db)({
      tenantId: testTenantId,
      projectId: 'empty-project',
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result?.id).toBe('empty-project');
    expect(result?.name).toBe('Empty Project');

    // Check that entity collections are empty or not included
    expect(Object.keys(result?.agentGraphs || {}).length).toBe(0);
    expect(Object.keys(result?.agents || {}).length).toBe(0);
    expect(Object.keys(result?.tools || {}).length).toBe(0);
    expect(Object.keys(result?.contextConfigs || {}).length).toBe(0);
    expect(Object.keys(result?.externalAgents || {}).length).toBe(0);
    expect(result?.apiKeys).toBeUndefined(); // Should not be included if empty
  });

  it('should handle errors gracefully', async () => {
    // Mock a database error
    const mockDb = {
      query: {
        projects: {
          findFirst: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        },
      },
    } as any;

    await expect(
      getFullProject(mockDb)({
        tenantId: testTenantId,
        projectId: testProjectId,
      })
    ).rejects.toThrow('Database connection failed');
  });
});