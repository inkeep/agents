import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countTeamAgents,
  createTeamAgent,
  deleteTeamAgent,
  getTeamAgentById,
  getTeamAgentByOriginAgentId,
  listTeamAgents,
  listTeamAgentsPaginated,
  teamAgentExists,
  teamAgentOriginExists,
  updateTeamAgent,
  upsertTeamAgent,
  validateSameTenant,
} from '../../data-access/teamAgents';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';

describe('Team Agents Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'tenant-123';
  const testProjectId = 'project-456';
  const testAgentId = 'agent-789';
  const testTeamAgentId = 'team-agent-001';
  const testOriginAgentId = 'agent-origin';
  const testOriginProjectId = 'project-origin';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('createTeamAgent', () => {
    it('should create a new team agent', async () => {
      const teamAgentData = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: testTeamAgentId,
        originAgentId: testOriginAgentId,
        originProjectId: testOriginProjectId,
      };

      const expectedTeamAgent = {
        ...teamAgentData,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedTeamAgent]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createTeamAgent(mockDb)(teamAgentData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedTeamAgent);
    });

    it('should create team agent with all required fields', async () => {
      const teamAgentData = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: testTeamAgentId,
        originAgentId: testOriginAgentId,
        originProjectId: testOriginProjectId,
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([teamAgentData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createTeamAgent(mockDb)(teamAgentData);

      expect(result).toHaveProperty('tenantId', testTenantId);
      expect(result).toHaveProperty('projectId', testProjectId);
      expect(result).toHaveProperty('agentId', testAgentId);
      expect(result).toHaveProperty('originAgentId', testOriginAgentId);
      expect(result).toHaveProperty('originProjectId', testOriginProjectId);
    });
  });

  describe('getTeamAgentById', () => {
    it('should retrieve a team agent by ID', async () => {
      const expectedTeamAgent = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: testTeamAgentId,
        originAgentId: testOriginAgentId,
        originProjectId: testOriginProjectId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockFindFirst = vi.fn().mockResolvedValue(expectedTeamAgent);

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await getTeamAgentById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        teamAgentId: testTeamAgentId,
      });

      expect(mockFindFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedTeamAgent);
    });

    it('should return null if team agent not found', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue(undefined);

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await getTeamAgentById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        teamAgentId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('getTeamAgentByOriginAgentId', () => {
    it('should retrieve a team agent by origin agent ID', async () => {
      const expectedTeamAgent = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: testTeamAgentId,
        originAgentId: testOriginAgentId,
        originProjectId: testOriginProjectId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockFindFirst = vi.fn().mockResolvedValue(expectedTeamAgent);

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await getTeamAgentByOriginAgentId(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        originAgentId: testOriginAgentId,
        originProjectId: testOriginProjectId,
      });

      expect(mockFindFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedTeamAgent);
    });

    it('should return null if no team agent matches origin', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue(undefined);

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await getTeamAgentByOriginAgentId(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        originAgentId: 'unknown-origin',
        originProjectId: 'unknown-project',
      });

      expect(result).toBeNull();
    });
  });

  describe('listTeamAgents', () => {
    it('should list all team agents for an agent', async () => {
      const teamAgents = [
        {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          id: 'team-agent-1',
          originAgentId: 'origin-1',
          originProjectId: 'project-1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          id: 'team-agent-2',
          originAgentId: 'origin-2',
          originProjectId: 'project-2',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      const mockFindMany = vi.fn().mockResolvedValue(teamAgents);

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findMany: mockFindMany,
          },
        },
      } as any;

      const result = await listTeamAgents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
      });

      expect(mockFindMany).toHaveBeenCalled();
      expect(result).toEqual(teamAgents);
      expect(result).toHaveLength(2);
    });
  });

  describe('listTeamAgentsPaginated', () => {
    it('should list team agents with pagination', async () => {
      const teamAgents = [
        {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          id: 'team-agent-1',
          originAgentId: 'origin-1',
          originProjectId: 'project-1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(teamAgents),
              }),
            }),
          }),
        }),
      });

      const mockSelectCount = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock count query separately
      mockSelect.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(teamAgents),
              }),
            }),
          }),
        }),
      })).mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      }));

      const result = await listTeamAgentsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        pagination: { page: 1, limit: 10 },
      });

      expect(result.data).toEqual(teamAgents);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        pages: 1,
      });
    });
  });

  describe('updateTeamAgent', () => {
    it('should update a team agent', async () => {
      const updatedTeamAgent = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: testTeamAgentId,
        originAgentId: 'updated-origin',
        originProjectId: 'updated-project',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTeamAgent]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateTeamAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        teamAgentId: testTeamAgentId,
        data: {
          originAgentId: 'updated-origin',
          originProjectId: 'updated-project',
        },
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result).toEqual(updatedTeamAgent);
    });

    it('should throw error if no fields to update', async () => {
      const mockDb = db as any;

      await expect(
        updateTeamAgent(mockDb)({
          scopes: {
            tenantId: testTenantId,
            projectId: testProjectId,
            agentId: testAgentId,
          },
          teamAgentId: testTeamAgentId,
          data: {},
        })
      ).rejects.toThrow('No fields to update');
    });
  });

  describe('deleteTeamAgent', () => {
    it('should delete a team agent', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: testTeamAgentId }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteTeamAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        teamAgentId: testTeamAgentId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false if team agent not found', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteTeamAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        teamAgentId: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });

  describe('teamAgentExists', () => {
    it('should return true if team agent exists', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue({
        id: testTeamAgentId,
      });

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await teamAgentExists(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        teamAgentId: testTeamAgentId,
      });

      expect(result).toBe(true);
    });

    it('should return false if team agent does not exist', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue(null);

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await teamAgentExists(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        teamAgentId: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });

  describe('teamAgentOriginExists', () => {
    it('should return true if team agent with origin exists', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue({
        id: testTeamAgentId,
      });

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await teamAgentOriginExists(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        originAgentId: testOriginAgentId,
        originProjectId: testOriginProjectId,
      });

      expect(result).toBe(true);
    });

    it('should return false if no team agent with origin exists', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue(null);

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await teamAgentOriginExists(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        originAgentId: 'unknown',
        originProjectId: 'unknown',
      });

      expect(result).toBe(false);
    });
  });

  describe('countTeamAgents', () => {
    it('should count team agents for an agent', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countTeamAgents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
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

      const result = await countTeamAgents(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
      });

      expect(result).toBe(10);
    });
  });

  describe('validateSameTenant', () => {
    it('should return true if origin agent is in same tenant', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue({
        id: testOriginAgentId,
        tenantId: testTenantId,
      });

      const mockDb = {
        ...db,
        query: {
          agents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await validateSameTenant(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        originAgentId: testOriginAgentId,
        originProjectId: testOriginProjectId,
      });

      expect(result).toBe(true);
    });

    it('should return false if origin agent is in different tenant', async () => {
      const mockFindFirst = vi.fn().mockResolvedValue(null);

      const mockDb = {
        ...db,
        query: {
          agents: {
            findFirst: mockFindFirst,
          },
        },
      } as any;

      const result = await validateSameTenant(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        originAgentId: 'cross-tenant-agent',
        originProjectId: 'cross-tenant-project',
      });

      expect(result).toBe(false);
    });
  });

  describe('upsertTeamAgent', () => {
    it('should create team agent if it does not exist', async () => {
      const teamAgentData = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: testTeamAgentId,
        originAgentId: testOriginAgentId,
        originProjectId: testOriginProjectId,
      };

      const mockFindFirst = vi.fn().mockResolvedValue(null);
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([teamAgentData]),
        }),
      });

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
        insert: mockInsert,
      } as any;

      const result = await upsertTeamAgent(mockDb)({ data: teamAgentData });

      expect(mockFindFirst).toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(teamAgentData);
    });

    it('should update team agent if it exists', async () => {
      const teamAgentData = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        id: testTeamAgentId,
        originAgentId: 'updated-origin',
        originProjectId: 'updated-project',
      };

      const existingTeamAgent = {
        ...teamAgentData,
        originAgentId: 'old-origin',
        originProjectId: 'old-project',
      };

      const mockFindFirst = vi.fn().mockResolvedValue(existingTeamAgent);
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([teamAgentData]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        query: {
          teamAgents: {
            findFirst: mockFindFirst,
          },
        },
        update: mockUpdate,
      } as any;

      const result = await upsertTeamAgent(mockDb)({ data: teamAgentData });

      expect(mockFindFirst).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
      expect(result).toEqual(teamAgentData);
    });
  });
});
