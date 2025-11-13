import type { DatabaseClient } from '../db/client';
import { sql } from 'drizzle-orm';
import { doltListBranches } from './branch';
import { doltListTags, doltHashOf } from './commit';

export type RefType = 'commit' | 'tag' | 'branch';

export type ResolvedRef = {
  type: RefType;
  name: string;
  hash: string;
};

export const isValidCommitHash = (ref: string): boolean => {
  // Dolt uses base32 encoding for commit hashes (characters 0-9 and a-v)
  return /^[0-9a-v]{32}$/.test(ref);
};

export const resolveRef =
  (db: DatabaseClient) =>
  async (ref: string): Promise<ResolvedRef | null> => {
    if (isValidCommitHash(ref)) {
      return {
        type: 'commit',
        name: ref,
        hash: ref,
      };
    }

    const tags = await doltListTags(db)();
    const tag = tags.find((t) => t.tag_name === ref);
    if (tag) {
      return {
        type: 'tag',
        name: ref,
        hash: tag.tag_hash,
      };
    }

    const branches = await doltListBranches(db)();
    const branch = branches.find((b) => b.name === ref);
    if (branch) {
      return {
        type: 'branch',
        name: ref,
        hash: branch.hash,
      };
    }

    return null;
  };

export const isRefWritable = (resolvedRef: ResolvedRef): boolean => {
  return resolvedRef.type === 'branch';
};

export const checkoutRef =
  (db: DatabaseClient) =>
  async (resolvedRef: ResolvedRef): Promise<void> => {
    if (resolvedRef.type === 'branch') {
      await db.execute(sql.raw(`CALL DOLT_CHECKOUT('${resolvedRef.name}')`));
    } else {
      await db.execute(sql.raw(`CALL DOLT_CHECKOUT('${resolvedRef.hash}')`));
    }
  };

export const getCurrentBranchOrCommit =
  (db: DatabaseClient) =>
  async (): Promise<{ ref: string; hash: string; type: RefType }> => {
    const branchResult = await db.execute(sql`SELECT ACTIVE_BRANCH() as branch`);
    const branch = branchResult.rows[0]?.branch as string;

    if (branch) {
      const hash = await doltHashOf(db)({ revision: branch });
      return {
        ref: branch,
        hash,
        type: 'branch',
      };
    }

    const hashResult = await db.execute(
      sql`SELECT DOLT_HASHOF('HEAD') as hash`
    );
    const hash = hashResult.rows[0]?.hash as string;

    return {
      ref: hash,
      hash,
      type: 'commit',
    };
  };
