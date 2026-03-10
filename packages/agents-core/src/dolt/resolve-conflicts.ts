import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import { isValidManageTable, managePkMap } from './pk-map';

export type ConflictResolution = {
  table: string;
  primaryKey: Record<string, string>;
  rowDefaultPick: 'ours' | 'theirs';
  columns?: Record<string, 'ours' | 'theirs'>;
};

export const applyResolutions =
  (db: AgentsManageDatabaseClient) =>
  async (resolutions: ConflictResolution[]): Promise<void> => {
    const affectedTables = new Set<string>();

    for (const resolution of resolutions) {
      if (!isValidManageTable(resolution.table)) {
        throw new Error(`Invalid table name: ${resolution.table}`);
      }
      affectedTables.add(resolution.table);

      const pkColumns = managePkMap[resolution.table];
      if (!pkColumns) {
        throw new Error(`No PK columns found for table: ${resolution.table}`);
      }

      const hasColumnOverrides = resolution.columns && Object.keys(resolution.columns).length > 0;

      if (resolution.rowDefaultPick === 'ours' && !hasColumnOverrides) {
        continue;
      }

      const conflictRow = await readConflictRow(
        db,
        resolution.table,
        resolution.primaryKey,
        pkColumns
      );

      if (!conflictRow) {
        throw new Error(
          `No conflict found for table ${resolution.table} with PK ${JSON.stringify(resolution.primaryKey)}`
        );
      }

      const ourDiffType = conflictRow.our_diff_type as string;
      const theirDiffType = conflictRow.their_diff_type as string;

      if (resolution.rowDefaultPick === 'theirs' && !hasColumnOverrides) {
        await applyTheirsResolution(
          db,
          resolution.table,
          resolution.primaryKey,
          pkColumns,
          conflictRow,
          ourDiffType,
          theirDiffType
        );
      } else {
        await applyMixedResolution(
          db,
          resolution.table,
          resolution.primaryKey,
          pkColumns,
          conflictRow,
          resolution.rowDefaultPick,
          resolution.columns ?? {}
        );
      }
    }

    for (const table of affectedTables) {
      await db.execute(sql.raw(`SELECT DOLT_CONFLICTS_RESOLVE('--ours', '${table}')`));
    }
  };

async function readConflictRow(
  db: AgentsManageDatabaseClient,
  table: string,
  primaryKey: Record<string, string>,
  pkColumns: string[]
): Promise<Record<string, unknown> | null> {
  const whereClause = pkColumns
    .map((col) => {
      const val = primaryKey[col];
      if (val === undefined) {
        throw new Error(`Missing PK column ${col} for table ${table}`);
      }
      return `base_${col} = '${val.replace(/'/g, "''")}'`;
    })
    .join(' AND ');

  const result = await db.execute(
    sql.raw(`SELECT * FROM dolt_conflicts_${table} WHERE ${whereClause} LIMIT 1`)
  );

  return (result.rows[0] as Record<string, unknown>) ?? null;
}

function getColumnNames(conflictRow: Record<string, unknown>, pkColumns: string[]): string[] {
  const theirPrefix = 'their_';
  const skipColumns = new Set([
    'our_diff_type',
    'their_diff_type',
    'base_diff_type',
    ...pkColumns.map((c) => `base_${c}`),
    ...pkColumns.map((c) => `our_${c}`),
    ...pkColumns.map((c) => `their_${c}`),
  ]);

  const columns: string[] = [];
  for (const key of Object.keys(conflictRow)) {
    if (key.startsWith(theirPrefix) && !skipColumns.has(key)) {
      columns.push(key.slice(theirPrefix.length));
    }
  }
  return columns;
}

async function applyTheirsResolution(
  db: AgentsManageDatabaseClient,
  table: string,
  primaryKey: Record<string, string>,
  pkColumns: string[],
  conflictRow: Record<string, unknown>,
  ourDiffType: string,
  theirDiffType: string
): Promise<void> {
  const pkWhere = pkColumns
    .map((col) => {
      const val = primaryKey[col]?.replace(/'/g, "''");
      return `"${col}" = '${val}'`;
    })
    .join(' AND ');

  if (theirDiffType === 'removed') {
    await db.execute(sql.raw(`DELETE FROM "${table}" WHERE ${pkWhere}`));
    return;
  }

  const columns = getColumnNames(conflictRow, pkColumns);

  if (ourDiffType === 'removed') {
    const allCols = [...pkColumns, ...columns];
    const values = allCols.map((col) => {
      const val = pkColumns.includes(col) ? primaryKey[col] : conflictRow[`their_${col}`];
      return val === null || val === undefined ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`;
    });
    await db.execute(
      sql.raw(
        `INSERT INTO "${table}" (${allCols.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')})`
      )
    );
    return;
  }

  const setClauses = columns.map((col) => {
    const val = conflictRow[`their_${col}`];
    return val === null || val === undefined
      ? `"${col}" = NULL`
      : `"${col}" = '${String(val).replace(/'/g, "''")}'`;
  });

  await db.execute(sql.raw(`UPDATE "${table}" SET ${setClauses.join(', ')} WHERE ${pkWhere}`));
}

async function applyMixedResolution(
  db: AgentsManageDatabaseClient,
  table: string,
  primaryKey: Record<string, string>,
  pkColumns: string[],
  conflictRow: Record<string, unknown>,
  rowDefaultPick: 'ours' | 'theirs',
  columnOverrides: Record<string, 'ours' | 'theirs'>
): Promise<void> {
  const columns = getColumnNames(conflictRow, pkColumns);

  const pkWhere = pkColumns
    .map((col) => {
      const val = primaryKey[col]?.replace(/'/g, "''");
      return `"${col}" = '${val}'`;
    })
    .join(' AND ');

  const setClauses = columns.map((col) => {
    const pick = columnOverrides[col] ?? rowDefaultPick;
    const prefix = pick === 'theirs' ? 'their_' : 'our_';
    const val = conflictRow[`${prefix}${col}`];
    return val === null || val === undefined
      ? `"${col}" = NULL`
      : `"${col}" = '${String(val).replace(/'/g, "''")}'`;
  });

  await db.execute(sql.raw(`UPDATE "${table}" SET ${setClauses.join(', ')} WHERE ${pkWhere}`));
}
