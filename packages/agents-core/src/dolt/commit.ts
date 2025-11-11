import type { DatabaseClient } from '../db/client';
import { sql } from 'drizzle-orm';
/**
 * Stage all changes for commit
 */
export const doltAdd =
  (db: DatabaseClient) =>
  async (params: { tables?: string[] } = {}): Promise<void> => {
    if (!params.tables || params.tables.length === 0) {
      // Stage all changes
      await db.execute(sql`CALL DOLT_ADD('-A')`);
    } else {
      // Stage specific tables
      const tableParams = params.tables.map((t) => `'${t}'`).join(', ');
      console.log(tableParams);
      await db.execute(sql.raw(`CALL DOLT_ADD(${tableParams})`));
    }
  };

/**
 * Commit staged changes
 */
export const doltCommit =
  (db: DatabaseClient) =>
  async (params: {
    message: string;

    author?: { name: string; email: string };
  }): Promise<string> => {
    const args: string[] = [];

    args.push("'-a'");

    console.log('message', params.message.replace(/'/g, "''"));
    args.push("'-m'", `'${params.message.replace(/'/g, "''")}'`);

    if (params.author) {
      args.push("'--author'", `'${params.author.name} <${params.author.email}>'`);
    }

    const result = await db.execute(sql.raw(`CALL DOLT_COMMIT(${args.join(', ')})`));
    return 'Commit successful';
  };


/**
 * Get commit log
 */
export const doltLog =
(db: DatabaseClient) =>
async (params?: {
  revision?: string;
  limit?: number;
}): Promise<
  {
    commit_hash: string;
    committer: string;
    email: string;
    date: Date;
    message: string;
  }[]
> => {
  let query = sql`SELECT * FROM DOLT_LOG()`;

  if (params?.revision) {
    query = sql.raw(`SELECT * FROM DOLT_LOG('${params.revision}')`);
  }

  const result = await db.execute(query);
  let rows = result.rows as any[];

  if (params?.limit) {
    rows = rows.slice(0, params.limit);
  }

  return rows;
};


/**
 * Reset staged or working changes
 */
export const doltReset =
  (db: DatabaseClient) =>
  async (params?: { hard?: boolean; tables?: string[] }): Promise<void> => {
    if (params?.hard) {
      await db.execute(sql`CALL DOLT_RESET('--hard')`);
    } else if (params?.tables && params.tables.length > 0) {
      const tableParams = params.tables.map((t) => `'${t}'`).join(', ');
      await db.execute(sql.raw(`CALL DOLT_RESET(${tableParams})`));
    } else {
      await db.execute(sql`CALL DOLT_RESET()`);
    }
  };

/**
 * Get status of working changes
 */
export const doltStatus =
  (db: DatabaseClient) =>
  async (): Promise<
    {
      table_name: string;
      staged: boolean;
      status: string;
    }[]
  > => {
    const result = await db.execute(sql`SELECT * FROM dolt_status`);
    return result.rows as any[];
  };


/**
 * Get hash of a commit/branch
 */
export const doltHashOf =
(db: DatabaseClient) =>
async (params: { revision: string }): Promise<string> => {
  const result = await db.execute(sql.raw(`SELECT DOLT_HASHOF('${params.revision}') as hash`));
  return result.rows[0]?.hash as string;
};

/**
* Create a tag
*/
export const doltTag =
(db: DatabaseClient) =>
async (params: { name: string; message?: string; revision?: string }): Promise<void> => {
  const args: string[] = [`'${params.name}'`];

  if (params.message) {
    args.push("'-m'", `'${params.message.replace(/'/g, "''")}'`);
  }

  if (params.revision) {
    args.push(`'${params.revision}'`);
  }

  await db.execute(sql.raw(`CALL DOLT_TAG(${args.join(', ')})`));
};

/**
* Delete a tag
*/
export const doltDeleteTag =
(db: DatabaseClient) =>
async (params: { name: string }): Promise<void> => {
  await db.execute(sql.raw(`CALL DOLT_TAG('-d', '${params.name}')`));
};

/**
* List all tags
*/
export const doltListTags =
(db: DatabaseClient) =>
async (): Promise<
  { tag_name: string; tag_hash: string; tagger: string; date: Date; message: string }[]
> => {
  const result = await db.execute(sql`SELECT * FROM dolt_tags`);
  return result.rows as any[];
};