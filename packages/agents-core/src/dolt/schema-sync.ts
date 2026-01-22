import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import { doltAddAndCommit, doltStatus } from './commit';
import { doltAbortMerge, doltMerge } from './merge';

/**
 * The branch that serves as the source of truth for schema.
 * All other branches sync their schema from this branch.
 */
export const SCHEMA_SOURCE_BRANCH = 'main';

/**
 * Represents a single schema difference between two branches.
 * Each row represents a table that differs between the branches,
 * showing the full CREATE TABLE statements for comparison.
 */
export type SchemaDiff = {
  /** Table name in the source branch (e.g., "public.agent") */
  fromTableName: string;
  /** Table name in the target branch (e.g., "public.agent") */
  toTableName: string;
  /** Full CREATE TABLE statement from the source branch */
  fromCreateStatement: string;
  /** Full CREATE TABLE statement from the target branch */
  toCreateStatement: string;
};

/**
 * Result of a schema sync operation
 */
export type SchemaSyncResult = {
  /** Whether a sync was performed */
  synced: boolean;
  /** Whether there were schema differences detected */
  hadDifferences: boolean;
  /** The schema differences that were found */
  differences?: SchemaDiff[];
  /** Error message if sync failed */
  error?: string;
  /** The merge commit hash if sync was successful */
  mergeCommitHash?: string;
  /** Whether sync was skipped because another request holds the lock */
  skippedDueToLock?: boolean;
};

/**
 * Options for schema sync operations
 */
export type SchemaSyncOptions = {
  /** Automatically commit pending changes before syncing */
  autoCommitPending?: boolean;
  /** Custom commit message for the schema sync */
  commitMessage?: string;
  /** Author information for the commit */
  author?: { name: string; email: string };
};

/**
 * Options for ensuring schema compatibility
 */
export type EnsureSchemaSyncOptions = SchemaSyncOptions & {
  /** Automatically sync schema if differences are found */
  autoSync?: boolean;
};

/**
 * Get the currently active branch
 */
export const getActiveBranch = (db: AgentsManageDatabaseClient) => async (): Promise<string> => {
  const result = await db.execute(sql`SELECT active_branch() as branch`);
  return result.rows[0]?.branch as string;
};

/**
 * Get schema differences between the schema source branch and a target branch.
 * Returns an empty array if schemas are identical.
 *
 * The comparison is done as dolt_schema_diff(targetBranch, SCHEMA_SOURCE_BRANCH),
 * so fromCreateStatement shows the target branch's schema and toCreateStatement
 * shows main's schema (what we want to sync to).
 *
 * @param targetBranch - The branch to compare against the schema source
 * @returns Array of schema differences (one per table that differs)
 */
export const getSchemaDiff =
  (db: AgentsManageDatabaseClient) =>
  async (targetBranch: string): Promise<SchemaDiff[]> => {
    // dolt_schema_diff(from, to) compares FROM -> TO
    // We use (targetBranch, main) to see what targetBranch needs to become main's schema
    const result = await db.execute(
      sql.raw(`SELECT * FROM dolt_schema_diff('${targetBranch}', '${SCHEMA_SOURCE_BRANCH}')`)
    );

    return result.rows.map((row: any) => ({
      fromTableName: row.from_table_name,
      toTableName: row.to_table_name,
      fromCreateStatement: row.from_create_statement,
      toCreateStatement: row.to_create_statement,
    }));
  };

/**
 * Check if a branch has schema differences from the schema source branch
 */
export const hasSchemaDifferences =
  (db: AgentsManageDatabaseClient) =>
  async (targetBranch: string): Promise<boolean> => {
    const differences = await getSchemaDiff(db)(targetBranch);
    return differences.length > 0;
  };

/**
 * Check if the current branch has uncommitted changes
 */
export const hasUncommittedChanges =
  (db: AgentsManageDatabaseClient) => async (): Promise<boolean> => {
    const status = await doltStatus(db)();
    return status.length > 0;
  };

/**
 * Commit any pending changes on the current branch
 */
const commitPendingChanges =
  (db: AgentsManageDatabaseClient) =>
  async (options: {
    message?: string;
    author?: { name: string; email: string };
  }): Promise<void> => {
    const message = options.message ?? 'Auto-commit pending changes before schema sync';
    await doltAddAndCommit(db)({ message, author: options.author });
  };

/**
 * Advisory lock key prefix for schema sync operations.
 * We use a fixed prefix combined with the branch name hash to create unique lock keys.
 */
const SCHEMA_SYNC_LOCK_PREFIX = 'schema_sync_';

const getSchemaSyncLockKey = (branchName: string): bigint => {
  const lockKey = `${SCHEMA_SYNC_LOCK_PREFIX}${branchName}`;
  const digest = createHash('sha256').update(lockKey).digest();
  return digest.readBigInt64BE(0);
};

/**
 * Try to acquire a non-blocking advisory lock for schema sync on a branch.
 * Uses pg_try_advisory_lock which returns immediately without waiting.
 *
 * @param branchName - The branch name to lock
 * @returns true if lock was acquired, false if another session holds it
 */
const tryAcquireSchemaSyncLock =
  (db: AgentsManageDatabaseClient) =>
  async (branchName: string): Promise<boolean> => {
    const key = getSchemaSyncLockKey(branchName);
    const result = await db.execute(
      sql`SELECT pg_try_advisory_lock(CAST(${key} AS bigint)) as acquired`
    );
    return result.rows[0]?.acquired === true;
  };

/**
 * Release the advisory lock for schema sync on a branch.
 *
 * @param branchName - The branch name to unlock
 */
const releaseSchemaSyncLock =
  (db: AgentsManageDatabaseClient) =>
  async (branchName: string): Promise<void> => {
    const key = getSchemaSyncLockKey(branchName);
    await db.execute(sql`SELECT pg_advisory_unlock(CAST(${key} AS bigint))`);
  };

/**
 * Get the latest commit hash for the current branch
 */
const getLatestCommitHash = (db: AgentsManageDatabaseClient) => async (): Promise<string> => {
  const result = await db.execute(sql`SELECT commit_hash FROM dolt_log LIMIT 1`);
  return result.rows[0]?.commit_hash as string;
};

/**
 * Sync schema from the schema source branch (main) into the current branch.
 * This performs a merge of the schema source branch into the current branch.
 *
 * Uses a non-blocking advisory lock to prevent duplicate syncs when multiple
 * concurrent requests attempt to sync the same branch. If another request is
 * already syncing, this function returns immediately with skippedDueToLock: true.
 *
 * Prerequisites:
 * - Current branch must not have uncommitted changes (unless autoCommitPending is true)
 * - Current branch must not be the schema source branch itself
 *
 * @param options - Sync options
 * @returns Result of the sync operation
 */
export const syncSchemaFromMain =
  (db: AgentsManageDatabaseClient) =>
  async (options: SchemaSyncOptions = {}): Promise<SchemaSyncResult> => {
    const currentBranch = await getActiveBranch(db)();

    // Don't sync if we're already on the schema source branch
    if (currentBranch === SCHEMA_SOURCE_BRANCH) {
      return {
        synced: true,
        hadDifferences: false,
        error: 'Cannot sync schema: already on schema source branch',
      };
    }

    // Try to acquire the advisory lock for this branch
    // This prevents duplicate schema syncs from concurrent requests
    const lockAcquired = await tryAcquireSchemaSyncLock(db)(currentBranch);

    if (!lockAcquired) {
      // Another request is currently syncing this branch
      // Return early - that request will handle the sync
      return {
        synced: false,
        hadDifferences: true, // We assume differences exist since sync was requested
        skippedDueToLock: true,
      };
    }

    try {
      // Re-check for schema differences after acquiring lock
      // Another request might have just completed the sync
      const differences = await getSchemaDiff(db)(currentBranch);

      if (differences.length === 0) {
        // Schema is now in sync (another request likely just synced it)
        return {
          synced: false,
          hadDifferences: false,
        };
      }

      // Check for uncommitted changes
      const hasUncommitted = await hasUncommittedChanges(db)();

      if (hasUncommitted) {
        if (options.autoCommitPending) {
          await commitPendingChanges(db)({
            message: 'Auto-commit pending changes before schema sync',
            author: options.author,
          });
        } else {
          return {
            synced: false,
            hadDifferences: true,
            differences,
            error:
              'Cannot sync schema: uncommitted changes exist. ' +
              'Commit changes first or set autoCommitPending: true',
          };
        }
      }

      // Perform the merge from schema source branch
      const mergeSchemaMessage = `Synced schema from ${SCHEMA_SOURCE_BRANCH}`;
      const schemaSyncAuthor = { name: 'Schema Sync System', email: 'system@inkeep.com' };
      const mergeResult = await doltMerge(db)({
        fromBranch: SCHEMA_SOURCE_BRANCH,
        toBranch: currentBranch,
        message: mergeSchemaMessage,
        noFastForward: true,
        author: schemaSyncAuthor,
      });

      if (mergeResult.status === 'conflicts') {
        // Abort the merge - conflicts require manual resolution
        await doltAbortMerge(db)();

        return {
          synced: false,
          hadDifferences: true,
          differences,
          error:
            'Schema merge produced conflicts that require manual resolution. ' +
            'Merge has been aborted.',
        };
      }

      const mergeCommitHash = await getLatestCommitHash(db)();

      return {
        synced: true,
        hadDifferences: true,
        differences,
        mergeCommitHash,
      };
    } catch (error) {
      // Attempt to abort merge if something went wrong
      try {
        await doltAbortMerge(db)();
      } catch {
        // Ignore abort errors - might not be in a merge state
      }

      return {
        synced: false,
        hadDifferences: true,
        error: `Schema sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    } finally {
      // Always release the lock
      try {
        await releaseSchemaSyncLock(db)(currentBranch);
      } catch {
        // Ignore unlock errors - lock will be released when connection closes
      }
    }
  };

/**
 * Ensure the current branch has schema in sync with the schema source branch.
 * This is a convenience function for checking and optionally syncing schema.
 *
 * Use cases:
 * - Call before write operations to ensure schema compatibility
 * - Call before merge operations to prevent schema conflicts
 * - Call on branch checkout to keep branches up-to-date
 *
 * @param options - Options for the check and optional sync
 * @returns Result indicating current sync status
 */
export const ensureSchemaSync =
  (db: AgentsManageDatabaseClient) =>
  async (options: EnsureSchemaSyncOptions = {}): Promise<SchemaSyncResult> => {
    const currentBranch = await getActiveBranch(db)();

    // Always compatible if on schema source branch
    if (currentBranch === SCHEMA_SOURCE_BRANCH) {
      return {
        synced: false,
        hadDifferences: false,
      };
    }

    const differences = await getSchemaDiff(db)(currentBranch);

    if (differences.length === 0) {
      return {
        synced: false,
        hadDifferences: false,
      };
    }

    // Schema differences exist
    if (options.autoSync) {
      return syncSchemaFromMain(db)({
        autoCommitPending: options.autoCommitPending,
        commitMessage: options.commitMessage,
        author: options.author,
      });
    }

    // Return info about differences without syncing
    return {
      synced: false,
      hadDifferences: true,
      differences,
      error:
        `Branch '${currentBranch}' has ${differences.length} schema difference(s) from '${SCHEMA_SOURCE_BRANCH}'. ` +
        'Set autoSync: true to automatically sync schema.',
    };
  };

/**
 * Get a human-readable summary of schema differences
 */
export const formatSchemaDiffSummary = (differences: SchemaDiff[]): string => {
  if (differences.length === 0) {
    return 'No schema differences';
  }

  const lines: string[] = [`${differences.length} table(s) with schema differences:`];

  for (const diff of differences) {
    const tableName = diff.toTableName || diff.fromTableName;

    // Determine the type of change
    let changeType: string;
    if (!diff.fromCreateStatement) {
      changeType = 'added';
    } else if (!diff.toCreateStatement) {
      changeType = 'removed';
    } else {
      changeType = 'modified';
    }

    lines.push(`  - ${tableName} (${changeType})`);
  }

  return lines.join('\n');
};

/**
 * Check if two branches have compatible schemas (both are in sync with main).
 * Useful before merging two feature branches.
 *
 * @param branchA - First branch to check
 * @param branchB - Second branch to check
 * @returns Object indicating if both branches are schema-compatible
 */
export const areBranchesSchemaCompatible =
  (db: AgentsManageDatabaseClient) =>
  async (
    branchA: string,
    branchB: string
  ): Promise<{
    compatible: boolean;
    branchADifferences: SchemaDiff[];
    branchBDifferences: SchemaDiff[];
  }> => {
    const [diffA, diffB] = await Promise.all([
      getSchemaDiff(db)(branchA),
      getSchemaDiff(db)(branchB),
    ]);

    return {
      compatible: diffA.length === 0 && diffB.length === 0,
      branchADifferences: diffA,
      branchBDifferences: diffB,
    };
  };


export const isLocalhostUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
};