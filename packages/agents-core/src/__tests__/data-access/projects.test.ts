import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countProjects,
  createProject,
  deleteProject,
  getProject,
  getProjectResourceCounts,
  listProjects,
  listProjectsPaginated,
  projectExists,
  projectExistsInTable,
  projectHasResources,
  updateProject,
} from '../../data-access/projects';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';

describe('Projects Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'tenant-123';
  const testProjectId1 = 'project-456';
  const testProjectId2 = 'project-789';

  // Create a proper mock database with all required methods
  const createMockDb = () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockResolvedValue([]),
        offset: vi.fn().mockResolvedValue([]),
      }),
    }),
    selectDistinct: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    query: {
      projects: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  });

  beforeEach(() => {
    db = createMockDb() as any;
  });

  describe('listProjects', () => {
    it('should return unique project IDs from all resource tables', async () => {
      // Mock the first select call (projects table) to return empty
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Empty projects table
        }),
      });

      // Mock the selectDistinct calls for fallback tables
      const mockSelectDistinct = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        selectDistinct: mockSelectDistinct,
      } as any;

      // Mock Promise.all to return the same project IDs from different tables
      vi.spyOn(Promise, 'all').mockResolvedValue([
        [{ projectId: testProjectId1 }], // agents
        [{ projectId: testProjectId2 }], // agentGraph
        [{ projectId: testProjectId1 }], // tools (duplicate)
        [], // contextConfigs (empty)
        [{ projectId: testProjectId2 }], // externalAgents (duplicate)
        [], // agentRelations
        [], // agentToolRelations
        [], // agentDataComponents
        [], // agentArtifactComponents
        [], // dataComponents
        [], // artifactComponents
        [], // tasks
        [], // taskRelations
        [], // conversations
        [], // messages
        [], // contextCache
        [], // credentialReferences
        [], // ledgerArtifacts
      ]);

      const result = await listProjects(mockDb)({
        tenantId: testTenantId,
      });

      expect(result).toEqual([{ projectId: testProjectId1 }, { projectId: testProjectId2 }]);
      expect(result).toHaveLength(2); // Should deduplicate

      vi.restoreAllMocks();
    });

    it('should return empty array when no projects found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Empty projects table
        }),
      });

      const mockSelectDistinct = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        selectDistinct: mockSelectDistinct,
      } as any;

      // Mock Promise.all to return empty arrays from all tables
      vi.spyOn(Promise, 'all').mockResolvedValue(Array(18).fill([]));

      const result = await listProjects(mockDb)({
        tenantId: testTenantId,
      });

      expect(result).toEqual([]);

      vi.restoreAllMocks();
    });

    it('should handle null project IDs gracefully', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Empty projects table
        }),
      });

      const mockSelectDistinct = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        selectDistinct: mockSelectDistinct,
      } as any;

      // Mock Promise.all to return some null/undefined project IDs
      vi.spyOn(Promise, 'all').mockResolvedValue([
        [{ projectId: testProjectId1 }],
        [{ projectId: null }], // null project ID
        [{ projectId: undefined }], // undefined project ID
        [{ projectId: testProjectId2 }],
        ...Array(14).fill([]), // empty arrays for remaining tables
      ]);

      const result = await listProjects(mockDb)({
        tenantId: testTenantId,
      });

      expect(result).toEqual([{ projectId: testProjectId1 }, { projectId: testProjectId2 }]);
      expect(result).toHaveLength(2); // Should filter out null/undefined

      vi.restoreAllMocks();
    });

    it('should sort project IDs alphabetically', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Empty projects table
        }),
      });

      const mockSelectDistinct = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        selectDistinct: mockSelectDistinct,
      } as any;

      // Mock Promise.all to return projects in random order
      vi.spyOn(Promise, 'all').mockResolvedValue([
        [{ projectId: 'zzz-project' }],
        [{ projectId: 'aaa-project' }],
        [{ projectId: 'mmm-project' }],
        ...Array(15).fill([]), // empty arrays for remaining tables
      ]);

      const result = await listProjects(mockDb)({
        tenantId: testTenantId,
      });

      expect(result).toEqual([
        { projectId: 'aaa-project' },
        { projectId: 'mmm-project' },
        { projectId: 'zzz-project' },
      ]);

      vi.restoreAllMocks();
    });
  });

  describe('getProjectResourceCounts', () => {
    it('should return resource counts for a project', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ count: 'agent-1' }, { count: 'agent-2' }, { count: 'agent-3' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return different counts for each resource type
      vi.spyOn(Promise, 'all').mockResolvedValue([
        [{ count: 'agent-1' }, { count: 'agent-2' }, { count: 'agent-3' }], // 3 agents
        [{ count: 'graph-1' }], // 1 graph
        [{ count: 'tool-1' }, { count: 'tool-2' }], // 2 tools
        [], // 0 context configs
        [{ count: 'ext-1' }], // 1 external agent
      ]);

      const result = await getProjectResourceCounts(mockDb)({
        tenantId: testTenantId,
        projectId: testProjectId1,
      });

      expect(result).toEqual({
        agents: 3,
        agentGraphs: 1,
        tools: 2,
        contextConfigs: 0,
        externalAgents: 1,
      });

      vi.restoreAllMocks();
    });

    it('should return zero counts when project has no resources', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return empty arrays for all resource types
      vi.spyOn(Promise, 'all').mockResolvedValue([[], [], [], [], []]);

      const result = await getProjectResourceCounts(mockDb)({
        tenantId: testTenantId,
        projectId: testProjectId1,
      });

      expect(result).toEqual({
        agents: 0,
        agentGraphs: 0,
        tools: 0,
        contextConfigs: 0,
        externalAgents: 0,
      });

      vi.restoreAllMocks();
    });
  });

  describe('projectExists', () => {
    it('should return true when project has resources', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'agent-1' }]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return at least one result from the first table
      vi.spyOn(Promise, 'all').mockResolvedValue([
        [{ id: 'agent-1' }], // agents table has results
        [], // other tables don't matter
        [],
        [],
        [],
        [],
        [],
      ]);

      const result = await projectExists(mockDb)({
        tenantId: testTenantId,
        projectId: testProjectId1,
      });

      expect(result).toBe(true);

      vi.restoreAllMocks();
    });

    it('should return false when project has no resources', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return empty arrays from all tables
      vi.spyOn(Promise, 'all').mockResolvedValue([[], [], [], [], [], [], []]);

      const result = await projectExists(mockDb)({
        tenantId: testTenantId,
        projectId: 'non-existent-project',
      });

      expect(result).toBe(false);

      vi.restoreAllMocks();
    });

    it('should return true when any table has resources', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return results only from the last table
      vi.spyOn(Promise, 'all').mockResolvedValue([
        [], // agents
        [], // agentGraph
        [], // tools
        [], // contextConfigs
        [], // externalAgents
        [], // tasks
        [{ id: 'conversation-1' }], // conversations table has results
      ]);

      const result = await projectExists(mockDb)({
        tenantId: testTenantId,
        projectId: testProjectId1,
      });

      expect(result).toBe(true);

      vi.restoreAllMocks();
    });
  });

  describe('countProjects', () => {
    it('should return the count of unique projects', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Empty projects table
        }),
      });

      const mockSelectDistinct = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        selectDistinct: mockSelectDistinct,
      } as any;

      // Mock Promise.all to return projects from different tables
      vi.spyOn(Promise, 'all').mockResolvedValue([
        [{ projectId: testProjectId1 }],
        [{ projectId: testProjectId2 }],
        [{ projectId: testProjectId1 }], // duplicate
        ...Array(15).fill([]), // empty arrays for remaining tables
      ]);

      const result = await countProjects(mockDb)({
        tenantId: testTenantId,
      });

      expect(result).toBe(2); // Should count unique projects only

      vi.restoreAllMocks();
    });

    it('should return 0 when no projects exist', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Empty projects table
        }),
      });

      const mockSelectDistinct = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        selectDistinct: mockSelectDistinct,
      } as any;

      // Mock Promise.all to return empty arrays from all tables
      vi.spyOn(Promise, 'all').mockResolvedValue(Array(18).fill([]));

      const result = await countProjects(mockDb)({
        tenantId: testTenantId,
      });

      expect(result).toBe(0);

      vi.restoreAllMocks();
    });
  });

  describe('listProjectsPaginated', () => {
    it('should list projects with pagination', async () => {
      const mockSelect = vi
        .fn()
        .mockReturnValueOnce({
          // First call - projects data
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue([
                    {
                      id: testProjectId1,
                      tenantId: testTenantId,
                      name: 'Project 1',
                      description: 'Desc 1',
                    },
                    {
                      id: testProjectId2,
                      tenantId: testTenantId,
                      name: 'Project 2',
                      description: 'Desc 2',
                    },
                  ]),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          // Second call - count
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 2 }]),
          }),
        });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listProjectsPaginated(mockDb)({
        tenantId: testTenantId,
        pagination: { page: 1, limit: 10 },
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({ page: 1, limit: 10, total: 2, pages: 1 });
    });

    it('should handle pagination with empty results', async () => {
      const mockSelect = vi
        .fn()
        .mockReturnValueOnce({
          // First call - projects data
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          // Second call - count
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listProjectsPaginated(mockDb)({
        tenantId: testTenantId,
        pagination: { page: 1, limit: 10 },
      });

      expect(result).toEqual({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, pages: 0 },
      });
    });
  });

  describe('getProject', () => {
    it('should retrieve a project by id', async () => {
      const expectedProject = {
        id: testProjectId1,
        tenantId: testTenantId,
        name: 'Test Project',
        description: 'A test project',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        projects: {
          findFirst: vi.fn().mockResolvedValue(expectedProject),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getProject(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId1 },
      });

      expect(mockQuery.projects.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedProject);
    });

    it('should return null if project not found', async () => {
      const mockQuery = {
        projects: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getProject(mockDb)({
        scopes: { tenantId: testTenantId, projectId: 'non-existent' },
      });

      expect(result).toBeNull();
    });
  });

  describe('createProject', () => {
    it('should create a new project', async () => {
      const projectData = {
        tenantId: testTenantId,
        id: testProjectId1,
        name: 'New Project',
        description: 'A new test project',
      };

      const expectedProject = {
        ...projectData,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedProject]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createProject(mockDb)(projectData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedProject);
    });
  });

  describe('updateProject', () => {
    it('should update a project', async () => {
      const updateData = {
        name: 'Updated Project',
        description: 'Updated description',
      };

      const expectedProject = {
        id: testProjectId1,
        tenantId: testTenantId,
        ...updateData,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: expect.any(String),
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([expectedProject]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateProject(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId1 },
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result).toEqual(expectedProject);
    });

    it('should return null when no project is updated', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateProject(mockDb)({
        scopes: { tenantId: testTenantId, projectId: 'non-existent' },
        data: { name: 'Updated Name' },
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteProject', () => {
    it('should delete a project when it has no resources', async () => {
      const mockSelect = vi
        .fn()
        .mockReturnValueOnce({
          // First call - projectExistsInTable (should return true)
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: testProjectId1 }]), // Project exists in table
            }),
          }),
        })
        .mockReturnValue({
          // Subsequent calls - projectExists checks (should return false/empty)
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // No resources
            }),
          }),
        });

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        delete: mockDelete,
      } as any;

      // Mock Promise.all to return empty arrays (no resources)
      vi.spyOn(Promise, 'all').mockResolvedValue(Array(7).fill([]));

      const result = await deleteProject(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId1 },
      });

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('should return false when project does not exist in table', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // Project not found in table
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await deleteProject(mockDb)({
        scopes: { tenantId: testTenantId, projectId: 'non-existent' },
      });

      expect(result).toBe(false);
    });

    it('should throw error when project has resources', async () => {
      const mockSelect = vi
        .fn()
        .mockReturnValueOnce({
          // First call - projectExistsInTable (should return true)
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: testProjectId1 }]), // Project exists in table
            }),
          }),
        })
        .mockReturnValue({
          // Subsequent calls - projectExists checks (should return true/has resources)
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'agent-1' }]), // Has resources
            }),
          }),
        });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return some resources
      vi.spyOn(Promise, 'all').mockResolvedValue([
        [{ id: 'agent-1' }], // Has agents
        [],
        [],
        [],
        [],
        [],
        [],
      ]);

      await expect(
        deleteProject(mockDb)({
          scopes: { tenantId: testTenantId, projectId: testProjectId1 },
        })
      ).rejects.toThrow('Cannot delete project with existing resources');

      vi.restoreAllMocks();
    });
  });

  describe('projectExistsInTable', () => {
    it('should return true when project exists in table', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: testProjectId1 }]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await projectExistsInTable(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId1 },
      });

      expect(result).toBe(true);
      expect(mockSelect).toHaveBeenCalled();
    });

    it('should return false when project does not exist in table', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await projectExistsInTable(mockDb)({
        scopes: { tenantId: testTenantId, projectId: 'non-existent' },
      });

      expect(result).toBe(false);
    });
  });

  describe('projectHasResources', () => {
    it('should return true when project has resources', async () => {
      // Mock Promise.all to return some resources
      vi.spyOn(Promise, 'all').mockResolvedValue([
        [{ id: 'agent-1' }], // Has agents
        [],
        [],
        [],
        [],
        [],
        [],
      ]);

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'agent-1' }]),
            }),
          }),
        }),
      } as any;

      const result = await projectHasResources(mockDb)({
        tenantId: testTenantId,
        projectId: testProjectId1,
      });

      expect(result).toBe(true);

      vi.restoreAllMocks();
    });

    it('should return false when project has no resources', async () => {
      // Mock Promise.all to return empty arrays
      vi.spyOn(Promise, 'all').mockResolvedValue(Array(7).fill([]));

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any;

      const result = await projectHasResources(mockDb)({
        tenantId: testTenantId,
        projectId: testProjectId1,
      });

      expect(result).toBe(false);

      vi.restoreAllMocks();
    });
  });
});
