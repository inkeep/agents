import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createProject } from '../../../data-access/projects';
import {
  createTool,
  deleteTool,
  getToolById,
  listTools,
  updateTool,
} from '../../../data-access/tools';
import type { DatabaseClient } from '../../../db/client';
import {
  cleanupTestDatabase,
  closeTestDatabase,
  createTestDatabaseClient,
} from '../../../db/test-client';
import { MCPTransportType, type ToolInsert, type ToolUpdate } from '../../../types/index';
import { ToolInsertSchema } from '../../../validation/schemas';

// Helper function to create test project data with unique IDs
const createProjectData = ({ suffix = '' }: { suffix?: string } = {}) => {
  const timestamp = Date.now();
  const randomId = Math.floor(Math.random() * 10000);
  return {
    tenantId: `test-tenant-${suffix}-${timestamp}-${randomId}`,
    id: `test-project-${suffix}-${timestamp}-${randomId}`,
    name: `Test Project ${suffix}`,
    description: `Test project ${suffix} for tools integration tests`,
    models: {
      base: {
        model: 'claude-sonnet-4',
        providerOptions: {},
      },
    },
  };
};

// Helper function to create test tool data
const createToolData = ({
  suffix = '',
  projectData,
}: {
  suffix?: string;
  projectData?: { tenantId: string; id: string };
} = {}): ToolInsert => {
  const timestamp = Date.now();
  const randomId = Math.floor(Math.random() * 10000);

  return {
    tenantId: projectData?.tenantId || `test-tenant-${suffix}-${timestamp}-${randomId}`,
    projectId: projectData?.id || `test-project-${suffix}-${timestamp}-${randomId}`,
    id: `test-tool-${suffix}-${timestamp}-${randomId}`,
    name: `Test MCP Tool${suffix}`,
    config: {
      type: 'mcp',
      mcp: {
        server: {
          url: 'https://api.example.com/mcp',
        },
        transport: {
          type: MCPTransportType.streamableHttp,
        },
      },
    },
  };
};

describe('Tools Data Access - Integration Tests', () => {
  let db: DatabaseClient;
  let dbPath: string;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';

  beforeAll(async () => {
    // Create one database for the entire test suite
    const dbInfo = await createTestDatabaseClient('tools-integration');
    db = dbInfo.client;
    dbPath = dbInfo.path;
  });

  afterEach(async () => {
    // Clean up data between tests but keep the database file
    await cleanupTestDatabase(db);
  });

  afterAll(async () => {
    // Close database and delete the file after all tests
    await closeTestDatabase(db, dbPath);
  });

  describe('createTool & getToolById', () => {
    it('should create and retrieve a tool with full configuration', async () => {
      // Create project first (required for foreign key constraint)
      const projectData = createProjectData({ suffix: '1' });
      await createProject(db)(projectData);

      const toolData = createToolData({ suffix: '1', projectData });

      // Validate with schema
      const validatedData = ToolInsertSchema.parse(toolData);
      expect(validatedData).toMatchObject(toolData);

      // Create tool
      const createdTool = await createTool(db)(toolData);

      expect(createdTool).toMatchObject(toolData);
      expect(createdTool.config).toEqual(toolData.config);
      expect(createdTool.createdAt).toBeDefined();
      expect(createdTool.updatedAt).toBeDefined();
      expect(typeof createdTool.createdAt).toBe('string');
      expect(typeof createdTool.updatedAt).toBe('string');

      // Retrieve tool
      const fetchedTool = await getToolById(db)({
        scopes: { tenantId: toolData.tenantId, projectId: toolData.projectId },
        toolId: toolData.id,
      });

      expect(fetchedTool).not.toBeNull();
      expect(fetchedTool).toMatchObject({
        id: toolData.id,
        name: toolData.name,
        config: toolData.config,
      });
    });

    it('should return null when tool not found', async () => {
      const result = await getToolById(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        toolId: 'non-existent-tool',
      });

      expect(result).toBeNull();
    });
  });

  describe('listTools', () => {
    it('should list tools with proper tenant isolation', async () => {
      // Create projects for each tenant first
      const project1Data = createProjectData({ suffix: '1' });
      const project2Data = createProjectData({ suffix: '2' });
      const project3Data = createProjectData({ suffix: '3' });

      await createProject(db)(project1Data);
      await createProject(db)(project2Data);
      await createProject(db)(project3Data);

      // Create tools for different tenants
      const tool1Data = createToolData({ suffix: '1', projectData: project1Data });
      const tool2Data = createToolData({ suffix: '2', projectData: project2Data });
      const tool3Data = createToolData({ suffix: '3', projectData: project3Data });

      await createTool(db)({
        ...tool1Data,
      });

      await createTool(db)({
        ...tool2Data,
      });

      await createTool(db)({
        ...tool3Data,
      });

      // List tools for tenant 1 - should see 1 tool
      const tenant1ToolsResult = await listTools(db)({
        scopes: { tenantId: tool1Data.tenantId, projectId: tool1Data.projectId },
      });

      expect(tenant1ToolsResult.data).toHaveLength(1);
      expect(tenant1ToolsResult.data.every((tool) => tool.tenantId === tool1Data.tenantId)).toBe(
        true
      );
      expect(tenant1ToolsResult.data[0].name).toBe(tool1Data.name);

      // List tools for tenant 2 - should see 1 tool
      const tenant2ToolsResult = await listTools(db)({
        scopes: { tenantId: tool2Data.tenantId, projectId: tool2Data.projectId },
      });

      expect(tenant2ToolsResult.data).toHaveLength(1);
      expect(tenant2ToolsResult.data[0].name).toBe(tool2Data.name);
      expect(tenant2ToolsResult.data[0].tenantId).toBe(tool2Data.tenantId);
    });

    it('should return empty array when no tools exist', async () => {
      const result = await listTools(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('updateTool', () => {
    it('should update tool properties and timestamps', async () => {
      // Create project first
      const projectData = createProjectData({ suffix: '1' });
      await createProject(db)(projectData);

      // Create initial tool
      const initialData = createToolData({ suffix: '1', projectData });

      const createdTool = await createTool(db)({
        ...initialData,
      });

      // Wait a tiny bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Update tool
      const updateData: ToolUpdate = {
        name: 'Updated Tool',
        config: {
          type: 'mcp' as const,
          mcp: {
            server: {
              url: 'https://updated-server.com',
            },
            transport: {
              type: MCPTransportType.sse,
            },
          },
        },
      };

      const updatedTool = await updateTool(db)({
        scopes: { tenantId: initialData.tenantId, projectId: initialData.projectId },
        toolId: initialData.id,
        data: updateData,
      });

      expect(updatedTool).toMatchObject({
        id: initialData.id,
        name: updateData.name,
        // description field removed - not in database schema // updateData.description,
        config: updateData.config,
      });
      expect(updatedTool.updatedAt).not.toBe(createdTool.updatedAt);
      expect(updatedTool.createdAt).toBe(createdTool.createdAt);
    });

    it('should handle partial updates', async () => {
      // Create project first
      const projectData = createProjectData({ suffix: '1' });
      await createProject(db)(projectData);

      const toolData = createToolData({ suffix: '1', projectData });

      await createTool(db)({
        ...toolData,
      });

      // Update only the name
      const updatedTool = await updateTool(db)({
        scopes: { tenantId: toolData.tenantId, projectId: toolData.projectId },
        toolId: toolData.id,
        data: {
          name: 'New Name Only',
        },
      });

      expect(updatedTool.name).toBe('New Name Only');
      expect(updatedTool.config).toEqual(toolData.config); // Unchanged
    });

    it('should handle configuration updates', async () => {
      // Create project first
      const projectData = createProjectData({ suffix: '1' });
      await createProject(db)(projectData);

      const toolData = createToolData({ suffix: '1', projectData });

      await createTool(db)({
        ...toolData,
      });

      // Update config
      const newConfig = {
        type: 'mcp' as const,
        mcp: {
          serverType: 'http',
          url: 'https://mcp-server.com',
          headers: {
            Authorization: 'Bearer token',
          },
          server: {
            url: 'https://mcp-server.com',
          },
        },
      };

      const updatedTool = await updateTool(db)({
        scopes: { tenantId: toolData.tenantId, projectId: toolData.projectId },
        toolId: toolData.id,
        data: {
          config: newConfig,
        },
      });

      expect(updatedTool.config).toEqual(newConfig);
      expect(updatedTool.name).toBe(toolData.name); // Unchanged
    });

    it('should maintain tenant isolation during updates', async () => {
      // Create project first
      const projectData = createProjectData({ suffix: '1' });
      await createProject(db)(projectData);

      const tenant1Tool = createToolData({ suffix: '1', projectData });

      await createTool(db)({
        ...tenant1Tool,
      });

      // Try to update from different tenant - should fail
      const result = await updateTool(db)({
        scopes: { tenantId: 'different-tenant', projectId: 'different-project' }, // Different tenant
        toolId: tenant1Tool.id,
        data: {
          name: 'Hacked Name',
        },
      });

      // Should return null (no tool found for this tenant)
      expect(result).toBeNull();

      // Verify original tool is unchanged
      const originalTool = await getToolById(db)({
        scopes: { tenantId: tenant1Tool.tenantId, projectId: tenant1Tool.projectId },
        toolId: tenant1Tool.id,
      });

      expect(originalTool?.name).toBe(tenant1Tool.name);
    });
  });

  describe('deleteTool', () => {
    it('should delete tool and verify removal', async () => {
      // Create project first
      const projectData = createProjectData({ suffix: '1' });
      await createProject(db)(projectData);

      const toolData = createToolData({ suffix: '1', projectData });

      // Create tool
      await createTool(db)({
        ...toolData,
      });

      // Verify it exists
      const beforeDelete = await getToolById(db)({
        scopes: { tenantId: toolData.tenantId, projectId: toolData.projectId },
        toolId: toolData.id,
      });
      expect(beforeDelete).not.toBeNull();

      // Delete tool
      const deleteResult = await deleteTool(db)({
        scopes: { tenantId: toolData.tenantId, projectId: toolData.projectId },
        toolId: toolData.id,
      });

      expect(deleteResult).toBe(true);

      // Verify deletion
      const afterDelete = await getToolById(db)({
        scopes: { tenantId: toolData.tenantId, projectId: toolData.projectId },
        toolId: toolData.id,
      });
      expect(afterDelete).toBeNull();
    });

    it('should maintain tenant isolation during deletion', async () => {
      // Create project first
      const projectData = createProjectData({ suffix: '1' });
      await createProject(db)(projectData);

      const tenant1Tool = createToolData({ suffix: '1', projectData });

      await createTool(db)({
        ...tenant1Tool,
      });

      // Try to delete from different tenant
      const deleteResult = await deleteTool(db)({
        scopes: { tenantId: 'different-tenant', projectId: 'different-project' }, // Different tenant
        toolId: tenant1Tool.id,
      });

      // Should return false (no tool found/deleted)
      expect(deleteResult).toBe(false);

      // Verify tool still exists for correct tenant
      const stillExists = await getToolById(db)({
        scopes: { tenantId: tenant1Tool.tenantId, projectId: tenant1Tool.projectId },
        toolId: tenant1Tool.id,
      });

      expect(stillExists).not.toBeNull();
      expect(stillExists?.name).toBe(tenant1Tool.name);
    });

    it('should return false when trying to delete non-existent tool', async () => {
      const result = await deleteTool(db)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        toolId: 'non-existent-tool',
      });

      expect(result).toBe(false);
    });
  });
});
