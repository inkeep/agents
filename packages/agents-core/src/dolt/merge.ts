import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import { getLogger } from '../utils/logger';
import type { ConflictResolution } from '../validation/dolt-schemas';
import { doltCheckout } from './branch';
import { doltAddAndCommit } from './commit';
import { applyResolutions } from './resolve-conflicts';

const logger = getLogger('dolt-merge');

export class MergeConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictCount: number,
    public readonly fromBranch: string,
    public readonly toBranch: string
  ) {
    super(message);
    this.name = 'MergeConflictError';
  }
}

function extractConflictCount(row: Record<string, unknown>): number {
  if (typeof row.conflicts === 'number' || typeof row.conflicts === 'string') {
    return Number(row.conflicts);
  }

  const doltMerge = row.dolt_merge;

  // Doltgres returns an array: [hash, fast_forward, conflicts, message]
  if (Array.isArray(doltMerge)) {
    return Number(doltMerge[2] ?? 0);
  }

  throw new Error(`Unexpected DOLT_MERGE result format: ${JSON.stringify(row)}`);
}

/**
 * Merge a branch into the currently checked out branch.
 *
 * Runs inside an explicit transaction so that conflicts and
 * constraint-violations are surfaced to the caller instead of being
 * auto-rolled-back by Dolt's AUTOCOMMIT mode.
 *
 * If conflicts arise and `resolutions` are provided, they are applied
 * and the merge is committed. If conflicts arise without resolutions
 * (or with insufficient resolutions), the transaction is rolled back
 * and a `MergeConflictError` is thrown.
 */
export const doltMerge =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    fromBranch: string;
    toBranch: string;
    message?: string;
    noFastForward?: boolean;
    author?: { name: string; email: string };
    resolutions?: ConflictResolution[];
  }): Promise<{
    status: 'success';
    from: string;
    to: string;
    toHead?: string;
    hasConflicts: boolean;
  }> => {
    logger.info({ fromBranch: params.fromBranch, toBranch: params.toBranch }, 'Merging branch');

    await doltCheckout(db)({ branch: params.toBranch });

    const headResult = await db.execute(sql`SELECT HASHOF('HEAD') as hash`);
    const toHead = headResult.rows[0]?.hash as string;

    const args: string[] = [`'${params.fromBranch}'`];

    if (params.noFastForward) {
      args.push("'--no-ff'");
    }

    if (params.message) {
      args.push("'-m'", `'${params.message.replace(/'/g, "''")}'`);
    }

    if (params.author) {
      args.push("'--author'", `'${params.author.name} <${params.author.email}>'`);
    }

    await db.execute(sql.raw('START TRANSACTION'));

    let txFinalized = false;
    try {
      let result: any;
      try {
        result = await db.execute(sql.raw(`SELECT DOLT_MERGE(${args.join(', ')})`));
        logger.info({ result }, 'DOLT_MERGE result');
      } catch (error: any) {
        const cause = error?.cause;
        logger.error(
          {
            message: error?.message,
            code: cause?.code,
            severity: cause?.severity,
            detail: cause?.detail,
            hint: cause?.hint,
            query: error?.query,
            fromBranch: params.fromBranch,
            toBranch: params.toBranch,
          },
          'Error merging branch'
        );
        throw error;
      }

      const firstRow = (result.rows[0] ?? {}) as Record<string, unknown>;
      const conflicts = extractConflictCount(firstRow);
      const hasConflicts = Number.isFinite(conflicts) && conflicts > 0;

      if (hasConflicts) {
        const { resolutions } = params;

        if (!resolutions || resolutions.length === 0) {
          throw new MergeConflictError(
            'Merge has conflicts but no resolutions were provided.',
            conflicts,
            params.fromBranch,
            params.toBranch
          );
        }

        const conflictTables = await doltConflicts(db)();
        let totalConflicts = 0;
        for (const ct of conflictTables) {
          const tableConflicts = await doltTableConflicts(db)({ tableName: ct.table });
          totalConflicts += tableConflicts.length;
        }

        if (resolutions.length < totalConflicts) {
          throw new MergeConflictError(
            `Resolutions provided (${resolutions.length}) do not cover all conflicts (${totalConflicts}). All conflicts must be resolved.`,
            totalConflicts,
            params.fromBranch,
            params.toBranch
          );
        }

        await applyResolutions(db)(resolutions);
        await doltAddAndCommit(db)({
          message: params.message
            ? `${params.message} (with conflict resolution)`
            : `Merge ${params.fromBranch} into ${params.toBranch} (with conflict resolution)`,
          author: params.author,
        });
        txFinalized = true;

        return {
          status: 'success',
          from: params.fromBranch,
          to: params.toBranch,
          toHead,
          hasConflicts: true,
        };
      }

      await db.execute(sql.raw('COMMIT'));
      txFinalized = true;

      return {
        status: 'success',
        from: params.fromBranch,
        to: params.toBranch,
        toHead,
        hasConflicts: false,
      };
    } finally {
      if (!txFinalized) {
        try {
          await db.execute(sql.raw('ROLLBACK'));
        } catch (rollbackError) {
          logger.error({ error: rollbackError }, 'Failed to rollback transaction');
        }
      }
    }
  };

/**
 * Abort a merge
 */
export const doltAbortMerge = (db: AgentsManageDatabaseClient) => async (): Promise<void> => {
  await db.execute(sql.raw(`SELECT DOLT_MERGE('--abort')`));
};

/**
 * Get merge status
 */
export const doltMergeStatus =
  (db: AgentsManageDatabaseClient) =>
  async (): Promise<{
    isMerging: boolean;
    source?: string;
    target?: string;
    unmergedTables?: string[];
  }> => {
    const result = await db.execute(sql`SELECT * FROM DOLT_MERGE_STATUS`);
    const status = result.rows[0] as any;

    if (!status || !status.is_merging) {
      return { isMerging: false };
    }

    return {
      isMerging: status.is_merging,
      source: status.source,
      target: status.target,
      unmergedTables: status.unmerged_tables ? status.unmerged_tables.split(',') : [],
    };
  };

/**
 * Get list of tables with conflicts
 */
export const doltConflicts =
  (db: AgentsManageDatabaseClient) =>
  async (): Promise<{ table: string; numConflicts: number }[]> => {
    const result = await db.execute(sql`SELECT * FROM dolt_conflicts`);
    return result.rows as any[];
  };

/**
 * Get detailed conflicts for a specific table
 */
export const doltTableConflicts =
  (db: AgentsManageDatabaseClient) =>
  async (params: { tableName: string }): Promise<any[]> => {
    const result = await db.execute(sql.raw(`SELECT * FROM dolt_conflicts_${params.tableName}`));
    return result.rows as any[];
  };

/**
 * Get schema conflicts
 */
export const doltSchemaConflicts = (db: AgentsManageDatabaseClient) => async (): Promise<any[]> => {
  const result = await db.execute(sql`SELECT * FROM dolt_schema_conflicts`);
  return result.rows as any[];
};

/**
 * Preview merge conflicts without modifying the database (dry-run).
 * Returns a summary of which tables have conflicts.
 */
export const doltPreviewMergeConflictsSummary =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    baseBranch: string;
    mergeBranch: string;
  }): Promise<{ table: string; numDataConflicts: number; numSchemaConflicts: number }[]> => {
    const result = await db.execute(
      sql.raw(
        `SELECT * FROM DOLT_PREVIEW_MERGE_CONFLICTS_SUMMARY('${params.baseBranch}', '${params.mergeBranch}')`
      )
    );
    return (result.rows as any[]).map((row) => ({
      table: row.table.replace('public.', ''),
      numDataConflicts: Number(row.num_data_conflicts ?? 0),
      numSchemaConflicts: Number(row.num_schema_conflicts ?? 0),
    }));
  };

/**
 * Preview detailed merge conflicts for a specific table without modifying the database (dry-run).
 * Returns the same column shape as dolt_conflicts_$table.
 */
export const doltPreviewMergeConflicts =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    baseBranch: string;
    mergeBranch: string;
    tableName: string;
  }): Promise<Record<string, unknown>[]> => {
    const result = await db.execute(
      sql.raw(
        `SELECT * FROM DOLT_PREVIEW_MERGE_CONFLICTS('${params.baseBranch}', '${params.mergeBranch}', '${params.tableName}')`
      )
    );
    return result.rows as Record<string, unknown>[];
  };

/**
 * Resolve conflicts for a table using a strategy
 */
export const doltResolveConflicts =
  (db: AgentsManageDatabaseClient) =>
  async (params: { tableName: string; strategy: 'ours' | 'theirs' }): Promise<void> => {
    await db.execute(sql`SET dolt_allow_commit_conflicts = 1`);
    await db.execute(
      sql.raw(`SELECT DOLT_CONFLICTS_RESOLVE('--${params.strategy}', '${params.tableName}')`)
    );
  };
