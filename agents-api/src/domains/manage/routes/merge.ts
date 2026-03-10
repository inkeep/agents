import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import {
  applyResolutions,
  areBranchesSchemaCompatible,
  commonGetErrorResponses,
  createApiError,
  createTempBranchFromCommit,
  doltAbortMerge,
  doltAddAndCommit,
  doltCheckout,
  doltConflicts,
  doltDeleteBranch,
  doltDiffSummary,
  doltHashOf,
  doltMerge,
  doltTableConflicts,
  ErrorResponseSchema,
  getBranch,
  getFullProject,
  managePkMap,
  releaseAdvisoryLock,
  syncSchemaFromMain,
  TenantProjectParamsSchema,
  tryAdvisoryLock,
  updateFullProjectServerSide,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const SCOPE_PK_COLUMNS = new Set(['tenant_id', 'project_id']);

function stripScopePks(pk: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(pk)) {
    if (!SCOPE_PK_COLUMNS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

function generateTempBranchName(purpose: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  return `_merge_${purpose}_${timestamp}_${randomId}`;
}

const ConflictResolutionSchema = z.object({
  table: z.string(),
  primaryKey: z.record(z.string(), z.string()),
  rowDefaultPick: z.enum(['ours', 'theirs']),
  columns: z.record(z.string(), z.enum(['ours', 'theirs'])).optional(),
});

const DiffSummaryItemSchema = z
  .object({
    table: z.string(),
    diffType: z.string(),
    dataChange: z.boolean(),
    schemaChange: z.boolean(),
  })
  .openapi('DiffSummaryItem');

const ConflictItemSchema = z
  .object({
    table: z.string(),
    primaryKey: z.record(z.string(), z.string()),
    ourDiffType: z.string(),
    theirDiffType: z.string(),
    base: z.record(z.string(), z.unknown()).nullable(),
    ours: z.record(z.string(), z.unknown()).nullable(),
    theirs: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('ConflictItem');

const MergePreviewRequestSchema = z
  .object({
    sourceBranch: z.string(),
    targetBranch: z.string(),
    baseCommit: z.string().optional(),
    localProjectDefinition: z.any().optional(),
  })
  .openapi('MergePreviewRequest');

const MergePreviewResponseSchema = z
  .object({
    data: z.object({
      hasConflicts: z.boolean(),
      sourceHash: z.string(),
      targetHash: z.string(),
      canFastForward: z.boolean(),
      diffSummary: z.array(DiffSummaryItemSchema),
      conflicts: z.array(ConflictItemSchema),
    }),
  })
  .openapi('MergePreviewResponse');

const MergeExecuteRequestSchema = z
  .object({
    sourceBranch: z.string(),
    targetBranch: z.string(),
    sourceHash: z.string(),
    targetHash: z.string(),
    message: z.string().optional(),
    author: z
      .object({
        name: z.string(),
        email: z.string(),
      })
      .optional(),
    resolutions: z.array(ConflictResolutionSchema).optional(),
    baseCommit: z.string().optional(),
    localProjectDefinition: z.any().optional(),
  })
  .openapi('MergeExecuteRequest');

const MergeExecuteResponseSchema = z
  .object({
    data: z.object({
      status: z.literal('success'),
      mergeCommitHash: z.string(),
      sourceBranch: z.string(),
      targetBranch: z.string(),
    }),
  })
  .openapi('MergeExecuteResponse');

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
    const { sourceBranch, targetBranch, baseCommit, localProjectDefinition } = body;

    const sourceFullName = `${tenantId}_${projectId}_${sourceBranch}`;
    const targetFullName = `${tenantId}_${projectId}_${targetBranch}`;

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

    let effectiveSourceFullName = sourceFullName;
    let localTempBranchName: string | null = null;

    if (baseCommit && localProjectDefinition) {
      localTempBranchName = generateTempBranchName('cli_source');
      await createTempBranchFromCommit(db)({
        name: localTempBranchName,
        commitHash: baseCommit,
      });

      try {
        await doltCheckout(db)({ branch: localTempBranchName });
        await updateFullProjectServerSide(db)({
          scopes: { tenantId, projectId },
          projectData: localProjectDefinition as FullProjectDefinition,
        });
        await doltAddAndCommit(db)({
          message: 'Apply local project definition for merge preview',
        });
      } catch (error) {
        await cleanupTempBranch(db, localTempBranchName);
        throw error;
      }

      effectiveSourceFullName = localTempBranchName;
    }

    const schemaCompat = await areBranchesSchemaCompatible(db)(
      effectiveSourceFullName,
      targetFullName
    );

    if (!schemaCompat.compatible) {
      if (schemaCompat.branchADifferences.length > 0) {
        const syncResult = await syncSchemaFromMain(db)({ autoCommitPending: true });
        if (syncResult.error && !syncResult.synced) {
          if (localTempBranchName) await cleanupTempBranch(db, localTempBranchName);
          throw createApiError({
            code: 'internal_server_error',
            message: `Schema sync failed on source branch: ${syncResult.error}`,
          });
        }
      }
      if (schemaCompat.branchBDifferences.length > 0) {
        const syncResult = await syncSchemaFromMain(db)({ autoCommitPending: true });
        if (syncResult.error && !syncResult.synced) {
          if (localTempBranchName) await cleanupTempBranch(db, localTempBranchName);
          throw createApiError({
            code: 'internal_server_error',
            message: `Schema sync failed on target branch: ${syncResult.error}`,
          });
        }
      }
    }

    const [sourceHash, targetHash] = await Promise.all([
      doltHashOf(db)({ revision: effectiveSourceFullName }),
      doltHashOf(db)({ revision: targetFullName }),
    ]);

    const previewTempBranch = generateTempBranchName('preview');

    try {
      await createTempBranchFromCommit(db)({
        name: previewTempBranch,
        commitHash: targetHash,
      });

      const mergeResult = await doltMerge(db)({
        fromBranch: effectiveSourceFullName,
        toBranch: previewTempBranch,
      });

      if (!mergeResult.hasConflicts) {
        const diffSummary = await doltDiffSummary(db)({
          fromRevision: targetHash,
          toRevision: effectiveSourceFullName,
        });

        const formattedDiff = diffSummary.map((row) => ({
          table: row.table_name,
          diffType: row.diff_type,
          dataChange: row.data_change,
          schemaChange: row.schema_change,
        }));

        return c.json({
          data: {
            hasConflicts: false,
            sourceHash,
            targetHash,
            canFastForward: sourceHash === targetHash,
            diffSummary: formattedDiff,
            conflicts: [],
          },
        });
      }

      const conflictTables = await doltConflicts(db)();
      const conflicts: z.infer<typeof ConflictItemSchema>[] = [];

      for (const ct of conflictTables) {
        const tableName = ct.table;
        const tableConflicts = await doltTableConflicts(db)({ tableName });
        const pkColumns = managePkMap[tableName] ?? [];

        for (const row of tableConflicts) {
          const fullPk: Record<string, string> = {};
          for (const col of pkColumns) {
            fullPk[col] = String(row[`base_${col}`] ?? row[`our_${col}`] ?? row[`their_${col}`]);
          }

          const strippedPk = stripScopePks(fullPk);

          const base = extractPrefixedValues(row, 'base_', pkColumns);
          const ours = extractPrefixedValues(row, 'our_', pkColumns);
          const theirs = extractPrefixedValues(row, 'their_', pkColumns);

          conflicts.push({
            table: tableName,
            primaryKey: strippedPk,
            ourDiffType: String(row.our_diff_type ?? 'modified'),
            theirDiffType: String(row.their_diff_type ?? 'modified'),
            base: row.base_diff_type === 'added' ? null : base,
            ours: row.our_diff_type === 'removed' ? null : ours,
            theirs: row.their_diff_type === 'removed' ? null : theirs,
          });
        }
      }

      const diffSummary = await doltDiffSummary(db)({
        fromRevision: targetHash,
        toRevision: effectiveSourceFullName,
      });

      const formattedDiff = diffSummary.map((row) => ({
        table: row.table_name,
        diffType: row.diff_type,
        dataChange: row.data_change,
        schemaChange: row.schema_change,
      }));

      try {
        await doltAbortMerge(db)();
      } catch {
        // may not be in a merge state
      }

      return c.json({
        data: {
          hasConflicts: true,
          sourceHash,
          targetHash,
          canFastForward: false,
          diffSummary: formattedDiff,
          conflicts,
        },
      });
    } finally {
      await cleanupTempBranch(db, previewTempBranch);
      if (localTempBranchName) {
        await cleanupTempBranch(db, localTempBranchName);
      }
    }
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
    const {
      sourceBranch,
      targetBranch,
      sourceHash,
      targetHash,
      message,
      author,
      resolutions,
      baseCommit,
      localProjectDefinition,
    } = body;

    const sourceFullName = `${tenantId}_${projectId}_${sourceBranch}`;
    const targetFullName = `${tenantId}_${projectId}_${targetBranch}`;

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

    let effectiveSourceFullName = sourceFullName;
    let localTempBranchName: string | null = null;

    if (baseCommit && localProjectDefinition) {
      localTempBranchName = generateTempBranchName('cli_source');
      await createTempBranchFromCommit(db)({
        name: localTempBranchName,
        commitHash: baseCommit,
      });

      try {
        await doltCheckout(db)({ branch: localTempBranchName });
        await updateFullProjectServerSide(db)({
          scopes: { tenantId, projectId },
          projectData: localProjectDefinition as FullProjectDefinition,
        });
        await doltAddAndCommit(db)({
          message: 'Apply local project definition for merge execute',
        });
      } catch (error) {
        await cleanupTempBranch(db, localTempBranchName);
        throw error;
      }

      effectiveSourceFullName = localTempBranchName;
    }

    const [currentSourceHash, currentTargetHash] = await Promise.all([
      doltHashOf(db)({ revision: effectiveSourceFullName }),
      doltHashOf(db)({ revision: targetFullName }),
    ]);

    if (currentSourceHash !== sourceHash || currentTargetHash !== targetHash) {
      if (localTempBranchName) await cleanupTempBranch(db, localTempBranchName);
      throw createApiError({
        code: 'conflict',
        message: 'Branch state has changed since preview. Please re-preview the merge.',
      });
    }

    const lockAcquired = await tryAdvisoryLock(db)(MERGE_LOCK_PREFIX, targetFullName);

    if (!lockAcquired) {
      if (localTempBranchName) await cleanupTempBranch(db, localTempBranchName);
      throw createApiError({
        code: 'conflict',
        message: 'Another merge is in progress on the target branch. Please try again.',
      });
    }

    const executeTempBranch = generateTempBranchName('execute');

    try {
      await createTempBranchFromCommit(db)({
        name: executeTempBranch,
        commitHash: targetHash,
      });

      const mergeResult = await doltMerge(db)({
        fromBranch: effectiveSourceFullName,
        toBranch: executeTempBranch,
        message: message ?? `Merge ${sourceBranch} into ${targetBranch}`,
        author,
      });

      if (mergeResult.hasConflicts) {
        if (!resolutions || resolutions.length === 0) {
          try {
            await doltAbortMerge(db)();
          } catch {
            // may not be in merge state
          }
          throw createApiError({
            code: 'conflict',
            message:
              'Merge has conflicts but no resolutions were provided. Please re-preview and provide resolutions.',
          });
        }

        const conflictTables = await doltConflicts(db)();
        let totalConflicts = 0;
        for (const ct of conflictTables) {
          const tableConflicts = await doltTableConflicts(db)({ tableName: ct.table });
          totalConflicts += tableConflicts.length;
        }

        if (resolutions.length < totalConflicts) {
          try {
            await doltAbortMerge(db)();
          } catch {
            // may not be in merge state
          }
          throw createApiError({
            code: 'bad_request',
            message: `Resolutions provided (${resolutions.length}) do not cover all conflicts (${totalConflicts}). All conflicts must be resolved.`,
          });
        }

        await applyResolutions(db)(resolutions);

        await doltAddAndCommit(db)({
          message:
            message ?? `Merge ${sourceBranch} into ${targetBranch} (with conflict resolution)`,
          author,
        });
      }

      const mergedProject = await getFullProject(db)({
        scopes: { tenantId, projectId },
      });

      if (!mergedProject) {
        throw createApiError({
          code: 'internal_server_error',
          message: 'Failed to read merged project state from temp branch',
        });
      }

      await doltCheckout(db)({ branch: targetFullName });

      await updateFullProjectServerSide(db)({
        scopes: { tenantId, projectId },
        projectData: mergedProject as unknown as FullProjectDefinition,
      });

      await doltAddAndCommit(db)({
        message: message ?? `Merge ${sourceBranch} into ${targetBranch}`,
        author,
      });

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
      await cleanupTempBranch(db, executeTempBranch);
      if (localTempBranchName) {
        await cleanupTempBranch(db, localTempBranchName);
      }
      try {
        await releaseAdvisoryLock(db)(MERGE_LOCK_PREFIX, targetFullName);
      } catch {
        // lock released when connection closes
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

async function cleanupTempBranch(
  db: Parameters<typeof doltDeleteBranch>[0],
  branchName: string
): Promise<void> {
  try {
    await doltDeleteBranch(db)({ name: branchName, force: true });
  } catch {
    // best-effort cleanup
  }
}

export { MergePreviewRequestSchema, MergePreviewResponseSchema };
export { MergeExecuteRequestSchema, MergeExecuteResponseSchema, ConflictResolutionSchema };
export default app;
