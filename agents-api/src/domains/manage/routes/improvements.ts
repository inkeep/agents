import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  areBranchesSchemaCompatible,
  ConflictItemSchema,
  ConflictResolutionSchema,
  commonGetErrorResponses,
  createApiError,
  deleteBranch,
  doltAddAndCommit,
  doltCheckout,
  doltDiff,
  doltGetBranchNamespace,
  doltHashOf,
  doltPreviewMergeConflicts,
  doltPreviewMergeConflictsSummary,
  getDatasetById,
  getEvaluatorById,
  getFeedbackByIds,
  getInProcessFetch,
  getMessagesByConversation,
  listDatasetRuns,
  listEvaluationResultsByRun,
  listEvaluationRunsByJobConfigId,
  listScheduledTriggerInvocationsByTriggerId,
  manageFkColumnLinks,
  managePkMap,
  manageTableMap,
  syncSchemaFromMain,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import {
  createCoPilotRun,
  deleteCoPilotRunByBranchName,
  generateId,
  getCoPilotRunByBranchName,
  getProjectMainResolvedRef,
  listCoPilotRuns,
} from '@inkeep/agents-core';
import { continueImprovement, triggerImprovement } from '../../run/services/ImprovementService';

const logger = getLogger('improvements');

function buildDynWhere(
  tableObj: Parameters<typeof getTableColumns>[0],
  pk: Record<string, string>
) {
  const columns = getTableColumns(tableObj);
  const colByDbName = new Map(Object.values(columns).map((c) => [c.name, c]));
  const conditions = Object.entries(pk).map(([dbName, val]) => {
    const col = colByDbName.get(dbName);
    if (!col) throw createApiError({ code: 'bad_request', message: `Unknown column: ${dbName}` });
    return eq(col, val);
  });
  return and(...conditions)!;
}

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const IMPROVEMENT_BRANCH_PREFIX = 'improvement';

const EVAL_INFRASTRUCTURE_TABLES = new Set([
  'evaluation_job_config',
  'evaluation_job_config_evaluator_relations',
  'evaluation_run_config',
  'evaluation_run_config_evaluation_suite_config_relations',
  'evaluation_suite_config',
  'evaluation_suite_config_evaluator_relations',
  'dataset_run_config',
  'dataset_run_config_agent_relations',
  'public.evaluation_job_config',
  'public.evaluation_job_config_evaluator_relations',
  'public.evaluation_run_config',
  'public.evaluation_run_config_evaluation_suite_config_relations',
  'public.evaluation_suite_config',
  'public.evaluation_suite_config_evaluator_relations',
  'public.dataset_run_config',
  'public.dataset_run_config_agent_relations',
  'projects',
  'public.projects',
]);

const ImprovementRunSchema = z
  .object({
    branchName: z.string(),
    conversationIds: z.array(z.string()),
    triggeredBy: z.string().nullable(),
    status: z.string(),
    feedbackIds: z.array(z.string()).nullable(),
    createdAt: z.string(),
  })
  .openapi('ImprovementRun');

const ImprovementListResponseSchema = z
  .object({
    data: z.array(ImprovementRunSchema),
  })
  .openapi('ImprovementListResponse');

const ImprovementBranchParamsSchema = z.object({
  tenantId: z.string(),
  projectId: z.string(),
  branchName: z.string(),
});

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Improvements',
    description:
      'List all improvement proposals for a project. Returns branches matching the improvement naming convention.',
    operationId: 'list-improvements',
    tags: ['Improvements'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of improvement proposals',
        content: {
          'application/json': {
            schema: ImprovementListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');

    const runs = await listCoPilotRuns(runDbClient)({
      scopes: { tenantId, projectId },
    });

    const improvements = runs.map((r) => ({
      branchName: r.ref?.name ?? '',
      conversationIds: r.conversationIds ?? [],
      triggeredBy: r.triggeredBy,
      status: r.status ?? 'running',
      feedbackIds: r.feedbackIds ?? null,
      createdAt: r.createdAt,
    }));

    return c.json({ data: improvements });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/trigger',
    summary: 'Trigger Improvement Run',
    description:
      'Create an improvement branch and trigger the improvement agent via the chat API. Returns immediately while the agent runs in the background.',
    operationId: 'trigger-improvement',
    tags: ['Improvements'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              feedbackIds: z
                .array(z.string())
                .min(1)
                .describe('One or more feedback IDs to base the improvement on'),
              additionalContext: z
                .string()
                .optional()
                .describe('Free-form instructions or context to guide the improvement agent'),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Improvement triggered — agent runs in the background',
        content: {
          'application/json': {
            schema: z.object({
              branchName: z.string(),
              conversationId: z.string(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { feedbackIds, additionalContext } = c.req.valid('json');

    const feedbackItems = await getFeedbackByIds(runDbClient)({
      scopes: { tenantId, projectId },
      feedbackIds,
    });

    const missingIds = feedbackIds.filter((id) => !feedbackItems.some((f) => f.id === id));
    if (missingIds.length > 0) {
      throw createApiError({
        code: 'bad_request',
        message: `Feedback not found: ${missingIds.join(', ')}`,
      });
    }

    const agentIds = new Set(feedbackItems.map((f) => f.agentId).filter(Boolean));
    if (agentIds.size > 1) {
      throw createApiError({
        code: 'bad_request',
        message: `All feedback must belong to the same agent. Found feedback from multiple agents: ${[...agentIds].join(', ')}`,
      });
    }
    const agentId = [...agentIds][0];
    if (!agentId) {
      throw createApiError({
        code: 'bad_request',
        message: 'Could not derive target agentId from feedback',
      });
    }

    const db = c.get('db');
    const userId = c.get('userId');
    if (!userId) {
      throw createApiError({ code: 'unauthorized', message: 'userId is required' });
    }
    const forwardedCookie =
      c.req.header('x-forwarded-cookie') || c.req.header('cookie') || undefined;

    const result = await triggerImprovement({
      tenantId,
      projectId,
      agentId,
      feedbackIds,
      additionalContext,
      userId,
      forwardedCookie,
      db,
    });

    return c.json(result);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/copilot-runs',
    summary: 'Create CoPilot Run',
    description:
      'Track an interactive copilot session. Called on the first user message in a copilot chat.',
    operationId: 'create-copilot-run',
    tags: ['Improvements'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              conversationId: z.string().describe('The conversation ID from the copilot chat'),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'CoPilot run tracked',
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              conversationIds: z.array(z.string()),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { conversationId } = c.req.valid('json');
    const userId = c.get('userId');
    const db = c.get('db');

    const mainRef = await getProjectMainResolvedRef(db)(tenantId, projectId);

    const run = await createCoPilotRun(runDbClient)({
      tenantId,
      projectId,
      id: generateId(),
      ref: mainRef,
      conversationIds: [conversationId],
      triggeredBy: userId,
      status: 'running',
    });

    return c.json({ id: run.id, conversationIds: run.conversationIds ?? [] });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{branchName}/continue',
    summary: 'Continue Improvement',
    description:
      'Send a follow-up message to an improvement branch. Creates a new conversation and appends it to the existing copilot run.',
    operationId: 'continue-improvement',
    tags: ['Improvements'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ImprovementBranchParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              message: z.string().min(1).describe('The follow-up instruction for the agent'),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Continuation triggered — new conversation created',
        content: {
          'application/json': {
            schema: z.object({
              conversationId: z.string(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, branchName } = c.req.valid('param');
    const { message } = c.req.valid('json');
    const userId = c.get('userId');
    if (!userId) {
      throw createApiError({ code: 'unauthorized', message: 'userId is required' });
    }
    const db = c.get('db');
    const forwardedCookie =
      c.req.header('x-forwarded-cookie') || c.req.header('cookie') || undefined;

    const result = await continueImprovement({
      tenantId,
      projectId,
      branchName: decodeURIComponent(branchName),
      message,
      userId,
      forwardedCookie,
      db,
    });

    return c.json(result);
  }
);

const ImprovementDiffQuerySchema = z.object({
  targetBranch: z.string().optional(),
});

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{branchName}/diff',
    summary: 'Get Improvement Diff',
    description:
      'Get the diff between an improvement branch and a target branch (defaults to main), showing what changes would be applied on merge. Delegates conflict detection and hashes to the generic branches merge preview endpoint, and enriches with per-row table data and foreign-key metadata.',
    operationId: 'get-improvement-diff',
    tags: ['Improvements'],
    permission: requireProjectPermission('view'),
    request: {
      params: ImprovementBranchParamsSchema,
      query: ImprovementDiffQuerySchema,
    },
    responses: {
      200: {
        description: 'Diff between improvement branch and target branch',
        content: {
          'application/json': {
            schema: z.object({
              branchName: z.string(),
              targetBranch: z.string(),
              sourceHash: z.string().optional(),
              targetHash: z.string().optional(),
              hasConflicts: z.boolean(),
              conflicts: z.array(ConflictItemSchema),
              summary: z.array(
                z.object({
                  tableName: z.string(),
                  diffType: z.string(),
                  dataChange: z.boolean(),
                  schemaChange: z.boolean(),
                })
              ),
              tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
              fkLinks: z.array(z.unknown()).optional(),
              pkMap: z.record(z.string(), z.array(z.string())).optional(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, branchName } = c.req.valid('param');
    const { targetBranch: targetBranchParam } = c.req.valid('query');
    const db = c.get('db');

    const decodedBranchName = decodeURIComponent(branchName);
    const targetBranch = targetBranchParam ?? 'main';

    if (!decodedBranchName.startsWith(IMPROVEMENT_BRANCH_PREFIX)) {
      throw createApiError({
        code: 'bad_request',
        message: 'Not an improvement branch',
      });
    }

    const sourceFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: decodedBranchName,
    })();
    const targetFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: targetBranch,
    })();

    const requestUrl = new URL(c.req.url);
    const previewUrl = `${requestUrl.origin}/manage/tenants/${encodeURIComponent(
      tenantId
    )}/projects/${encodeURIComponent(projectId)}/branches/merge/preview`;

    const forwardedHeaders = new Headers(c.req.raw.headers);
    forwardedHeaders.set('Content-Type', 'application/json');
    forwardedHeaders.delete('content-length');

    const previewResponse = await getInProcessFetch()(previewUrl, {
      method: 'POST',
      headers: forwardedHeaders,
      body: JSON.stringify({ sourceBranch: decodedBranchName, targetBranch }),
    });

    if (!previewResponse.ok) {
      // Branch missing or other upstream issue — surface an empty diff so UI can still render.
      const errorBody = (await previewResponse.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      logger.warn(
        {
          sourceFullName,
          targetFullName,
          status: previewResponse.status,
          message: errorBody?.error?.message,
        },
        'Merge preview failed for improvement diff'
      );
      return c.json({
        branchName: decodedBranchName,
        targetBranch,
        hasConflicts: false,
        conflicts: [],
        summary: [],
        tables: {},
      });
    }

    const preview = (await previewResponse.json()) as {
      data: {
        hasConflicts: boolean;
        sourceHash: string;
        targetHash: string;
        diffSummary: Array<{
          table: string;
          diffType: string;
          dataChange: boolean;
          schemaChange: boolean;
        }>;
        conflicts: z.infer<typeof ConflictItemSchema>[];
      };
    };
    const summary = preview.data.diffSummary
      .filter((row) => !EVAL_INFRASTRUCTURE_TABLES.has(row.table))
      .map((row) => ({
        tableName: row.table,
        diffType: row.diffType,
        dataChange: row.dataChange,
        schemaChange: row.schemaChange,
      }));

    const conflicts = preview.data.conflicts.filter(
      (c) => !EVAL_INFRASTRUCTURE_TABLES.has(c.table)
    );

    const tables: Record<string, any[]> = {};
    for (const s of summary) {
      if (!s.dataChange) continue;
      const rawTableName = s.tableName.replace(/^public\./, '');
      try {
        const rows = await doltDiff(db)({
          fromRevision: targetFullName,
          toRevision: sourceFullName,
          tableName: rawTableName,
        });
        tables[s.tableName] = rows;
      } catch (err) {
        logger.warn({ tableName: s.tableName, rawTableName, err }, 'Failed to get diff for table');
      }
    }

    const changedTables = new Set(summary.map((s) => s.tableName.replace(/^public\./, '')));
    const relevantFkLinks = manageFkColumnLinks.filter(
      (link) => changedTables.has(link.childTable) || changedTables.has(link.parentTable)
    );

    return c.json({
      branchName: decodedBranchName,
      targetBranch,
      sourceHash: preview.data.sourceHash,
      targetHash: preview.data.targetHash,
      hasConflicts: conflicts.length > 0,
      conflicts,
      summary,
      tables,
      fkLinks: relevantFkLinks,
      pkMap: Object.fromEntries(
        [...changedTables].filter((t) => managePkMap[t]).map((t) => [t, managePkMap[t]])
      ),
    });
  }
);

const MergeImprovementResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  mergeCommitHash: z.string().optional(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
});

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{branchName}/merge',
    summary: 'Merge Improvement',
    description:
      'Approve and merge an improvement branch into a target branch (defaults to main). Delegates the actual merge to the generic branches merge endpoint for locking and concurrency handling, then runs improvement-specific cleanup on success. If conflicts exist, returns 409 with conflict details. Re-submit with resolutions to resolve.',
    operationId: 'merge-improvement',
    tags: ['Improvements'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ImprovementBranchParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              targetBranch: z.string().optional(),
              resolutions: z.array(ConflictResolutionSchema).optional(),
            }),
          },
        },
        required: false,
      },
    },
    responses: {
      200: {
        description: 'Improvement merged successfully',
        content: {
          'application/json': {
            schema: MergeImprovementResponseSchema,
          },
        },
      },
      409: {
        description: 'Merge conflicts detected — resolve and retry',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, branchName } = c.req.valid('param');
    const db = c.get('db');

    const decodedBranchName = decodeURIComponent(branchName);

    if (!decodedBranchName.startsWith(IMPROVEMENT_BRANCH_PREFIX)) {
      throw createApiError({
        code: 'bad_request',
        message: 'Not an improvement branch',
      });
    }

    const body = c.req.valid('json');
    const resolutions = body?.resolutions;
    const targetBranch = body?.targetBranch ?? 'main';

    if (targetBranch === decodedBranchName) {
      throw createApiError({
        code: 'bad_request',
        message: 'Source and target branch must differ',
      });
    }

    const sourceFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: decodedBranchName,
    })();
    const targetFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: targetBranch,
    })();

    const schemaCompat = await areBranchesSchemaCompatible(db)(sourceFullName, targetFullName);
    if (!schemaCompat.compatible) {
      if (schemaCompat.branchADifferences.length > 0) {
        await doltCheckout(db)({ branch: sourceFullName });
        const syncResult = await syncSchemaFromMain(db)({ autoCommitPending: true });
        if (syncResult.error && !syncResult.synced) {
          logger.warn({ error: syncResult.error }, 'Schema sync failed on improvement branch');
        }
      }
      if (schemaCompat.branchBDifferences.length > 0) {
        await doltCheckout(db)({ branch: targetFullName });
        const syncResult = await syncSchemaFromMain(db)({ autoCommitPending: true });
        if (syncResult.error && !syncResult.synced) {
          logger.warn({ error: syncResult.error }, 'Schema sync failed on target branch');
        }
      }
    }

    const [sourceHash, targetHash] = await Promise.all([
      doltHashOf(db)({ revision: sourceFullName }),
      doltHashOf(db)({ revision: targetFullName }),
    ]);

    const requestUrl = new URL(c.req.url);
    const mergeUrl = `${requestUrl.origin}/manage/tenants/${encodeURIComponent(
      tenantId
    )}/projects/${encodeURIComponent(projectId)}/branches/merge`;

    const forwardedHeaders = new Headers(c.req.raw.headers);
    forwardedHeaders.set('Content-Type', 'application/json');
    forwardedHeaders.delete('content-length');

    const mergeResponse = await getInProcessFetch()(mergeUrl, {
      method: 'POST',
      headers: forwardedHeaders,
      body: JSON.stringify({
        sourceBranch: decodedBranchName,
        targetBranch,
        sourceHash,
        targetHash,
        message: `Merge improvement "${decodedBranchName}" into ${targetBranch}`,
        ...(resolutions ? { resolutions } : {}),
      }),
    });

    if (mergeResponse.status === 409) {
      const conflicts = await buildImprovementConflictItems(
        db,
        targetFullName,
        sourceFullName
      ).catch(() => []);

      if (conflicts.length > 0) {
        throw createApiError({
          code: 'conflict',
          message: `Merge has ${conflicts.length} conflict(s) that need resolution.`,
          extensions: { conflicts },
        });
      }

      const errorBody = (await mergeResponse.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      throw createApiError({
        code: 'conflict',
        message: errorBody?.error?.message ?? 'Merge conflict',
      });
    }

    if (!mergeResponse.ok) {
      const errorBody = (await mergeResponse.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      const message = errorBody?.error?.message ?? `Merge failed with status ${mergeResponse.status}`;
      if (mergeResponse.status === 400) {
        throw createApiError({ code: 'bad_request', message });
      }
      if (mergeResponse.status === 404) {
        throw createApiError({ code: 'not_found', message });
      }
      throw createApiError({ code: 'internal_server_error', message });
    }

    const mergeResult = (await mergeResponse.json()) as {
      data: {
        status: 'success';
        mergeCommitHash: string;
        sourceBranch: string;
        targetBranch: string;
      };
    };

    await deleteBranch(db)({
      tenantId,
      projectId,
      branchName: decodedBranchName,
      force: true,
    }).catch((err: unknown) => {
      logger.warn({ err, branchName: decodedBranchName }, 'Failed to delete branch after merge');
    });

    await deleteCoPilotRunByBranchName(runDbClient)({
      scopes: { tenantId, projectId },
      branchName: decodedBranchName,
    }).catch((err: unknown) => {
      logger.warn(
        { err, branchName: decodedBranchName },
        'Failed to delete copilot run after merge'
      );
    });

    return c.json({
      success: true,
      message: `Improvement branch "${decodedBranchName}" merged into ${targetBranch}`,
      mergeCommitHash: mergeResult.data.mergeCommitHash,
      sourceBranch: decodedBranchName,
      targetBranch,
    });
  }
);

const RevertRowSchema = z.object({
  table: z.string(),
  primaryKey: z.record(z.string(), z.string()),
  diffType: z.enum(['added', 'modified', 'removed']),
});

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{branchName}/revert',
    summary: 'Revert Changes on Improvement Branch',
    description:
      'Revert specific changes on the improvement branch before merging, allowing selective merge. Baseline values for modified/removed rows are read from the target branch (defaults to main).',
    operationId: 'revert-improvement',
    tags: ['Improvements'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ImprovementBranchParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              rows: z.array(RevertRowSchema),
              targetBranch: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Rows reverted on the improvement branch',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean(), message: z.string() }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, branchName } = c.req.valid('param');
    const db = c.get('db');

    const decodedBranchName = decodeURIComponent(branchName);

    if (!decodedBranchName.startsWith(IMPROVEMENT_BRANCH_PREFIX)) {
      throw createApiError({
        code: 'bad_request',
        message: 'Not an improvement branch',
      });
    }

    const { rows, targetBranch: targetBranchParam } = c.req.valid('json');
    const targetBranch = targetBranchParam ?? 'main';

    if (targetBranch === decodedBranchName) {
      throw createApiError({
        code: 'bad_request',
        message: 'Source and target branch must differ',
      });
    }

    if (rows.length === 0) {
      return c.json({ success: true, message: 'No rows to revert' });
    }

    const branchFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: decodedBranchName,
    })();
    const targetFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: targetBranch,
    })();

    const rowsNeedingBaseline = rows.filter(
      (r) => r.diffType === 'modified' || r.diffType === 'removed'
    );
    const baselineData = new Map<string, Record<string, unknown>>();

    if (rowsNeedingBaseline.length > 0) {
      await doltCheckout(db)({ branch: targetFullName });
      for (const row of rowsNeedingBaseline) {
        const table = row.table.replace(/^public\./, '');
        const tableObj = manageTableMap[table];
        if (!tableObj) continue;

        const whereCondition = buildDynWhere(tableObj, row.primaryKey);
        const [baselineRow] = await db.select().from(tableObj).where(whereCondition).limit(1);
        if (baselineRow) {
          baselineData.set(`${row.table}:${JSON.stringify(row.primaryKey)}`, baselineRow);
        }
      }
    }

    await doltCheckout(db)({ branch: branchFullName });

    for (const row of rows) {
      const table = row.table.replace(/^public\./, '');
      const tableObj = manageTableMap[table];
      if (!tableObj) continue;

      const whereCondition = buildDynWhere(tableObj, row.primaryKey);

      if (row.diffType === 'added') {
        await db.delete(tableObj).where(whereCondition);
      } else if (row.diffType === 'modified') {
        const baselineRow = baselineData.get(`${row.table}:${JSON.stringify(row.primaryKey)}`);
        if (baselineRow) {
          const pkCols = new Set(managePkMap[table] ?? []);
          const columns = getTableColumns(tableObj) as Record<string, { name: string }>;
          const setData: Record<string, unknown> = {};
          for (const [prop, col] of Object.entries(columns)) {
            if (!pkCols.has(col.name)) {
              setData[prop] = baselineRow[prop as keyof typeof baselineRow];
            }
          }
          await db.update(tableObj).set(setData).where(whereCondition);
        }
      } else if (row.diffType === 'removed') {
        const baselineRow = baselineData.get(`${row.table}:${JSON.stringify(row.primaryKey)}`);
        if (baselineRow) {
          await db.insert(tableObj).values(baselineRow);
        }
      }
    }

    try {
      await doltAddAndCommit(db)({
        message: `Revert ${rows.length} excluded row(s) before merge into ${targetBranch}`,
      });
    } catch {
      logger.info(
        { tenantId, projectId, branchName: decodedBranchName, targetBranch, rowCount: rows.length },
        'No changes to commit (rows may already match target)'
      );
    }

    logger.info(
      { tenantId, projectId, branchName: decodedBranchName, targetBranch, rowCount: rows.length },
      'Reverted excluded rows on improvement branch'
    );

    return c.json({
      success: true,
      message: `Reverted ${rows.length} row(s) on branch "${decodedBranchName}"`,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{branchName}/reject',
    summary: 'Reject Improvement',
    description: 'Reject an improvement proposal and delete the branch.',
    operationId: 'reject-improvement',
    tags: ['Improvements'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ImprovementBranchParamsSchema,
    },
    responses: {
      200: {
        description: 'Improvement rejected and branch deleted',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean(), message: z.string() }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, branchName } = c.req.valid('param');
    const db = c.get('db');

    const decodedBranchName = decodeURIComponent(branchName);

    if (!decodedBranchName.startsWith(IMPROVEMENT_BRANCH_PREFIX)) {
      throw createApiError({
        code: 'bad_request',
        message: 'Not an improvement branch',
      });
    }

    await deleteBranch(db)({ tenantId, projectId, branchName: decodedBranchName, force: true });

    await deleteCoPilotRunByBranchName(runDbClient)({
      scopes: { tenantId, projectId },
      branchName: decodedBranchName,
    }).catch((err: unknown) => {
      logger.warn(
        { err, branchName: decodedBranchName },
        'Failed to delete copilot run after reject'
      );
    });

    return c.json({
      success: true,
      message: `Improvement branch "${decodedBranchName}" rejected and deleted`,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{branchName}/conversation',
    summary: 'Get Improvement Conversation',
    description: 'Get the improvement agent conversation trace for a given improvement branch.',
    operationId: 'get-improvement-conversation',
    tags: ['Improvements'],
    permission: requireProjectPermission('view'),
    request: {
      params: ImprovementBranchParamsSchema,
    },
    responses: {
      200: {
        description: 'Conversation messages from the improvement agent run',
        content: {
          'application/json': {
            schema: z.object({
              conversationIds: z.array(z.string()),
              status: z.string().optional(),
              messages: z.array(
                z.object({
                  role: z.string(),
                  content: z.unknown(),
                  createdAt: z.string().optional(),
                })
              ),
              feedbackItems: z
                .array(
                  z.object({
                    id: z.string(),
                    type: z.string().nullable(),
                    details: z.unknown().nullable(),
                    createdAt: z.string().nullable(),
                  })
                )
                .optional(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, branchName } = c.req.valid('param');
    const decodedBranchName = decodeURIComponent(branchName);

    const run = await getCoPilotRunByBranchName(runDbClient)({
      scopes: { tenantId, projectId },
      branchName: decodedBranchName,
    });

    if (!run) {
      return c.json({ conversationIds: [], status: undefined, messages: [], feedbackItems: undefined });
    }

    const feedbackIds = run.feedbackIds ?? [];

    const feedbackItems =
      feedbackIds.length > 0
        ? await getFeedbackByIds(runDbClient)({
            scopes: { tenantId, projectId },
            feedbackIds,
          }).catch(() => [])
        : [];

    return c.json({
      conversationIds: run.conversationIds ?? [],
      status: run.status,
      messages: [],
      feedbackItems:
        feedbackItems.length > 0
          ? feedbackItems.map((f) => ({
              id: f.id,
              type: f.type,
              details: f.details,
              createdAt: f.createdAt,
            }))
          : undefined,
    });
  }
);

const EvalSummaryItemStatusSchema = z.object({
  total: z.number(),
  completed: z.number(),
  failed: z.number(),
  pending: z.number(),
  running: z.number(),
});

const EvalSummaryResultSchema = z.object({
  id: z.string(),
  evaluatorId: z.string(),
  evaluatorName: z.string(),
  conversationId: z.string(),
  input: z.string().nullable(),
  output: z.unknown().nullable(),
  passed: z.enum(['passed', 'failed', 'no_criteria', 'pending']),
  createdAt: z.string(),
});

const EvalSummaryDatasetRunSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  datasetName: z.string(),
  runConfigName: z.string().nullable(),
  createdAt: z.string(),
  phase: z.enum(['baseline', 'post_change', 'unknown']),
  ref: z.object({ name: z.string(), hash: z.string(), type: z.string() }).nullable(),
  items: EvalSummaryItemStatusSchema,
  evaluationJobConfigId: z.string().nullable(),
  evaluationResults: z.array(EvalSummaryResultSchema),
});

const EvalSummaryResponseSchema = z.object({
  datasetRuns: z.array(EvalSummaryDatasetRunSchema),
});

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{branchName}/eval-summary',
    summary: 'Get Improvement Eval Summary',
    description: 'Get structured evaluation and dataset run data for an improvement branch.',
    operationId: 'get-improvement-eval-summary',
    tags: ['Improvements'],
    permission: requireProjectPermission('view'),
    request: {
      params: ImprovementBranchParamsSchema,
    },
    responses: {
      200: {
        description: 'Evaluation summary for the improvement branch',
        content: {
          'application/json': {
            schema: EvalSummaryResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, branchName } = c.req.valid('param');
    const db = c.get('db');
    const decodedBranchName = decodeURIComponent(branchName);

    if (!decodedBranchName.startsWith(IMPROVEMENT_BRANCH_PREFIX)) {
      throw createApiError({
        code: 'bad_request',
        message: 'Not an improvement branch',
      });
    }

    const allRuns = await listDatasetRuns(runDbClient)({
      scopes: { tenantId, projectId },
    });

    const branchRuns = allRuns.filter((run) => {
      if (!run.ref) return false;
      const refName = (run.ref as { name?: string }).name ?? '';
      return refName.includes(decodedBranchName);
    });

    const improvementBranchFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: decodedBranchName,
    })();
    await doltCheckout(db)({ branch: improvementBranchFullName });

    const datasetRuns = await Promise.all(
      branchRuns.map(async (run) => {
        const [invocations, dataset] = await Promise.all([
          listScheduledTriggerInvocationsByTriggerId(runDbClient)({
            scopes: { tenantId, projectId },
            scheduledTriggerId: run.id,
          }),
          getDatasetById(db)({
            scopes: { tenantId, projectId, datasetId: run.datasetId },
          }).catch(() => null),
        ]);

        const statusCounts = {
          total: invocations.length,
          completed: invocations.filter((i) => i.status === 'completed').length,
          failed: invocations.filter((i) => i.status === 'failed').length,
          pending: invocations.filter((i) => i.status === 'pending').length,
          running: invocations.filter((i) => i.status === 'running').length,
        };

        let evaluationResults: z.infer<typeof EvalSummaryResultSchema>[] = [];

        if (run.evaluationJobConfigId) {
          const jobRuns = await listEvaluationRunsByJobConfigId(runDbClient)({
            scopes: { tenantId, projectId },
            evaluationJobConfigId: run.evaluationJobConfigId,
          });

          const allResults = (
            await Promise.all(
              jobRuns.map((jr) =>
                listEvaluationResultsByRun(runDbClient)({
                  scopes: { tenantId, projectId, evaluationRunId: jr.id },
                })
              )
            )
          ).flat();

          const evaluatorCache = new Map<string, { name: string; passCriteria: unknown }>();

          const uniqueConvIds = [...new Set(allResults.map((r) => r.conversationId))];
          const inputMap = new Map<string, string>();
          await Promise.all(
            uniqueConvIds.map(async (conversationId) => {
              try {
                const messages = await getMessagesByConversation(runDbClient)({
                  scopes: { tenantId, projectId },
                  conversationId,
                  pagination: { page: 1, limit: 10 },
                });
                const firstUser = [...messages].reverse().find((m) => m.role === 'user');
                if (firstUser?.content) {
                  const text =
                    typeof firstUser.content === 'string'
                      ? firstUser.content
                      : (firstUser.content as { text?: string }).text || '';
                  if (text) inputMap.set(conversationId, text);
                }
              } catch {
                // ignore
              }
            })
          );

          evaluationResults = await Promise.all(
            allResults.map(async (result) => {
              let evaluatorInfo = evaluatorCache.get(result.evaluatorId);
              if (!evaluatorInfo) {
                const evaluator = await getEvaluatorById(db)({
                  scopes: { tenantId, projectId, evaluatorId: result.evaluatorId },
                }).catch(() => null);
                evaluatorInfo = {
                  name: evaluator?.name ?? result.evaluatorId,
                  passCriteria: evaluator?.passCriteria ?? null,
                };
                evaluatorCache.set(result.evaluatorId, evaluatorInfo);
              }

              let passed: 'passed' | 'failed' | 'no_criteria' | 'pending' = 'pending';
              if (result.output) {
                const outputData = (result.output as { output?: Record<string, unknown> })?.output;
                const criteria = evaluatorInfo.passCriteria as {
                  operator?: 'and' | 'or';
                  conditions?: Array<{
                    field: string;
                    operator: string;
                    value: number;
                  }>;
                } | null;

                if (outputData && criteria?.conditions?.length) {
                  const allPass =
                    criteria.operator === 'and'
                      ? criteria.conditions.every((cond) => {
                          const val = outputData[cond.field];
                          if (typeof val !== 'number') return false;
                          switch (cond.operator) {
                            case '>':
                              return val > cond.value;
                            case '<':
                              return val < cond.value;
                            case '>=':
                              return val >= cond.value;
                            case '<=':
                              return val <= cond.value;
                            case '=':
                              return val === cond.value;
                            case '!=':
                              return val !== cond.value;
                            default:
                              return false;
                          }
                        })
                      : criteria.conditions.some((cond) => {
                          const val = outputData[cond.field];
                          if (typeof val !== 'number') return false;
                          switch (cond.operator) {
                            case '>':
                              return val > cond.value;
                            case '<':
                              return val < cond.value;
                            case '>=':
                              return val >= cond.value;
                            case '<=':
                              return val <= cond.value;
                            case '=':
                              return val === cond.value;
                            case '!=':
                              return val !== cond.value;
                            default:
                              return false;
                          }
                        });
                  passed = allPass ? 'passed' : 'failed';
                } else if (outputData) {
                  passed = 'no_criteria';
                }
              }

              return {
                id: result.id,
                evaluatorId: result.evaluatorId,
                evaluatorName: evaluatorInfo.name,
                conversationId: result.conversationId,
                input: inputMap.get(result.conversationId) ?? null,
                output: result.output,
                passed,
                createdAt: result.createdAt,
              };
            })
          );
        }

        return {
          id: run.id,
          datasetId: run.datasetId,
          datasetName: dataset?.name ?? run.datasetId,
          datasetCreatedAt: dataset?.createdAt ?? null,
          runConfigName: run.datasetRunConfigId ?? null,
          createdAt: run.createdAt,
          phase: 'unknown' as 'baseline' | 'post_change' | 'unknown',
          ref: run.ref as { name: string; hash: string; type: string } | null,
          items: statusCounts,
          evaluationJobConfigId: run.evaluationJobConfigId ?? null,
          evaluationResults,
        };
      })
    );

    datasetRuns.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const datasetRunsByDataset = new Map<string, typeof datasetRuns>();
    for (const run of datasetRuns) {
      const existing = datasetRunsByDataset.get(run.datasetId) ?? [];
      existing.push(run);
      datasetRunsByDataset.set(run.datasetId, existing);
    }

    for (const runs of datasetRunsByDataset.values()) {
      const hashes = new Set(runs.map((r) => r.ref?.hash).filter(Boolean));
      if (hashes.size <= 1) {
        for (const r of runs) r.phase = 'post_change';
      } else {
        const sorted = [...runs].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const earliestHash = sorted[0]?.ref?.hash;
        for (const r of runs) {
          r.phase = r.ref?.hash === earliestHash ? 'baseline' : 'post_change';
        }
      }
    }

    return c.json({ datasetRuns });
  }
);

const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at']);

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

async function buildImprovementConflictItems(
  db: Parameters<typeof doltPreviewMergeConflicts>[0],
  baseBranch: string,
  mergeBranch: string
): Promise<z.infer<typeof ConflictItemSchema>[]> {
  const summary = await doltPreviewMergeConflictsSummary(db)({ baseBranch, mergeBranch });
  const tablesWithConflicts = summary.filter((t) => t.numDataConflicts > 0);
  const conflicts: z.infer<typeof ConflictItemSchema>[] = [];

  for (const ct of tablesWithConflicts) {
    const rows = await doltPreviewMergeConflicts(db)({
      baseBranch,
      mergeBranch,
      tableName: ct.table,
    });
    const pkColumns = managePkMap[ct.table] ?? [];

    for (const row of rows) {
      const fullPk: Record<string, string> = {};
      for (const col of pkColumns) {
        fullPk[col] = String(row[`base_${col}`] ?? row[`our_${col}`] ?? row[`their_${col}`]);
      }

      const base = extractPrefixedValues(row, 'base_', pkColumns);
      const ours = extractPrefixedValues(row, 'our_', pkColumns);
      const theirs = extractPrefixedValues(row, 'their_', pkColumns);

      if (isTimestampOnlyDiff(base, ours, theirs, row)) continue;

      conflicts.push({
        table: ct.table,
        primaryKey: fullPk,
        ourDiffType: String(row.our_diff_type ?? 'modified'),
        theirDiffType: String(row.their_diff_type ?? 'modified'),
        base: row.base_diff_type === 'added' ? null : base,
        ours: row.our_diff_type === 'removed' ? null : ours,
        theirs: row.their_diff_type === 'removed' ? null : theirs,
      });
    }
  }

  return conflicts;
}

export default app;
