import type { DatabaseClient } from '../db/client';
import { doltCheckout } from './branch';
import { sql } from 'drizzle-orm';
/**
 * Merge another branch into the current branch
 * Returns merge status and handles conflicts by allowing commit with conflicts
 */
export const doltMerge =
  (db: DatabaseClient) =>
  async (params: {
    fromBranch: string;
    toBranch: string;
    message?: string;
    noFastForward?: boolean;
  }): Promise<{
    status: 'success' | 'conflicts';
    from: string;
    to: string;
    toHead?: string;
    hasConflicts: boolean;
  }> => {
    console.log('merging branch', params.fromBranch, 'into', params.toBranch);

    // Checkout target branch
    await doltCheckout(db)({ branch: params.toBranch });

    // Get current HEAD hash before merge
    const headResult = await db.execute(sql`SELECT HASHOF('HEAD') as hash`);
    const toHead = headResult.rows[0]?.hash as string;

    // Allow committing with conflicts (PostgreSQL syntax for session variable)
    await db.execute(sql`SET dolt_allow_commit_conflicts = 1`);

    // Perform merge
    const args: string[] = [`'${params.fromBranch}'`];

    if (params.noFastForward) {
      args.push("'--no-ff'");
    }

    if (params.message) {
      args.push("'-m'", `'${params.message.replace(/'/g, "''")}'`);
    }

    await db.execute(sql.raw(`CALL DOLT_MERGE(${args.join(', ')})`));

    // Check for conflicts
    const conflictsResult = await db.execute(sql`SELECT COUNT(*) as count FROM dolt_conflicts`);
    const hasConflicts = (conflictsResult.rows[0]?.count as number) > 0;

    if (hasConflicts) {
      return {
        status: 'conflicts',
        from: params.fromBranch,
        to: params.toBranch,
        toHead,
        hasConflicts: true,
      };
    }

    return {
      status: 'success',
      from: params.fromBranch,
      to: params.toBranch,
      toHead,
      hasConflicts: false,
    };
  };

/**
 * Get merge status
 */
export const doltMergeStatus =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) => async (): Promise<{ table: string; numConflicts: number }[]> => {
    const result = await db.execute(sql`SELECT * FROM dolt_conflicts`);
    return result.rows as any[];
  };

/**
 * Get detailed conflicts for a specific table
 */
export const doltTableConflicts =
  (db: DatabaseClient) =>
  async (params: { tableName: string }): Promise<any[]> => {
    const result = await db.execute(sql.raw(`SELECT * FROM dolt_conflicts_${params.tableName}`));
    return result.rows as any[];
  };

/**
 * Get schema conflicts
 */
export const doltSchemaConflicts = (db: DatabaseClient) => async (): Promise<any[]> => {
  const result = await db.execute(sql`SELECT * FROM dolt_schema_conflicts`);
  return result.rows as any[];
};

/**
 * Resolve conflicts for a table using a strategy
 */
export const doltResolveConflicts =
  (db: DatabaseClient) =>
  async (params: { tableName: string; strategy: 'ours' | 'theirs' }): Promise<void> => {
    await db.execute(sql`SET dolt_allow_commit_conflicts = 1`); 
    await db.execute(
      sql.raw(`CALL DOLT_CONFLICTS_RESOLVE('--${params.strategy}', '${params.tableName}')`)
    );
  };
