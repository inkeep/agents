import { and, eq, getTableColumns } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { doltCheckout } from '../../dolt/branch';
import { doltAddAndCommit } from '../../dolt/commit';
import { managePkMap, manageTableMap } from '../../dolt/pk-map';

export type RevertDiffType = 'added' | 'modified' | 'removed';

export interface RevertRowInput {
  table: string;
  primaryKey: Record<string, string>;
  diffType: RevertDiffType;
}

export interface RevertImprovementRowsResult {
  processedRows: number;
  committed: boolean;
}

function buildPrimaryKeyWhere(
  tableObj: Parameters<typeof getTableColumns>[0],
  tableName: string,
  pk: Record<string, string>
) {
  const pkColumns = managePkMap[tableName];
  if (!pkColumns || pkColumns.length === 0) {
    throw new Error(`No primary key known for table: ${tableName}`);
  }

  const allowed = new Set(pkColumns);
  const provided = Object.keys(pk);

  if (provided.length !== pkColumns.length || provided.some((k) => !allowed.has(k))) {
    throw new Error(
      `Invalid primary key for table ${tableName}: expected keys [${pkColumns.join(', ')}]`
    );
  }

  const columns = getTableColumns(tableObj);
  const colByDbName = new Map(Object.values(columns).map((c) => [c.name, c]));
  const conditions = pkColumns.map((dbName) => {
    const col = colByDbName.get(dbName);
    if (!col) throw new Error(`Column ${dbName} not found on table ${tableName}`);
    return eq(col, pk[dbName]);
  });

  const combined = and(...conditions);
  if (!combined) {
    throw new Error(`Failed to build where clause for ${tableName}`);
  }
  return combined;
}

/**
 * Revert the specified rows on an improvement branch to their baseline values
 * from the target branch. Added rows are deleted, modified rows are reset to
 * their target-branch values, and removed rows are re-inserted. The reverts
 * are then committed on the improvement branch.
 *
 * Leaves the improvement (source) branch checked out on return.
 */
export const revertImprovementRows =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    sourceBranchFullName: string;
    targetBranchFullName: string;
    rows: RevertRowInput[];
    commitMessage: string;
  }): Promise<RevertImprovementRowsResult> => {
    const { sourceBranchFullName, targetBranchFullName, rows, commitMessage } = params;

    if (rows.length === 0) {
      return { processedRows: 0, committed: false };
    }

    const rowsNeedingBaseline = rows.filter(
      (r) => r.diffType === 'modified' || r.diffType === 'removed'
    );
    const baselineData = new Map<string, Record<string, unknown>>();

    if (rowsNeedingBaseline.length > 0) {
      await doltCheckout(db)({ branch: targetBranchFullName });
      for (const row of rowsNeedingBaseline) {
        const table = row.table.replace(/^public\./, '');
        const tableObj = manageTableMap[table];
        if (!tableObj) continue;

        const whereCondition = buildPrimaryKeyWhere(tableObj, table, row.primaryKey);
        const [baselineRow] = await db.select().from(tableObj).where(whereCondition).limit(1);
        if (baselineRow) {
          baselineData.set(`${row.table}:${JSON.stringify(row.primaryKey)}`, baselineRow);
        }
      }
    }

    await doltCheckout(db)({ branch: sourceBranchFullName });

    for (const row of rows) {
      const table = row.table.replace(/^public\./, '');
      const tableObj = manageTableMap[table];
      if (!tableObj) continue;

      const whereCondition = buildPrimaryKeyWhere(tableObj, table, row.primaryKey);

      if (row.diffType === 'added') {
        await db.delete(tableObj).where(whereCondition);
      } else if (row.diffType === 'modified') {
        const baselineRow = baselineData.get(`${row.table}:${JSON.stringify(row.primaryKey)}`);
        if (baselineRow) {
          const pkCols = new Set(managePkMap[table] ?? []);
          const columns = getTableColumns(tableObj) as Record<string, { name: string }>;
          const setData: Record<string, unknown> = {};
          for (const [prop, col] of Object.entries(columns)) {
            if (!pkCols.has(col.name)) {
              setData[prop] = baselineRow[prop as keyof typeof baselineRow];
            }
          }
          await db.update(tableObj).set(setData).where(whereCondition);
        }
      } else if (row.diffType === 'removed') {
        const baselineRow = baselineData.get(`${row.table}:${JSON.stringify(row.primaryKey)}`);
        if (baselineRow) {
          await db.insert(tableObj).values(baselineRow);
        }
      }
    }

    let committed = true;
    try {
      await doltAddAndCommit(db)({ message: commitMessage });
    } catch {
      committed = false;
    }

    return { processedRows: rows.length, committed };
  };
