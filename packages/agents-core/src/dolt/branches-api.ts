import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import type { AgentScopeConfig, ProjectScopeConfig } from '../types/utility';
import type { BranchInfo } from '../validation/dolt-schemas';
import {
  doltBranch,
  doltCheckout,
  doltDeleteBranch,
  doltGetBranchNamespace,
  doltListBranches,
} from './branch';
import { doltHashOf } from './commit';
import {
  ensureSchemaSync,
  getSchemaDiff,
  SCHEMA_SOURCE_BRANCH,
  type SchemaSyncResult,
  syncSchemaFromMain,
} from './schema-sync';

export const MAIN_BRANCH_SUFFIX = 'main';

export class invalidBranchParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'invalidBranchParamsError';
  }
}

/**
 * Get the tenant-scoped main branch name
 */
export const getTenantMainBranch = (tenantId: string): string =>
  `${tenantId}_${MAIN_BRANCH_SUFFIX}`;

/**
 * Check if a branch name (without tenant/project prefix) is a protected branch
 */
export const isProtectedBranchName = (branchName: string): boolean => {
  return branchName === MAIN_BRANCH_SUFFIX;
};

export const getTempBranchSuffix = (prefix: string): string => {
  return `temp-${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
};

export const isTempBranchName = (fullName: string): boolean => {
  return /temp-[a-z-]+_\d+_[a-z0-9]+$/.test(fullName);
};

export type CreateBranchParams = {
  tenantId: string;
  projectId: string;
  name: string;
  /** Branch name to create from. Defaults to tenant main branch. */
  fromBranch?: string;
  /** Commit hash to create from. Mutually exclusive with fromBranch. */
  fromCommit?: string;
  /**
   * Whether to sync schema on the source branch before creating.
   * This ensures the new branch starts with the latest schema from main.
   * Default: true. Ignored when fromCommit is set.
   */
  syncSchemaOnSource?: boolean;
};

export type GetBranchParams = {
  tenantId: string;
  projectId: string;
  name: string;
};

/**
 * Parameters for checking out a branch with optional schema sync
 */
export type CheckoutBranchParams = {
  /** The full branch name (e.g., "tenant1_project1_main") */
  branchName: string;
  /** Whether to sync schema from main after checkout. Default: true */
  syncSchema?: boolean;
  /** Whether to auto-commit pending changes before schema sync. Default: false */
  autoCommitPending?: boolean;
};

/**
 * Result of a branch checkout operation
 */
export type CheckoutBranchResult = {
  /** The full branch name that was checked out */
  branchName: string;
  /** The commit hash of the branch after checkout (and potential schema sync) */
  hash: string;
  /** Result of the schema sync operation */
  schemaSync: {
    /** Whether schema sync was performed */
    performed: boolean;
    /** Whether there were schema differences */
    hadDifferences: boolean;
    /** Error message if schema sync failed */
    error?: string;
    /** The merge commit hash if schema was synced */
    mergeCommitHash?: string;
  };
};

/**
 * Checkout a branch with optional schema synchronization from main.
 *
 * This function:
 * 1. Checks out the specified branch
 * 2. If syncSchema is true (default), checks for schema differences from main
 * 3. If differences exist, merges schema from main into the branch
 *
 * @param db - Database client
 * @returns Function that takes checkout params and returns checkout result
 */
export const checkoutBranch =
  (db: AgentsManageDatabaseClient) =>
  async (params: CheckoutBranchParams): Promise<CheckoutBranchResult> => {
    const { branchName, syncSchema = true, autoCommitPending = false } = params;

    // Verify branch exists
    const branches = await doltListBranches(db)();
    const branch = branches.find((b) => b.name === branchName);

    if (!branch) {
      throw new Error(`Branch '${branchName}' not found`);
    }

    // Checkout the branch
    await doltCheckout(db)({ branch: branchName });

    // Schema sync result
    let schemaSyncResult: SchemaSyncResult = {
      synced: false,
      hadDifferences: false,
    };

    // Sync schema if requested and not on the schema source branch
    if (syncSchema && branchName !== SCHEMA_SOURCE_BRANCH) {
      schemaSyncResult = await ensureSchemaSync(db)({
        autoSync: true,
        autoCommitPending,
      });
    }

    // Get updated branch info (hash may have changed after schema sync)
    const updatedBranches = await doltListBranches(db)();
    const updatedBranch = updatedBranches.find((b) => b.name === branchName);

    return {
      branchName,
      hash: updatedBranch?.hash ?? branch.hash,
      schemaSync: {
        performed: schemaSyncResult.synced,
        hadDifferences: schemaSyncResult.hadDifferences,
        error: schemaSyncResult.error,
        mergeCommitHash: schemaSyncResult.mergeCommitHash,
      },
    };
  };

export const syncSchemaOnBranch =
  (db: AgentsManageDatabaseClient) =>
  async (branchName: string): Promise<void> => {
    const schemaDiffs = await getSchemaDiff(db)(branchName);
    if (schemaDiffs.length > 0) {
      await doltCheckout(db)({ branch: branchName });
      const syncResult = await syncSchemaFromMain(db)({ autoCommitPending: true });
      if (syncResult.error && !syncResult.synced) {
        throw new Error(
          `Failed to sync schema on source branch '${branchName}': ${syncResult.error}`
        );
      }
    }
  };

/**
 * Create a new branch with optional schema synchronization.
 *
 * This function:
 * 1. Optionally syncs schema on the source branch from main (default: true)
 * 2. Creates a new branch from the source branch
 *
 * By syncing schema on the source branch first, we ensure the new branch
 * starts with the latest schema, avoiding schema conflicts later.
 * If you want to create a branch from a commit hash, use the fromCommit parameter.
 */
export const createBranch =
  (db: AgentsManageDatabaseClient) =>
  async (params: CreateBranchParams): Promise<BranchInfo> => {
    const { tenantId, projectId, name, fromBranch, fromCommit, syncSchemaOnSource = true } = params;

    if (fromBranch && fromCommit) {
      throw new invalidBranchParamsError('Cannot specify both fromBranch and fromCommit');
    }

    if (!name || name.trim() === '') {
      throw new invalidBranchParamsError('Branch name cannot be empty');
    }

    const fullName = doltGetBranchNamespace({ tenantId, projectId, branchName: name })();

    const existingBranches = await doltListBranches(db)();
    const branchExists = existingBranches.some((b) => b.name === fullName);

    if (branchExists) {
      throw new invalidBranchParamsError(`Branch '${name}' already exists`);
    }
    //For commits, sync schema onto the created branch
    if (fromCommit) {
      await doltBranch(db)({ name: fullName, startPoint: fromCommit });
      if (syncSchemaOnSource) {
        await syncSchemaOnBranch(db)(fullName);
      }
    } else {
      //For branches, sync schema onto the source branch. This has the benefit of ensuring the branch has the latest schema from the source branch.
      let fromFullBranchName: string;
      if (fromBranch && fromBranch !== MAIN_BRANCH_SUFFIX) {
        fromFullBranchName = doltGetBranchNamespace({
          tenantId,
          projectId,
          branchName: fromBranch,
        })();
      } else {
        fromFullBranchName = getTenantMainBranch(tenantId);
      }

      if (syncSchemaOnSource && fromFullBranchName !== SCHEMA_SOURCE_BRANCH) {
        await syncSchemaOnBranch(db)(fromFullBranchName);
      }

      await doltBranch(db)({ name: fullName, startPoint: fromFullBranchName });
    }

    const hash = await doltHashOf(db)({ revision: fullName });

    return {
      baseName: name,
      fullName,
      hash,
    };
  };

export type DeleteBranchParams = {
  tenantId: string;
  projectId: string;
  branchName: string;
  force?: boolean;
};
/**
 * Delete a branch
 */
export const deleteBranch =
  (db: AgentsManageDatabaseClient) =>
  async (params: DeleteBranchParams): Promise<void> => {
    const { tenantId, projectId, branchName, force } = params;

    if (isProtectedBranchName(branchName)) {
      throw new invalidBranchParamsError(`Cannot delete protected branch '${branchName}'`);
    }

    const fullName = doltGetBranchNamespace({ tenantId, projectId, branchName: branchName })();

    const existingBranches = await doltListBranches(db)();
    const branchExists = existingBranches.some((b) => b.name === fullName);

    if (!branchExists) {
      throw new invalidBranchParamsError(`Branch '${branchName}' not found`);
    }

    await doltDeleteBranch(db)({ name: fullName, force });
  };

/**
 * Get a single branch
 */
export const getBranch =
  (db: AgentsManageDatabaseClient) =>
  async (params: GetBranchParams): Promise<BranchInfo | null> => {
    const { tenantId, projectId, name } = params;

    const fullName = doltGetBranchNamespace({ tenantId, projectId, branchName: name })();

    // Find the branch
    const branches = await doltListBranches(db)();
    const branch = branches.find((b) => b.name === fullName);

    if (!branch) {
      return null;
    }

    return {
      baseName: name,
      fullName,
      hash: branch.hash,
    };
  };

/**
 * List all branches for a project
 * Returns only project-specific branches (e.g., {tenantId}_{projectId}_main, {tenantId}_{projectId}_feature-x)
 * Does NOT include the tenant_main branch as that's an organizational branch, not a project development branch
 */
export const listBranches =
  (db: AgentsManageDatabaseClient) =>
  async (params: ProjectScopeConfig): Promise<BranchInfo[]> => {
    const { tenantId, projectId } = params;

    // Get all branches
    const allBranches = await doltListBranches(db)();

    // Filter branches that match the project namespace: {tenantId}_{projectId}_*
    const prefix = `${tenantId}_${projectId}_`;
    const projectBranches = allBranches
      .filter((b) => b.name.startsWith(prefix))
      .map((b) => ({
        baseName: b.name.substring(prefix.length),
        fullName: b.name,
        hash: b.hash,
      }));

    return projectBranches;
  };

export const listBranchesForAgent =
  (db: AgentsManageDatabaseClient) =>
  async (params: AgentScopeConfig): Promise<BranchInfo[]> => {
    const { tenantId, projectId, agentId } = params;

    // Get all branches
    const allBranches = await listBranches(db)({ tenantId, projectId });

    const branches: BranchInfo[] = [];

    for (const branch of allBranches) {
      try {
        // Query agent table at the specific branch point
        // Dolt AS OF syntax requires the branch name to be quoted
        const result = await db.execute(
          sql.raw(`SELECT id FROM agent AS OF '${branch.fullName}' WHERE id = '${agentId}'`)
        );
        console.log(result);
        // Check if any rows were returned
        if (result.rows.length > 0) {
          branches.push(branch);
        }
      } catch (error) {
        // If branch doesn't exist or query fails, skip this branch
        // This can happen if a branch was deleted or doesn't have the agent table
        console.debug(`Failed to query agent ${agentId} on branch ${branch.fullName}:`, error);
      }
    }

    return branches;
  };
