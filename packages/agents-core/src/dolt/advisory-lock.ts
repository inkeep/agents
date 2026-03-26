import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';

function computeLockKey(prefix: string, identifier: string): bigint {
  const digest = createHash('sha256').update(`${prefix}${identifier}`).digest();
  return digest.readBigInt64BE(0);
}

export const tryAdvisoryLock =
  (db: AgentsManageDatabaseClient) =>
  async (prefix: string, identifier: string): Promise<boolean> => {
    const key = computeLockKey(prefix, identifier);
    const result = await db.execute(
      sql`SELECT pg_try_advisory_lock(CAST(${key} AS bigint)) as acquired`
    );
    return result.rows[0]?.acquired === true;
  };

export const releaseAdvisoryLock =
  (db: AgentsManageDatabaseClient) =>
  async (prefix: string, identifier: string): Promise<void> => {
    const key = computeLockKey(prefix, identifier);
    await db.execute(sql`SELECT pg_advisory_unlock(CAST(${key} AS bigint))`);
  };
