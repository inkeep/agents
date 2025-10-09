import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  associateArtifactComponentWithAgent,
  countArtifactComponents,
  countArtifactComponentsForAgent,
  createArtifactComponent,
  deleteArtifactComponent,
  getAgentsUsingArtifactComponent,
  getArtifactComponentById,
  getArtifactComponentsForAgent,
  graphHasArtifactComponents,
  isArtifactComponentAssociatedWithAgent,
  listArtifactComponents,
  listArtifactComponentsPaginated,
  removeArtifactComponentFromAgent,
  updateArtifactComponent,
} from '../../data-access/artifactComponents';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';

describe('Artifact Components Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testAgentId = 'test-agent';
  const testGraphId = 'test-graph';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('getArtifactComponentById', () => {
    it('should retrieve an artifact component by id', async () => {
      const artifactComponentId = 'artifact-1';
      const expectedArtifactComponent = {
        id: artifactComponentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Component',
        description: 'Test artifact component',
        props: {
          type: 'object',
          properties: {
            title: { type: 'string', inPreview: true },
            description: { type: 'string', inPreview: false },
          },
        },
      };

      const mockQuery = {
        artifactComponents: {
          findFirst: vi.fn().mockResolvedValue(expectedArtifactComponent),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getArtifactComponentById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: artifactComponentId,
      });

      expect(mockQuery.artifactComponents.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedArtifactComponent);
    });

    it('should return null if artifact component not found', async () => {
      const mockQuery = {
        artifactComponents: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getArtifactComponentById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listArtifactComponents', () => {
    it('should list all artifact components for a project', async () => {
      const expectedComponents = [
        { id: 'artifact-1', name: 'Component 1' },
        { id: 'artifact-2', name: 'Component 2' },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(expectedComponents),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listArtifactComponents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedComponents);
    });
  });

  describe('listArtifactComponentsPaginated', () => {
    it('should list artifact components with pagination', async () => {
      const expectedComponents = [
        { id: 'artifact-1', name: 'Component 1' },
        { id: 'artifact-2', name: 'Component 2' },
      ];

      const mockSelect = vi.fn().mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedComponents),
              }),
            }),
          }),
        }),
      });

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 2 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValueOnce(mockSelect()).mockReturnValueOnce(mockCountSelect()),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedComponents, [{ count: 2 }]]);

      const result = await listArtifactComponentsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        pagination: {
          page: 1,
          limit: 10,
        },
      });

      expect(result).toEqual({
        data: expectedComponents,
        pagination: { page: 1, limit: 10, total: 2, pages: 1 },
      });

      vi.restoreAllMocks();
    });

    it('should handle default pagination options', async () => {
      const expectedComponents = [{ id: 'artifact-1', name: 'Component 1' }];

      vi.spyOn(Promise, 'all').mockResolvedValue([expectedComponents, [{ count: 1 }]]);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedComponents),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listArtifactComponentsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);

      vi.restoreAllMocks();
    });

    it('should enforce maximum limit', async () => {
      const expectedComponents = [{ id: 'artifact-1' }];

      vi.spyOn(Promise, 'all').mockResolvedValue([expectedComponents, [{ count: 1 }]]);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedComponents),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listArtifactComponentsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        pagination: {
          limit: 200,
        },
      });

      expect(result.pagination.limit).toBe(100); // Should be capped

      vi.restoreAllMocks();
    });
  });

  describe('createArtifactComponent', () => {
    it('should create a new artifact component', async () => {
      const componentData = {
        id: 'artifact-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Component',
        description: 'Test artifact component',
        props: {
          type: 'object',
          properties: {
            title: { type: 'string', inPreview: true },
            description: { type: 'string', inPreview: false },
          },
        },
      };

      const expectedComponent = {
        ...componentData,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedComponent]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createArtifactComponent(mockDb)(componentData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedComponent);
    });

    it('should create an artifact component with custom id', async () => {
      const componentData = {
        id: 'custom-id',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Component',
        description: 'Test artifact component',
        props: {
          type: 'object',
          properties: {
            title: { type: 'string', inPreview: true },
            description: { type: 'string', inPreview: false },
          },
        },
      };

      const expectedComponent = {
        ...componentData,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedComponent]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createArtifactComponent(mockDb)(componentData);

      expect(result.id).toBe('custom-id');
    });
  });

  describe('updateArtifactComponent', () => {
    it('should update an artifact component', async () => {
      const componentId = 'artifact-1';
      const updateData = {
        name: 'Updated Component',
        description: 'Updated description',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: componentId,
                ...updateData,
                updatedAt: new Date().toISOString(),
              },
            ]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateArtifactComponent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: componentId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.name).toBe(updateData.name);
      expect(result.description).toBe(updateData.description);
    });
  });

  describe('deleteArtifactComponent', () => {
    it('should delete an artifact component successfully', async () => {
      const componentId = 'artifact-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: componentId }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteArtifactComponent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: componentId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deletion fails', async () => {
      const componentId = 'artifact-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      // Mock console.error to avoid test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await deleteArtifactComponent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: componentId,
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return false when no rows deleted', async () => {
      const componentId = 'artifact-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]), // No rows deleted
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteArtifactComponent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: componentId,
      });

      expect(result).toBe(false);
    });
  });

  describe('getArtifactComponentsForAgent', () => {
    it('should get artifact components associated with an agent', async () => {
      const expectedComponents = [
        {
          id: 'artifact-1',
          name: 'Component 1',
          description: 'First component',
          summaryProps: { type: 'summary' },
          fullProps: { type: 'full' },
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(expectedComponents),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getArtifactComponentsForAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
          subAgentId: testAgentId,
        },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedComponents);
    });
  });

  describe('associateArtifactComponentWithAgent', () => {
    it('should associate an artifact component with an agent', async () => {
      const componentId = 'artifact-1';
      const expectedAssociation = {
        id: expect.any(String),
        tenantId: testTenantId,
        projectId: testProjectId,
        subAgentId: testAgentId,
        artifactComponentId: componentId,
        createdAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedAssociation]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await associateArtifactComponentWithAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
          subAgentId: testAgentId,
        },
        artifactComponentId: componentId,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedAssociation);
    });
  });

  describe('removeArtifactComponentFromAgent', () => {
    it('should remove association between artifact component and agent', async () => {
      const componentId = 'artifact-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'association-1' }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await removeArtifactComponentFromAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
          subAgentId: testAgentId,
        },
        artifactComponentId: componentId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when removal fails', async () => {
      const componentId = 'artifact-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      // Mock console.error to avoid test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await removeArtifactComponentFromAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
          subAgentId: testAgentId,
        },
        artifactComponentId: componentId,
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getAgentsUsingArtifactComponent', () => {
    it('should get all agents using a specific artifact component', async () => {
      const componentId = 'artifact-1';
      const expectedAgents = [
        { subAgentId: 'agent-1', createdAt: '2024-01-01T00:00:00Z' },
        { subAgentId: 'agent-2', createdAt: '2024-01-02T00:00:00Z' },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(expectedAgents),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getAgentsUsingArtifactComponent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        artifactComponentId: componentId,
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedAgents);
    });
  });

  describe('isArtifactComponentAssociatedWithAgent', () => {
    it('should return true when association exists', async () => {
      const componentId = 'artifact-1';

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'association-1' }]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await isArtifactComponentAssociatedWithAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
          subAgentId: testAgentId,
        },
        artifactComponentId: componentId,
      });

      expect(result).toBe(true);
    });

    it('should return false when association does not exist', async () => {
      const componentId = 'artifact-1';

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // No associations found
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await isArtifactComponentAssociatedWithAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
          subAgentId: testAgentId,
        },
        artifactComponentId: componentId,
      });

      expect(result).toBe(false);
    });
  });

  describe('graphHasArtifactComponents', () => {
    it('should return true when graph has artifact components', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ count: 1 }]),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await graphHasArtifactComponents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
      });

      expect(result).toBe(true);
    });

    it('should return false when graph has no artifact components', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ count: 0 }]),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await graphHasArtifactComponents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
      });

      expect(result).toBe(false);
    });

    it('should handle string count values', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ count: '2' }]),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await graphHasArtifactComponents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
      });

      expect(result).toBe(true);
    });
  });

  describe('countArtifactComponents', () => {
    it('should count artifact components for a project', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countArtifactComponents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('should handle string count values', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '10' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countArtifactComponents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result).toBe(10);
    });

    it('should return 0 when no count result', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countArtifactComponents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result).toBe(0);
    });
  });

  describe('countArtifactComponentsForAgent', () => {
    it('should count artifact components for a specific agent', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countArtifactComponentsForAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
          subAgentId: testAgentId,
        },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toBe(3);
    });

    it('should return 0 for agent with no artifact components', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countArtifactComponentsForAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
          subAgentId: testAgentId,
        },
      });

      expect(result).toBe(0);
    });
  });
});
