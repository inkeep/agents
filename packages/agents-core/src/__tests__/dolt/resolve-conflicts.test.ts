import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../dolt/pk-map', () => ({
  isValidManageTable: vi.fn((name: string) =>
    ['agent', 'tools', 'functions', 'function_tools'].includes(name)
  ),
  managePkMap: {
    agent: ['tenant_id', 'project_id', 'id'],
    tools: ['tenant_id', 'project_id', 'id'],
    functions: ['tenant_id', 'project_id', 'id'],
    function_tools: ['tenant_id', 'project_id', 'agent_id', 'id'],
  },
}));

vi.mock('../../dolt/fk-map', () => ({
  manageFkDeps: {
    function_tools: ['functions', 'agent'],
    tools: ['projects'],
    agent: ['projects'],
  },
}));

import { applyResolutions } from '../../dolt/resolve-conflicts';
import type { ConflictResolution } from '../../validation/dolt-schemas';

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

  it('serializes jsonb object values correctly in UPDATE', async () => {
    const configObj = { maxTokens: 100, nested: { key: 'value' } };
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
          our_config: { old: true },
          their_config: configObj,
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
    expect(updateQuery).toContain(JSON.stringify(configObj));
    expect(updateQuery).not.toContain('[object Object]');
  });

  it('serializes jsonb object values correctly in INSERT (ourDiffType=removed)', async () => {
    const configObj = { enabled: true };
    mockDb.queryResults['dolt_conflicts_agent'] = {
      rows: [
        {
          our_diff_type: 'removed',
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
          our_name: null,
          their_name: 'Restored Agent',
          our_config: null,
          their_config: configObj,
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

    const insertQuery = mockDb.executedQueries.find((q) => q.includes('INSERT'));
    expect(insertQuery).toBeDefined();
    expect(insertQuery).toContain(JSON.stringify(configObj));
    expect(insertQuery).not.toContain('[object Object]');
  });

  it('serializes jsonb object values correctly in mixed resolution', async () => {
    const oursConfig = { source: 'ours' };
    const theirsConfig = { source: 'theirs' };
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
          our_config: oursConfig,
          their_config: theirsConfig,
        },
      ],
    };

    const resolutions: ConflictResolution[] = [
      {
        table: 'agent',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'a1' },
        rowDefaultPick: 'ours',
        columns: { config: 'theirs' },
      },
    ];

    await applyResolutions(mockDb.db)(resolutions);

    const updateQuery = mockDb.executedQueries.find((q) => q.includes('UPDATE'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery).toContain(JSON.stringify(theirsConfig));
    expect(updateQuery).toContain('Our Name');
    expect(updateQuery).not.toContain('[object Object]');
  });

  it('finds conflict row when base PK columns are NULL (add-add conflict)', async () => {
    mockDb.queryResults['dolt_conflicts_agent'] = {
      rows: [
        {
          our_diff_type: 'added',
          their_diff_type: 'added',
          base_tenant_id: null,
          base_project_id: null,
          base_id: null,
          our_tenant_id: 't1',
          our_project_id: 'p1',
          our_id: 'a1',
          their_tenant_id: 't1',
          their_project_id: 'p1',
          their_id: 'a1',
          our_name: 'Our Added Agent',
          their_name: 'Their Added Agent',
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

    const selectQuery = mockDb.executedQueries.find((q) => q.includes('dolt_conflicts_agent'));
    expect(selectQuery).toBeDefined();
    expect(selectQuery).toContain('base_tenant_id IS NULL');
    expect(selectQuery).toContain('our_tenant_id');
    expect(selectQuery).toContain('their_tenant_id');

    const updateQuery = mockDb.executedQueries.find((q) => q.includes('UPDATE'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery).toContain('Their Added Agent');
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

  it('inserts parent table before child table when both need INSERT', async () => {
    mockDb.queryResults['dolt_conflicts_functions'] = {
      rows: [
        {
          our_diff_type: 'removed',
          their_diff_type: 'modified',
          base_tenant_id: 't1',
          base_project_id: 'p1',
          base_id: 'f1',
          our_tenant_id: 't1',
          our_project_id: 'p1',
          our_id: 'f1',
          their_tenant_id: 't1',
          their_project_id: 'p1',
          their_id: 'f1',
          our_execute_code: null,
          their_execute_code: 'console.log("hi")',
        },
      ],
    };

    mockDb.queryResults['dolt_conflicts_function_tools'] = {
      rows: [
        {
          our_diff_type: 'removed',
          their_diff_type: 'modified',
          base_tenant_id: 't1',
          base_project_id: 'p1',
          base_agent_id: 'a1',
          base_id: 'ft1',
          our_tenant_id: 't1',
          our_project_id: 'p1',
          our_agent_id: 'a1',
          our_id: 'ft1',
          their_tenant_id: 't1',
          their_project_id: 'p1',
          their_agent_id: 'a1',
          their_id: 'ft1',
          our_function_id: null,
          their_function_id: 'f1',
        },
      ],
    };

    const resolutions: ConflictResolution[] = [
      {
        table: 'function_tools',
        primaryKey: { tenant_id: 't1', project_id: 'p1', agent_id: 'a1', id: 'ft1' },
        rowDefaultPick: 'theirs',
      },
      {
        table: 'functions',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'f1' },
        rowDefaultPick: 'theirs',
      },
    ];

    await applyResolutions(mockDb.db)(resolutions);

    const insertQueries = mockDb.executedQueries.filter((q: string) => q.includes('INSERT'));
    expect(insertQueries).toHaveLength(2);
    expect(insertQueries[0]).toContain('"functions"');
    expect(insertQueries[1]).toContain('"function_tools"');
  });

  it('deletes child table before parent table when both need DELETE', async () => {
    mockDb.queryResults['dolt_conflicts_functions'] = {
      rows: [
        {
          our_diff_type: 'modified',
          their_diff_type: 'removed',
          base_tenant_id: 't1',
          base_project_id: 'p1',
          base_id: 'f1',
          our_tenant_id: 't1',
          our_project_id: 'p1',
          our_id: 'f1',
          their_tenant_id: 't1',
          their_project_id: 'p1',
          their_id: 'f1',
          our_execute_code: 'console.log("hi")',
          their_execute_code: null,
        },
      ],
    };

    mockDb.queryResults['dolt_conflicts_function_tools'] = {
      rows: [
        {
          our_diff_type: 'modified',
          their_diff_type: 'removed',
          base_tenant_id: 't1',
          base_project_id: 'p1',
          base_agent_id: 'a1',
          base_id: 'ft1',
          our_tenant_id: 't1',
          our_project_id: 'p1',
          our_agent_id: 'a1',
          our_id: 'ft1',
          their_tenant_id: 't1',
          their_project_id: 'p1',
          their_agent_id: 'a1',
          their_id: 'ft1',
          our_function_id: 'f1',
          their_function_id: null,
        },
      ],
    };

    const resolutions: ConflictResolution[] = [
      {
        table: 'functions',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'f1' },
        rowDefaultPick: 'theirs',
      },
      {
        table: 'function_tools',
        primaryKey: { tenant_id: 't1', project_id: 'p1', agent_id: 'a1', id: 'ft1' },
        rowDefaultPick: 'theirs',
      },
    ];

    await applyResolutions(mockDb.db)(resolutions);

    const deleteQueries = mockDb.executedQueries.filter((q: string) => q.includes('DELETE'));
    expect(deleteQueries).toHaveLength(2);
    expect(deleteQueries[0]).toContain('"function_tools"');
    expect(deleteQueries[1]).toContain('"functions"');
  });

  it('rejects column overrides when ours side deleted the row', async () => {
    mockDb.queryResults['dolt_conflicts_agent'] = {
      rows: [
        {
          our_diff_type: 'removed',
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
          our_name: null,
          their_name: 'Their Agent',
        },
      ],
    };

    const resolutions: ConflictResolution[] = [
      {
        table: 'agent',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'a1' },
        rowDefaultPick: 'theirs',
        columns: { name: 'ours' },
      },
    ];

    await expect(applyResolutions(mockDb.db)(resolutions)).rejects.toThrow(
      'Cannot apply column overrides'
    );
  });

  it('rejects column overrides when theirs side deleted the row', async () => {
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
        rowDefaultPick: 'ours',
        columns: { name: 'theirs' },
      },
    ];

    await expect(applyResolutions(mockDb.db)(resolutions)).rejects.toThrow(
      'Cannot apply column overrides'
    );
  });

  it('allows column overrides matching rowDefaultPick when a side is removed', async () => {
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
        rowDefaultPick: 'ours',
        columns: { name: 'ours' },
      },
    ];

    await applyResolutions(mockDb.db)(resolutions);

    const mutationQueries = mockDb.executedQueries.filter(
      (q) => !q.includes('DOLT_CONFLICTS_RESOLVE') && !q.includes('dolt_conflicts_')
    );
    expect(mutationQueries).toHaveLength(0);
  });

  it('processes DELETEs before INSERTs across different tables', async () => {
    mockDb.queryResults['dolt_conflicts_functions'] = {
      rows: [
        {
          our_diff_type: 'removed',
          their_diff_type: 'modified',
          base_tenant_id: 't1',
          base_project_id: 'p1',
          base_id: 'f1',
          our_tenant_id: 't1',
          our_project_id: 'p1',
          our_id: 'f1',
          their_tenant_id: 't1',
          their_project_id: 'p1',
          their_id: 'f1',
          our_execute_code: null,
          their_execute_code: 'code',
        },
      ],
    };

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
          our_name: 'Agent',
          their_name: null,
        },
      ],
    };

    const resolutions: ConflictResolution[] = [
      {
        table: 'functions',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'f1' },
        rowDefaultPick: 'theirs',
      },
      {
        table: 'agent',
        primaryKey: { tenant_id: 't1', project_id: 'p1', id: 'a1' },
        rowDefaultPick: 'theirs',
      },
    ];

    await applyResolutions(mockDb.db)(resolutions);

    const mutationQueries = mockDb.executedQueries.filter(
      (q: string) => q.includes('DELETE') || q.includes('INSERT')
    );
    expect(mutationQueries).toHaveLength(2);
    expect(mutationQueries[0]).toContain('DELETE');
    expect(mutationQueries[1]).toContain('INSERT');
  });
});
