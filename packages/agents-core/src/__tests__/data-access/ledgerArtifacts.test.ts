import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLedgerArtifacts,
  countLedgerArtifactsByTask,
  deleteLedgerArtifactsByContext,
  deleteLedgerArtifactsByTask,
  getLedgerArtifacts,
  getLedgerArtifactsByContext,
} from '../../data-access/ledgerArtifacts';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';

describe('Ledger Artifacts Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'tenant-123';
  const testProjectId = 'project-456';
  const testContextId = 'context-789';
  const testTaskId = 'task-abc';
  const testArtifactId = 'artifact-xyz';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('addLedgerArtifacts', () => {
    it('should add artifacts to the ledger', async () => {
      const artifacts = [
        {
          artifactId: testArtifactId,
          type: 'source',
          name: 'Test Artifact',
          description: 'A test artifact',
          parts: [
            { kind: 'text', text: 'Hello world' } as const,
            { kind: 'data', data: { key: 'value' } } as const,
          ],
          metadata: {
            visibility: 'public',
            allowedAgents: ['agent-1', 'agent-2'],
          },
        },
        {
          artifactId: 'artifact-2',
          name: 'Another Artifact',
          description: 'Another test artifact',
          parts: [{ kind: 'file', file: { name: 'test.txt', uri: 'file://test.txt' } } as const],
          metadata: { source: 'test' },
        },
      ];

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      await addLedgerArtifacts(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        contextId: testContextId,
        taskId: testTaskId,
        artifacts,
      });

      expect(mockInsert).toHaveBeenCalled();
      const valuesCall = mockInsert().values.mock.calls[0][0];
      expect(valuesCall).toHaveLength(2);
      expect(valuesCall[0]).toHaveProperty('id', testArtifactId);
      expect(valuesCall[0]).toHaveProperty('tenantId', testTenantId);
      expect(valuesCall[0]).toHaveProperty('projectId', testProjectId);
    });

    it('should handle artifacts with no artifactId (generate nanoid)', async () => {
      const artifacts = [
        {
          artifactId: 'generated-artifact-id',
          name: 'Unnamed Artifact',
          description: 'An artifact without ID',
          parts: [{ kind: 'text', text: 'Content' } as const],
          metadata: {},
        },
      ];

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      await addLedgerArtifacts(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        contextId: testContextId,
        artifacts,
      });

      expect(mockInsert).toHaveBeenCalled();
      const valuesCall = mockInsert().values.mock.calls[0][0];
      expect(valuesCall[0]).toHaveProperty('id');
      expect(valuesCall[0].id).toBeTruthy();
    });

    it('should handle taskId precedence correctly', async () => {
      const artifacts = [
        {
          artifactId: testArtifactId,
          taskId: 'artifact-task-id',
          parts: [],
          metadata: { taskId: 'metadata-task-id' },
        },
      ];

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      // Test explicit taskId takes precedence
      await addLedgerArtifacts(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        contextId: testContextId,
        taskId: 'explicit-task-id',
        artifacts,
      });

      const valuesCall = mockInsert().values.mock.calls[0][0];
      expect(valuesCall[0].taskId).toBe('explicit-task-id');
    });

    it('should handle empty artifacts array', async () => {
      const mockInsert = vi.fn();

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      await addLedgerArtifacts(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        contextId: testContextId,
        artifacts: [],
      });

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('should set ledger-specific fields correctly', async () => {
      const artifacts = [
        {
          artifactId: testArtifactId,
          description: 'A'.repeat(250), // Long description
          parts: [
            { kind: 'text', text: 'Text part' } as const,
            { kind: 'file', file: { name: 'file.txt', uri: 'file://test' } } as const,
          ],
          metadata: {
            visibility: 'private',
            allowedAgents: ['agent-1'],
            derivedFrom: 'parent-artifact',
          },
        },
      ];

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      await addLedgerArtifacts(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        contextId: testContextId,
        artifacts,
      });

      const valuesCall = mockInsert().values.mock.calls[0][0];
      const row = valuesCall[0];

      expect(row.summary).toBe('A'.repeat(200)); // Truncated to 200 chars
      expect(row.mime).toEqual(['text', 'file']);
      expect(row.visibility).toBe('private');
      expect(row.allowedAgents).toEqual(['agent-1']);
      expect(row.derivedFrom).toBe('parent-artifact');
    });
  });

  describe('getLedgerArtifacts', () => {
    it('should retrieve artifacts by taskId', async () => {
      const mockRows = [
        {
          id: testArtifactId,
          tenantId: testTenantId,
          projectId: testProjectId,
          taskId: testTaskId,
          contextId: testContextId,
          type: 'source',
          name: 'Test Artifact',
          description: 'A test artifact',
          parts: [{ kind: 'text', text: 'Hello' }],
          metadata: { key: 'value' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockRows),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getLedgerArtifacts(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        taskId: testTaskId,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        artifactId: testArtifactId,
        type: 'source',
        taskId: testTaskId,
        name: 'Test Artifact',
        description: 'A test artifact',
        parts: [{ kind: 'text', text: 'Hello' }],
        metadata: { key: 'value' },
      });
    });

    it('should retrieve artifacts by artifactId', async () => {
      const mockRows = [
        {
          id: testArtifactId,
          tenantId: testTenantId,
          projectId: testProjectId,
          taskId: null,
          contextId: testContextId,
          type: 'generated',
          name: null,
          description: null,
          parts: null,
          metadata: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockRows),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getLedgerArtifacts(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        artifactId: testArtifactId,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        artifactId: testArtifactId,
        type: 'generated',
        taskId: undefined,
        name: undefined,
        description: undefined,
        parts: [],
        metadata: {},
      });
    });

    it('should retrieve artifacts by both taskId and artifactId', async () => {
      const mockRows = [
        {
          id: testArtifactId,
          tenantId: testTenantId,
          projectId: testProjectId,
          taskId: testTaskId,
          contextId: testContextId,
          type: 'source',
          name: 'Specific Artifact',
          description: 'Found by both IDs',
          parts: [],
          metadata: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockRows),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getLedgerArtifacts(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        taskId: testTaskId,
        artifactId: testArtifactId,
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Specific Artifact');
    });

    it('should throw error when neither taskId nor artifactId provided', async () => {
      const mockDb = {} as any;

      await expect(
        getLedgerArtifacts(mockDb)({
          scopes: { tenantId: testTenantId, projectId: testProjectId },
        })
      ).rejects.toThrow('Either taskId or artifactId must be provided');
    });

    it('should return empty array when no artifacts found', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getLedgerArtifacts(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        taskId: testTaskId,
      });

      expect(result).toEqual([]);
    });
  });

  describe('getLedgerArtifactsByContext', () => {
    it('should retrieve artifacts by context ID', async () => {
      const expectedArtifacts = [
        {
          id: testArtifactId,
          tenantId: testTenantId,
          projectId: testProjectId,
          contextId: testContextId,
          taskId: testTaskId,
          type: 'source',
          name: 'Context Artifact',
          description: 'Artifact in context',
          parts: null,
          metadata: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(expectedArtifacts),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getLedgerArtifactsByContext(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        contextId: testContextId,
      });

      expect(result).toEqual(expectedArtifacts);
    });

    it('should return empty array when no artifacts in context', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getLedgerArtifactsByContext(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        contextId: testContextId,
      });

      expect(result).toEqual([]);
    });
  });

  describe('deleteLedgerArtifactsByTask', () => {
    it('should delete artifacts by task ID', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: testArtifactId }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteLedgerArtifactsByTask(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        taskId: testTaskId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when no artifacts to delete', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteLedgerArtifactsByTask(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        taskId: 'non-existent-task',
      });

      expect(result).toBe(false);
    });
  });

  describe('deleteLedgerArtifactsByContext', () => {
    it('should delete artifacts by context ID', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'artifact-1' }, { id: 'artifact-2' }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteLedgerArtifactsByContext(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        contextId: testContextId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when no artifacts to delete', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteLedgerArtifactsByContext(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        contextId: 'non-existent-context',
      });

      expect(result).toBe(false);
    });
  });

  describe('countLedgerArtifactsByTask', () => {
    it('should count artifacts by task ID', async () => {
      const mockResults = [{ count: 3 }];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockResults),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await countLedgerArtifactsByTask(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        taskId: testTaskId,
      });

      expect(result).toBe(3);
    });

    it('should handle string count values', async () => {
      const mockResults = [{ count: '5' }];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockResults),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await countLedgerArtifactsByTask(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        taskId: testTaskId,
      });

      expect(result).toBe(5);
    });

    it('should return 0 when no artifacts found', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await countLedgerArtifactsByTask(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        taskId: 'non-existent-task',
      });

      expect(result).toBe(0);
    });
  });
});
