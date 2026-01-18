import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listEvaluationRunConfigsWithSuiteConfigs } from '../../data-access/manage/evalConfig';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';

describe('Eval config data access', () => {
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    db = {} as any;
  });

  describe('listEvaluationRunConfigsWithSuiteConfigs', () => {
    it('should return run configs with suiteConfigIds grouped from relations', async () => {
      const rows = [
        {
          runConfig: {
            id: 'run-config-1',
            tenantId: 'tenant-1',
            projectId: 'project-1',
            name: 'Config 1',
            description: null,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          suiteConfigId: 'suite-1',
        },
        {
          runConfig: {
            id: 'run-config-1',
            tenantId: 'tenant-1',
            projectId: 'project-1',
            name: 'Config 1',
            description: null,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          suiteConfigId: 'suite-2',
        },
        {
          runConfig: {
            id: 'run-config-2',
            tenantId: 'tenant-1',
            projectId: 'project-1',
            name: 'Config 2',
            description: 'Desc',
            isActive: false,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
          suiteConfigId: null,
        },
      ];

      const mockWhere = vi.fn().mockResolvedValue(rows);
      const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listEvaluationRunConfigsWithSuiteConfigs(mockDb)({
        scopes: { tenantId: 'tenant-1', projectId: 'project-1' },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalled();
      expect(mockLeftJoin).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();

      expect(result).toEqual([
        {
          id: 'run-config-1',
          name: 'Config 1',
          description: null,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          suiteConfigIds: ['suite-1', 'suite-2'],
        },
        {
          id: 'run-config-2',
          name: 'Config 2',
          description: 'Desc',
          isActive: false,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          suiteConfigIds: [],
        },
      ]);

      expect('tenantId' in (result[0] as any)).toBe(false);
      expect('projectId' in (result[0] as any)).toBe(false);
    });
  });
});


