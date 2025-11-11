import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema';
import type { DatabaseClient } from './client';
import type { ResolvedRef } from '../dolt/ref';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';

function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

export async function withRefConnection<T>(
  db: DatabaseClient,
  resolvedRef: ResolvedRef,
  fn: (db: DatabaseClient) => Promise<T>
): Promise<T> {
  let tempBranch: string | null = null;
  try {
    if (resolvedRef.type === 'branch') {
      await db.execute(sql.raw(`SELECT DOLT_CHECKOUT('${escapeSqlString(resolvedRef.name)}')`));
    } else {
      const date = new Date();
      const timestamp = date
        .toISOString()
        .replace(/[-:T.]/g, '')
        .slice(0, 14);
      tempBranch = `temp_${resolvedRef.type}_${resolvedRef.hash}_${timestamp}`;
      await db.execute(
        sql.raw(
          `SELECT DOLT_CHECKOUT('-b', '${escapeSqlString(tempBranch)}', '${escapeSqlString(resolvedRef.hash)}')`
        )
      );
    }

    const result = await fn(db);

    return result;
  } finally {
    try {
      await db.execute(sql.raw(`SELECT DOLT_CHECKOUT('main')`));

      if (tempBranch) {
        await db.execute(sql.raw(`SELECT DOLT_BRANCH('-D', '${escapeSqlString(tempBranch)}')`));
      }
    } catch (cleanupError) {
      console.error('Error cleaning up ref connection:', cleanupError);
    }

  }
}

export function getPoolFromClient(client: DatabaseClient): Pool | null {
  if ('$client' in client && client.$client) {
    const pgClient = client.$client as any;
    if (pgClient.pool) {
      return pgClient.pool as Pool;
    }
  }
  return null;
}
