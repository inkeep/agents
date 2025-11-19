import { sql } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { doltListBranches } from './branch';
/**
 * Stage all changes for commit
 * params: { tables?: string[] }
 * tables: array of table names to stage
 * if no tables are specified, all changes are staged
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
 * params: { message: string; author?: { name: string; email: string } }
 * message: commit message
 * author: commit author
 * author is optional, if not provided, the commit will be committed with the default author
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

    await db.execute(sql.raw(`CALL DOLT_COMMIT(${args.join(', ')})`));
    return 'Commit successful';
  };

export const doltAddAndCommit =
  (db: DatabaseClient) =>
  async (params: {
    message: string;
    author?: { name: string; email: string };
  }): Promise<string> => {
    await doltAdd(db)({});
    return doltCommit(db)(params);
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
    // If it's already a commit hash (base32 encoding: 0-9 and a-v, 32 chars), return it directly
    if (/^[0-9a-v]{32}$/.test(params.revision)) {
      return params.revision;
    }

    // Check if the revision is a branch name
    const branches = await doltListBranches(db)();
    const isBranch = branches.some((b) => b.name === params.revision);

    if (isBranch) {
      // For branches, use DOLT_LOG to get the HEAD commit hash
      const logResult = await db.execute(
        sql.raw(`SELECT commit_hash FROM DOLT_LOG('${params.revision}') LIMIT 1`)
      );
      const commitHash = logResult.rows[0]?.commit_hash as string;
      if (!commitHash) {
        throw new Error(`Could not find commit hash for branch '${params.revision}'`);
      }
      return commitHash;
    }

    // Check if the revision is a tag name
    const tags = await doltListTags(db)();
    const tag = tags.find((t) => t.tag_name === params.revision);
    if (tag) {
      // For tags, return the tag's commit hash directly
      return tag.tag_hash;
    }

    // For other revisions (commits, etc.), use DOLT_HASHOF
    const result = await db.execute(sql.raw(`SELECT DOLT_HASHOF('${params.revision}') as hash`));
    const hash = result.rows[0]?.hash as string;
    if (!hash) {
      throw new Error(`Could not find commit hash for revision '${params.revision}'`);
    }
    return hash;
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

// export const createCommitMessage =
