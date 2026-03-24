import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import { getLogger } from '../utils/logger';
import type { ResolvedRef } from '../validation/dolt-schemas';
import { doltListBranches } from './branch';
import { checkoutBranch } from './branches-api';
import { doltHashOf, doltListTags } from './commit';

const logger = getLogger('ref-helpers');

export type RefType = 'commit' | 'tag' | 'branch';

export const isValidCommitHash = (ref: string): boolean => {
  // Dolt uses base32 encoding for commit hashes (characters 0-9 and a-v)
  return /^[0-9a-v]{32}$/.test(ref);
};

export const getProjectScopedRef = (tenantId: string, projectId: string, ref: string): string => {
  return `${tenantId}_${projectId}_${ref}`;
};

export const getTenantScopedRef = (tenantId: string, ref: string): string => {
  return `${tenantId}_${ref}`;
};
export const resolveRef =
  (db: AgentsManageDatabaseClient) =>
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
  (db: AgentsManageDatabaseClient) =>
  async (resolvedRef: ResolvedRef): Promise<void> => {
    if (resolvedRef.type === 'branch') {
      await checkoutBranch(db)({ branchName: resolvedRef.name });
    } else {
      await db.execute(sql.raw(`SELECT DOLT_CHECKOUT('${resolvedRef.hash}')`));
    }
  };

export const getCurrentBranchOrCommit =
  (db: AgentsManageDatabaseClient) =>
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

    const hashResult = await db.execute(sql`SELECT DOLT_HASHOF('HEAD') as hash`);
    const hash = hashResult.rows[0]?.hash as string;

    return {
      ref: hash,
      hash,
      type: 'commit',
    };
  };

export const getProjectMainResolvedRef =
  (db: AgentsManageDatabaseClient) =>
  async (tenantId: string, projectId: string): Promise<ResolvedRef> => {
    const projectMain = `${tenantId}_${projectId}_main`;
    const resolvedRef = await resolveRef(db)(projectMain);
    if (!resolvedRef) {
      throw new Error(`Project main branch not found: ${projectMain}`);
    }
    return resolvedRef;
  };

export const resolveProjectMainRefs =
  (db: AgentsManageDatabaseClient) =>
  async (
    tenantId: string,
    projectIds: string[]
  ): Promise<Array<{ projectId: string; ref: ResolvedRef }>> => {
    const results = await Promise.all(
      projectIds.map(async (projectId) => {
        const branchName = `${tenantId}_${projectId}_main`;
        const ref = await resolveRef(db)(branchName);
        if (!ref) {
          logger.warn({ tenantId, projectId }, 'Project main branch not found, skipping');
          return null;
        }
        return { projectId, ref };
      })
    );
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  };
