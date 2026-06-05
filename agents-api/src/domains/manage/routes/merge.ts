import { OpenAPIHono, type z } from '@hono/zod-openapi';
import {
  areBranchesSchemaCompatible,
  type ConflictItemSchema,
  ConflictResolutionSchema,
  commonGetErrorResponses,
  createApiError,
  doltCheckout,
  doltDiffSummary,
  doltGetBranchNamespace,
  doltHashOf,
  doltMerge,
  doltPreviewMergeConflicts,
  doltPreviewMergeConflictsSummary,
  ErrorResponseSchema,
  getBranch,
  MergeConflictError,
  MergeExecuteRequestSchema,
  MergeExecuteResponseSchema,
  MergePreviewRequestSchema,
  MergePreviewResponseSchema,
  managePkMap,
  ResolutionValidationError,
  releaseAdvisoryLock,
  syncSchemaFromMain,
  TenantProjectParamsSchema,
  tryAdvisoryLock,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at']);

function isTimestampOnlyDiff(
  base: Record<string, unknown>,
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>,
  row: Record<string, unknown>
): boolean {
  if (row.our_diff_type !== 'modified' || row.their_diff_type !== 'modified') return false;

  for (const key of Object.keys(base)) {
    if (TIMESTAMP_COLUMNS.has(key)) continue;
    if (
      String(base[key] ?? '') !== String(ours[key] ?? '') ||
      String(base[key] ?? '') !== String(theirs[key] ?? '')
    ) {
      return false;
    }
  }
  return true;
}

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/merge/preview',
    summary: 'Preview Merge',
    description: 'Preview a merge between two branches, returning diff summary and any conflicts.',
    operationId: 'merge-preview',
    tags: ['Branches'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: MergePreviewRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Merge preview completed',
        content: {
          'application/json': {
            schema: MergePreviewResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { sourceBranch, targetBranch } = body;

    const sourceFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: sourceBranch,
    })();
    const targetFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: targetBranch,
    })();

    const [sourceBranchInfo, targetBranchInfo] = await Promise.all([
      getBranch(db)({ tenantId, projectId, name: sourceBranch }),
      getBranch(db)({ tenantId, projectId, name: targetBranch }),
    ]);

    if (!sourceBranchInfo) {
      throw createApiError({
        code: 'not_found',
        message: `Source branch '${sourceBranch}' not found`,
      });
    }

    if (!targetBranchInfo) {
      throw createApiError({
        code: 'not_found',
        message: `Target branch '${targetBranch}' not found`,
      });
    }

    const schemaCompatability = await areBranchesSchemaCompatible(db)(
      sourceFullName,
      targetFullName
    );

    if (!schemaCompatability.compatible) {
      if (schemaCompatability.branchADifferences.length > 0) {
        await syncBranchSchema(db, sourceFullName, 'source');
      }
      if (schemaCompatability.branchBDifferences.length > 0) {
        await syncBranchSchema(db, targetFullName, 'target');
      }
    }

    const [sourceHash, targetHash, conflictSummary, diffSummary] = await Promise.all([
      doltHashOf(db)({ revision: sourceFullName }),
      doltHashOf(db)({ revision: targetFullName }),
      doltPreviewMergeConflictsSummary(db)({
        baseBranch: targetFullName,
        mergeBranch: sourceFullName,
      }),
      doltDiffSummary(db)({
        fromRevision: targetFullName,
        toRevision: sourceFullName,
      }),
    ]);

    const formattedDiff = diffSummary.map((row) => ({
      table: row.to_table_name ?? row.from_table_name ?? '',
      diffType: row.diff_type,
      dataChange: row.data_change,
      schemaChange: row.schema_change,
    }));

    const tablesWithConflicts = conflictSummary.filter((t) => t.numDataConflicts > 0);
    const hasSchemaConflicts = conflictSummary.some((t) => t.numSchemaConflicts > 0);

    if (hasSchemaConflicts) {
      throw createApiError({
        code: 'internal_server_error',
        message:
          'Schema conflicts detected — this indicates a system error. Please contact support.',
      });
    }

    if (tablesWithConflicts.length === 0) {
      return c.json({
        data: {
          hasConflicts: false,
          sourceHash,
          targetHash,
          canFastForward: false,
          diffSummary: formattedDiff,
          conflicts: [],
        },
      });
    }

    const conflicts: z.infer<typeof ConflictItemSchema>[] = [];
    for (const ct of tablesWithConflicts) {
      const items = await buildConflictItems(db, ct.table, targetFullName, sourceFullName);
      conflicts.push(...items);
    }

    return c.json({
      data: {
        hasConflicts: conflicts.length > 0,
        sourceHash,
        targetHash,
        canFastForward: false,
        diffSummary: formattedDiff,
        conflicts,
      },
    });
  }
);

const MERGE_LOCK_PREFIX = 'merge_execute_';

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/merge',
    summary: 'Execute Merge',
    description: 'Execute a merge between two branches with optional conflict resolutions.',
    operationId: 'merge-execute',
    tags: ['Branches'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: MergeExecuteRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Merge executed successfully',
        content: {
          'application/json': {
            schema: MergeExecuteResponseSchema,
          },
        },
      },
      409: {
        description: 'Conflict — stale hashes, concurrent merge, or unresolved conflicts',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { sourceBranch, targetBranch, sourceHash, targetHash, message, author, resolutions } =
      body;

    const sourceFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: sourceBranch,
    })();
    const targetFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: targetBranch,
    })();

    const [sourceBranchInfo, targetBranchInfo] = await Promise.all([
      getBranch(db)({ tenantId, projectId, name: sourceBranch }),
      getBranch(db)({ tenantId, projectId, name: targetBranch }),
    ]);

    if (!sourceBranchInfo) {
      throw createApiError({
        code: 'not_found',
        message: `Source branch '${sourceBranch}' not found`,
      });
    }

    if (!targetBranchInfo) {
      throw createApiError({
        code: 'not_found',
        message: `Target branch '${targetBranch}' not found`,
      });
    }

    let lockAcquired = false;

    try {
      lockAcquired = await tryAdvisoryLock(db)(MERGE_LOCK_PREFIX, targetFullName);

      if (!lockAcquired) {
        throw createApiError({
          code: 'conflict',
          message: 'Another merge is in progress on the target branch. Please try again.',
        });
      }

      const [currentSourceHash, currentTargetHash] = await Promise.all([
        doltHashOf(db)({ revision: sourceFullName }),
        doltHashOf(db)({ revision: targetFullName }),
      ]);

      if (currentSourceHash !== sourceHash || currentTargetHash !== targetHash) {
        throw createApiError({
          code: 'conflict',
          message: 'Branch state has changed since preview. Please re-preview the merge.',
        });
      }

      try {
        await doltMerge(db)({
          fromBranch: sourceFullName,
          toBranch: targetFullName,
          message: message ?? `Merge ${sourceBranch} into ${targetBranch}`,
          author,
          resolutions,
        });
      } catch (error: any) {
        if (error instanceof MergeConflictError) {
          throw createApiError({
            code: 'conflict',
            message: error.message,
          });
        }
        if (error instanceof ResolutionValidationError) {
          throw createApiError({
            code: 'bad_request',
            message: error.message,
          });
        }
        throw error;
      }

      const newTargetHash = await doltHashOf(db)({ revision: targetFullName });

      return c.json(
        {
          data: {
            status: 'success' as const,
            mergeCommitHash: newTargetHash,
            sourceBranch,
            targetBranch,
          },
        },
        200
      );
    } finally {
      if (lockAcquired) {
        try {
          await releaseAdvisoryLock(db)(MERGE_LOCK_PREFIX, targetFullName);
        } catch {
          // lock released when connection closes
        }
      }
    }
  }
);

function extractPrefixedValues(
  row: Record<string, unknown>,
  prefix: string,
  pkColumns: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const skipSuffixes = new Set(['diff_type', ...pkColumns]);

  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);
    if (skipSuffixes.has(suffix)) continue;
    result[suffix] = value;
  }

  return result;
}

async function buildConflictItems(
  db: Parameters<typeof doltPreviewMergeConflicts>[0],
  tableName: string,
  baseBranch: string,
  mergeBranch: string
): Promise<z.infer<typeof ConflictItemSchema>[]> {
  const rows = await doltPreviewMergeConflicts(db)({ baseBranch, mergeBranch, tableName });
  const pkColumns = managePkMap[tableName] ?? [];
  const items: z.infer<typeof ConflictItemSchema>[] = [];

  for (const row of rows) {
    const fullPk: Record<string, string> = {};
    for (const col of pkColumns) {
      fullPk[col] = String(row[`base_${col}`] ?? row[`our_${col}`] ?? row[`their_${col}`]);
    }

    const base = extractPrefixedValues(row, 'base_', pkColumns);
    const ours = extractPrefixedValues(row, 'our_', pkColumns);
    const theirs = extractPrefixedValues(row, 'their_', pkColumns);

    if (isTimestampOnlyDiff(base, ours, theirs, row)) continue;

    items.push({
      table: tableName,
      primaryKey: fullPk,
      ourDiffType: String(row.our_diff_type ?? 'modified'),
      theirDiffType: String(row.their_diff_type ?? 'modified'),
      base: row.base_diff_type === 'added' ? null : base,
      ours: row.our_diff_type === 'removed' ? null : ours,
      theirs: row.their_diff_type === 'removed' ? null : theirs,
    });
  }

  return items;
}

async function syncBranchSchema(
  db: Parameters<typeof doltCheckout>[0],
  branchName: string,
  label: string
): Promise<void> {
  await doltCheckout(db)({ branch: branchName });
  const syncResult = await syncSchemaFromMain(db)({ autoCommitPending: true });
  if (syncResult.error && !syncResult.synced) {
    throw createApiError({
      code: 'internal_server_error',
      message: `Schema sync failed on ${label} branch: ${syncResult.error}`,
    });
  }
}

export { MergePreviewRequestSchema, MergePreviewResponseSchema };
export { MergeExecuteRequestSchema, MergeExecuteResponseSchema, ConflictResolutionSchema };
export default app;
