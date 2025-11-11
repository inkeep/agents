import type { DatabaseClient } from '../db/client';
import { sql } from 'drizzle-orm';

/**
 * Get diff between two commits/branches
 */
export const doltDiff =
  (db: DatabaseClient) =>
  async (params: {
    fromRevision: string;
    toRevision: string;
    tableName: string;
  }): Promise<any[]> => {
    const result = await db.execute(
      sql.raw(
        `SELECT * FROM DOLT_DIFF('${params.fromRevision}', '${params.toRevision}', '${params.tableName}')`
      )
    );
    return result.rows as any[];
  };

/**
 * Get diff summary between two commits/branches
 */
export const doltDiffSummary =
  (db: DatabaseClient) =>
  async (params: {
    fromRevision: string;
    toRevision: string;
    tableName?: string;
  }): Promise<
    {
      table_name: string;
      diff_type: string;
      data_change: boolean;
      schema_change: boolean;
    }[]
  > => {
    let query: any;
    if (params.tableName) {
      query = sql.raw(
        `SELECT * FROM DOLT_DIFF_SUMMARY('${params.fromRevision}', '${params.toRevision}', '${params.tableName}')`
      );
    } else {
      query = sql.raw(
        `SELECT * FROM DOLT_DIFF_SUMMARY('${params.fromRevision}', '${params.toRevision}')`
      );
    }

    const result = await db.execute(query);
    return result.rows as any[];
  };