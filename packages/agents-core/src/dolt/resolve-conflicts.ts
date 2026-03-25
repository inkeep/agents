import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import type { ConflictResolution } from '../validation/dolt-schemas';
import { type FkDeps, manageFkDeps } from './fk-map';
import { isValidManageTable, managePkMap } from './pk-map';

export class ResolutionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionValidationError';
  }
}

function toSqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

type OperationType = 'skip' | 'delete' | 'update' | 'insert';

interface ClassifiedResolution {
  resolution: ConflictResolution;
  conflictRow: Record<string, unknown>;
  pkColumns: string[];
  operation: OperationType;
}

function classifyOperation(
  conflictRow: Record<string, unknown>,
  rowDefaultPick: 'ours' | 'theirs',
  hasColumnOverrides: boolean
): OperationType {
  const ourDiffType = conflictRow.our_diff_type as string;
  const theirDiffType = conflictRow.their_diff_type as string;

  if (rowDefaultPick === 'theirs' && !hasColumnOverrides) {
    if (theirDiffType === 'removed') return 'delete';
    if (ourDiffType === 'removed') return 'insert';
    return 'update';
  }

  if (theirDiffType === 'removed' || ourDiffType === 'removed') {
    if (rowDefaultPick === 'ours') return 'skip';
    if (theirDiffType === 'removed') return 'delete';
    if (ourDiffType === 'removed') return 'insert';
  }

  return 'update';
}

export function computeTableInsertOrder(fkDeps: FkDeps): Map<string, number> {
  const order = new Map<string, number>();
  const visited = new Set<string>();
  let counter = 0;

  function visit(table: string) {
    if (visited.has(table)) return;
    visited.add(table);
    for (const dep of fkDeps[table] ?? []) {
      visit(dep);
    }
    order.set(table, counter++);
  }

  for (const table of Object.keys(fkDeps)) {
    visit(table);
  }

  return order;
}

const PHASE_ORDER: Record<OperationType, number> = {
  delete: 0,
  update: 1,
  insert: 2,
  skip: 3,
};

const tableOrder = computeTableInsertOrder(manageFkDeps);

export function sortByFkDependencyOrder(
  classified: ClassifiedResolution[]
): ClassifiedResolution[] {
  return [...classified].sort((a, b) => {
    const phaseA = PHASE_ORDER[a.operation];
    const phaseB = PHASE_ORDER[b.operation];
    if (phaseA !== phaseB) return phaseA - phaseB;

    const orderA = tableOrder.get(a.resolution.table) ?? 0;
    const orderB = tableOrder.get(b.resolution.table) ?? 0;

    if (a.operation === 'delete') return orderB - orderA;
    if (a.operation === 'insert') return orderA - orderB;
    return 0;
  });
}

export const applyResolutions =
  (db: AgentsManageDatabaseClient) =>
  async (resolutions: ConflictResolution[]): Promise<void> => {
    const affectedTables = new Set<string>();
    const classified: ClassifiedResolution[] = [];

    for (const resolution of resolutions) {
      if (!isValidManageTable(resolution.table)) {
        throw new ResolutionValidationError(`Invalid table name: ${resolution.table}`);
      }
      affectedTables.add(resolution.table);

      const pkColumns = managePkMap[resolution.table];
      if (!pkColumns) {
        throw new ResolutionValidationError(`No PK columns found for table: ${resolution.table}`);
      }

      const hasColumnOverrides = resolution.columns && Object.keys(resolution.columns).length > 0;

      if (resolution.rowDefaultPick === 'ours' && !hasColumnOverrides) {
        classified.push({ resolution, conflictRow: {}, pkColumns, operation: 'skip' });
        continue;
      }

      const conflictRow = await readConflictRow(
        db,
        resolution.table,
        resolution.primaryKey,
        pkColumns
      );

      if (!conflictRow) {
        throw new ResolutionValidationError(
          `No conflict found for table ${resolution.table} with PK ${JSON.stringify(resolution.primaryKey)}`
        );
      }

      if (hasColumnOverrides) {
        const ourDiffType = conflictRow.our_diff_type as string;
        const theirDiffType = conflictRow.their_diff_type as string;
        const hasEffectiveOverrides = Object.values(resolution.columns ?? {}).some(
          (pick) => pick !== resolution.rowDefaultPick
        );
        if (hasEffectiveOverrides && (ourDiffType === 'removed' || theirDiffType === 'removed')) {
          const removedSide = ourDiffType === 'removed' ? 'ours' : 'theirs';
          throw new ResolutionValidationError(
            `Cannot apply column overrides for table ${resolution.table} ` +
              `(PK ${JSON.stringify(resolution.primaryKey)}): ` +
              `${removedSide} side deleted the row`
          );
        }
      }

      const operation = classifyOperation(
        conflictRow,
        resolution.rowDefaultPick,
        hasColumnOverrides ?? false
      );
      classified.push({ resolution, conflictRow, pkColumns, operation });
    }

    const sorted = sortByFkDependencyOrder(classified);

    for (const { resolution, conflictRow, pkColumns, operation } of sorted) {
      if (operation === 'skip') continue;

      const pkWhere = buildPkWhere(pkColumns, resolution.primaryKey);

      switch (operation) {
        case 'delete': {
          await db.execute(sql.raw(`DELETE FROM "${resolution.table}" WHERE ${pkWhere}`));
          break;
        }

        case 'insert': {
          const columns = getColumnNames(conflictRow, pkColumns);
          const allCols = [...pkColumns, ...columns];
          const values = allCols.map((col) => {
            const val = pkColumns.includes(col)
              ? resolution.primaryKey[col]
              : conflictRow[`their_${col}`];
            return toSqlLiteral(val);
          });
          await db.execute(
            sql.raw(
              `INSERT INTO "${resolution.table}" (${allCols.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')})`
            )
          );
          break;
        }

        case 'update': {
          const columns = getColumnNames(conflictRow, pkColumns);
          const setClauses = columns.map((col) => {
            const pick = resolution.columns?.[col] ?? resolution.rowDefaultPick;
            const prefix = pick === 'theirs' ? 'their_' : 'our_';
            return `"${col}" = ${toSqlLiteral(conflictRow[`${prefix}${col}`])}`;
          });
          await db.execute(
            sql.raw(`UPDATE "${resolution.table}" SET ${setClauses.join(', ')} WHERE ${pkWhere}`)
          );
          break;
        }
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
        throw new ResolutionValidationError(`Missing PK column ${col} for table ${table}`);
      }
      const escapedVal = val.replace(/'/g, "''");
      return `(base_${col} = '${escapedVal}' OR (base_${col} IS NULL AND (our_${col} = '${escapedVal}' OR their_${col} = '${escapedVal}')))`;
    })
    .join(' AND ');

  const result = await db.execute(
    sql.raw(`SELECT * FROM dolt_conflicts_${table} WHERE ${whereClause} LIMIT 1`)
  );

  return (result.rows[0] as Record<string, unknown>) ?? null;
}

function buildPkWhere(pkColumns: string[], primaryKey: Record<string, string>): string {
  return pkColumns
    .map((col) => {
      const val = primaryKey[col]?.replace(/'/g, "''");
      return `"${col}" = '${val}'`;
    })
    .join(' AND ');
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
