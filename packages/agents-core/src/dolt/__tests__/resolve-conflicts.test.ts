import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../pk-map', () => ({
  isValidManageTable: vi.fn((name: string) => name === 'agent' || name === 'tools'),
  managePkMap: {
    agent: ['tenant_id', 'project_id', 'id'],
    tools: ['tenant_id', 'project_id', 'id'],
  },
}));

import type { ConflictResolution } from '../resolve-conflicts';
import { applyResolutions } from '../resolve-conflicts';

function createMockDb() {
  const executedQueries: string[] = [];
  const queryResults: Record<string, any> = {};

  const db = {
    execute: vi.fn(async (query: any) => {
      const queryStr =
        typeof query === 'string'
          ? query
          : (query?.queryChunks?.[0]?.value?.[0] ?? query.toString());
      executedQueries.push(queryStr);

      for (const [pattern, result] of Object.entries(queryResults)) {
        if (queryStr.includes(pattern)) {
          return result;
        }
      }
      return { rows: [] };
    }),
  } as any;

  return { db, executedQueries, queryResults };
}

describe('applyResolutions', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('is a no-op for ours pick with no column overrides', async () => {
    const resolutions: ConflictResolution[] = [
      {
        table: 'agent',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'a1' },
        rowDefaultPick: 'ours',
      },
    ];

    await applyResolutions(mockDb.db)(resolutions);

    const queries = mockDb.executedQueries;
    const nonResolveQueries = queries.filter((q) => !q.includes('DOLT_CONFLICTS_RESOLVE'));
    expect(nonResolveQueries).toHaveLength(0);
    expect(queries.some((q) => q.includes('DOLT_CONFLICTS_RESOLVE'))).toBe(true);
  });

  it('applies theirs pick with UPDATE for modified rows', async () => {
    mockDb.queryResults['dolt_conflicts_agent'] = {
      rows: [
        {
          our_diff_type: 'modified',
          their_diff_type: 'modified',
          base_tenant_id: 't1',
          base_project_id: 'p1',
          base_id: 'a1',
          our_tenant_id: 't1',
          our_project_id: 'p1',
          our_id: 'a1',
          their_tenant_id: 't1',
          their_project_id: 'p1',
          their_id: 'a1',
          our_name: 'Our Agent',
          their_name: 'Their Agent',
          our_description: 'Our desc',
          their_description: 'Their desc',
        },
      ],
    };

    const resolutions: ConflictResolution[] = [
      {
        table: 'agent',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'a1' },
        rowDefaultPick: 'theirs',
      },
    ];

    await applyResolutions(mockDb.db)(resolutions);

    const updateQuery = mockDb.executedQueries.find((q) => q.includes('UPDATE'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery).toContain('"agent"');
    expect(updateQuery).toContain('Their Agent');
  });

  it('applies DELETE for theirs pick when theirDiffType is removed', async () => {
    mockDb.queryResults['dolt_conflicts_agent'] = {
      rows: [
        {
          our_diff_type: 'modified',
          their_diff_type: 'removed',
          base_tenant_id: 't1',
          base_project_id: 'p1',
          base_id: 'a1',
          our_tenant_id: 't1',
          our_project_id: 'p1',
          our_id: 'a1',
          their_tenant_id: 't1',
          their_project_id: 'p1',
          their_id: 'a1',
          our_name: 'Our Agent',
          their_name: null,
        },
      ],
    };

    const resolutions: ConflictResolution[] = [
      {
        table: 'agent',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'a1' },
        rowDefaultPick: 'theirs',
      },
    ];

    await applyResolutions(mockDb.db)(resolutions);

    const deleteQuery = mockDb.executedQueries.find((q) => q.includes('DELETE'));
    expect(deleteQuery).toBeDefined();
    expect(deleteQuery).toContain('"agent"');
  });

  it('applies mixed column resolution', async () => {
    mockDb.queryResults['dolt_conflicts_agent'] = {
      rows: [
        {
          our_diff_type: 'modified',
          their_diff_type: 'modified',
          base_tenant_id: 't1',
          base_project_id: 'p1',
          base_id: 'a1',
          our_tenant_id: 't1',
          our_project_id: 'p1',
          our_id: 'a1',
          their_tenant_id: 't1',
          their_project_id: 'p1',
          their_id: 'a1',
          our_name: 'Our Name',
          their_name: 'Their Name',
          our_description: 'Our Desc',
          their_description: 'Their Desc',
        },
      ],
    };

    const resolutions: ConflictResolution[] = [
      {
        table: 'agent',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'a1' },
        rowDefaultPick: 'ours',
        columns: { name: 'theirs' },
      },
    ];

    await applyResolutions(mockDb.db)(resolutions);

    const updateQuery = mockDb.executedQueries.find((q) => q.includes('UPDATE'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery).toContain('Their Name');
    expect(updateQuery).toContain('Our Desc');
  });

  it('throws for invalid table name', async () => {
    const resolutions: ConflictResolution[] = [
      {
        table: 'DROP TABLE agent',
        primaryKey: { id: '1' },
        rowDefaultPick: 'ours',
      },
    ];

    await expect(applyResolutions(mockDb.db)(resolutions)).rejects.toThrow('Invalid table name');
  });
});
