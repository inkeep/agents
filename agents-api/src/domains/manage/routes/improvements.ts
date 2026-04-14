import { and, eq, getTableColumns, sql } from 'drizzle-orm';
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
  doltDiffSummary,
  doltGetBranchNamespace,
  doltMerge,
  doltPreviewMergeConflicts,
  doltPreviewMergeConflictsSummary,
  getConversationHistory,
  getDatasetById,
  getEvaluatorById,
  getFeedbackByIds,
  getMessagesByConversation,
  getWorkflowExecutionByConversation,
  listBranches,
  listConversations,
  listDatasetRuns,
  listEvaluationResultsByRun,
  listEvaluationRunsByJobConfigId,
  listScheduledTriggerInvocationsByTriggerId,
  manageFkColumnLinks,
  managePkMap,
  manageTableMap,
  MergeConflictError,
  syncSchemaFromMain,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { prepareImprovement } from '../../run/services/ImprovementService';

const IMPROVEMENT_PROJECT_ID = 'chat-to-edit';

const logger = getLogger('improvements');

function buildDynWhere(tableObj: Parameters<typeof getTableColumns>[0], pk: Record<string, string>) {
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
    agentId: z.string(),
    timestamp: z.string(),
    agentStatus: z.string().optional(),
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
    const db = c.get('db');

    const [branches, { conversations }] = await Promise.all([
      listBranches(db)({ tenantId, projectId }),
      listConversations(runDbClient)({
        scopes: { tenantId, projectId: IMPROVEMENT_PROJECT_ID },
        pagination: { page: 1, limit: 200 },
      }),
    ]);

    const branchConversationMap = new Map<string, string>();
    for (const conv of conversations) {
      const meta = conv.metadata as Record<string, unknown> | null;
      const branch = meta?.improvementBranch as string | undefined;
      if (branch) {
        branchConversationMap.set(branch, conv.id);
      }
    }

    const improvementBranches = branches.filter((b) =>
      b.baseName.startsWith(IMPROVEMENT_BRANCH_PREFIX)
    );

    const workflowStatusMap = new Map<string, string>();
    await Promise.all(
      improvementBranches.map(async (b) => {
        const convId = branchConversationMap.get(b.baseName);
        if (!convId) return;
        const execution = await getWorkflowExecutionByConversation(runDbClient)({
          tenantId,
          projectId: IMPROVEMENT_PROJECT_ID,
          conversationId: convId,
        });
        if (execution?.status) {
          workflowStatusMap.set(b.baseName, execution.status);
        }
      })
    );

    const improvements = improvementBranches
      .map((b) => {
        const afterPrefix = b.baseName.slice(IMPROVEMENT_BRANCH_PREFIX.length);
        const sep = afterPrefix.startsWith('/') ? '/' : '_';
        const parts = afterPrefix.slice(1).split(sep);
        const rawTimestamp = parts.pop() ?? '';
        const isoTimestamp = rawTimestamp.replace(
          /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/,
          '$1T$2:$3:$4.$5Z'
        );
        const agentId = parts.join(sep) === 'project' ? '' : (parts.join(sep) ?? '');
        return {
          branchName: b.baseName,
          agentId,
          timestamp: isoTimestamp || rawTimestamp,
          agentStatus: workflowStatusMap.get(b.baseName),
        };
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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
              agentId: z.string().optional().describe('Optionally scope to a specific agent'),
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
        description: 'Improvement prepared — client should fire the chat API call',
        content: {
          'application/json': {
            schema: z.object({
              branchName: z.string(),
              conversationId: z.string(),
              chatPayload: z.object({
                model: z.string(),
                messages: z.array(z.object({ role: z.string(), content: z.string() })),
                stream: z.boolean(),
                conversationId: z.string(),
              }),
              targetHeaders: z.record(z.string(), z.string()),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { feedbackIds, agentId, additionalContext } = c.req.valid('json');

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

    const resolvedAgentId = agentId ?? (agentIds.size === 1 ? [...agentIds][0] : undefined) ?? undefined;
    const db = c.get('db');

    const result = await prepareImprovement({
      tenantId,
      projectId,
      agentId: resolvedAgentId,
      feedbackIds,
      additionalContext,
      db,
    });

    return c.json(result);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{branchName}/diff',
    summary: 'Get Improvement Diff',
    description:
      'Get the diff between an improvement branch and main, showing what changes would be applied on merge.',
    operationId: 'get-improvement-diff',
    tags: ['Improvements'],
    permission: requireProjectPermission('view'),
    request: {
      params: ImprovementBranchParamsSchema,
    },
    responses: {
      200: {
        description: 'Diff between improvement branch and main',
        content: {
          'application/json': {
            schema: z.object({
              branchName: z.string(),
              summary: z.array(
                z.object({
                  tableName: z.string(),
                  diffType: z.string(),
                  dataChange: z.boolean(),
                  schemaChange: z.boolean(),
                })
              ),
              tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
            }),
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

    const sourceFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: decodedBranchName,
    })();
    const targetFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: 'main',
    })();

    let summaryRows: any[];
    try {
      summaryRows = await doltDiffSummary(db)({
        fromRevision: targetFullName,
        toRevision: sourceFullName,
      });
    } catch (err) {
      logger.warn({ sourceFullName, targetFullName, err }, 'Diff summary query failed — branch may not exist');
      return c.json({
        branchName: decodedBranchName,
        summary: [],
        tables: {},
      });
    }

    logger.info({ summaryRows, sourceFullName, targetFullName }, 'Diff summary raw rows');

    const summary = summaryRows
      .map((row: any) => {
        const tableName = row.table_name ?? row.to_table_name ?? row.from_table_name ?? undefined;
        if (!tableName) return null;
        const name = String(tableName);
        if (EVAL_INFRASTRUCTURE_TABLES.has(name)) return null;
        const dataChange =
          row.data_change === true || row.data_change === 't' || row.data_change === 1;
        const schemaChange =
          row.schema_change === true || row.schema_change === 't' || row.schema_change === 1;
        return {
          tableName: name,
          diffType: String(row.diff_type ?? 'modified'),
          dataChange,
          schemaChange,
        };
      })
      .filter((s: any): s is NonNullable<typeof s> => s !== null);

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
      summary,
      tables,
      fkLinks: relevantFkLinks,
      pkMap: Object.fromEntries(
        [...changedTables].filter((t) => managePkMap[t]).map((t) => [t, managePkMap[t]])
      ),
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{branchName}/merge',
    summary: 'Merge Improvement',
    description:
      'Approve and merge an improvement branch into main. If conflicts exist, returns 409 with conflict details. Re-submit with resolutions to resolve.',
    operationId: 'merge-improvement',
    tags: ['Improvements'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ImprovementBranchParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
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
            schema: z.object({ success: z.boolean(), message: z.string() }),
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

    const sourceFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: decodedBranchName,
    })();
    const targetFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: 'main',
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

    try {
      await doltMerge(db)({
        fromBranch: sourceFullName,
        toBranch: targetFullName,
        message: `Merge improvement "${decodedBranchName}" into main`,
        resolutions,
      });
    } catch (error) {
      if (error instanceof MergeConflictError) {
        const conflicts = await buildImprovementConflictItems(db, targetFullName, sourceFullName);

        throw createApiError({
          code: 'conflict',
          message: `Merge has ${error.conflictCount} conflict(s) that need resolution.`,
          extensions: { conflicts },
        });
      }

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

      throw error;
    }

    return c.json({
      success: true,
      message: `Improvement branch "${decodedBranchName}" merged into main`,
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
      'Revert specific changes on the improvement branch before merging, allowing selective merge.',
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

    const { rows } = c.req.valid('json');
    if (rows.length === 0) {
      return c.json({ success: true, message: 'No rows to revert' });
    }

    const branchFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: decodedBranchName,
    })();
    const mainFullName = doltGetBranchNamespace({
      tenantId,
      projectId,
      branchName: 'main',
    })();

    const rowsNeedingMain = rows.filter(
      (r) => r.diffType === 'modified' || r.diffType === 'removed'
    );
    const mainData = new Map<string, Record<string, unknown>>();

    if (rowsNeedingMain.length > 0) {
      await doltCheckout(db)({ branch: mainFullName });
      for (const row of rowsNeedingMain) {
        const table = row.table.replace(/^public\./, '');
        const tableObj = manageTableMap[table];
        if (!tableObj) continue;

        const whereCondition = buildDynWhere(tableObj, row.primaryKey);
        const [mainRow] = await db.select().from(tableObj).where(whereCondition).limit(1);
        if (mainRow) {
          mainData.set(`${row.table}:${JSON.stringify(row.primaryKey)}`, mainRow);
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
        const mainRow = mainData.get(`${row.table}:${JSON.stringify(row.primaryKey)}`);
        if (mainRow) {
          const pkCols = new Set(managePkMap[table] ?? []);
          const columns = getTableColumns(tableObj) as Record<string, { name: string }>;
          const setData: Record<string, unknown> = {};
          for (const [prop, col] of Object.entries(columns)) {
            if (!pkCols.has(col.name)) {
              setData[prop] = mainRow[prop as keyof typeof mainRow];
            }
          }
          await db.update(tableObj).set(setData).where(whereCondition);
        }
      } else if (row.diffType === 'removed') {
        const mainRow = mainData.get(`${row.table}:${JSON.stringify(row.primaryKey)}`);
        if (mainRow) {
          await db.insert(tableObj).values(mainRow);
        }
      }
    }

    try {
      await doltAddAndCommit(db)({
        message: `Revert ${rows.length} excluded row(s) before merge`,
      });
    } catch {
      logger.info({ tenantId, projectId, branchName: decodedBranchName, rowCount: rows.length }, 'No changes to commit (rows may already match main)');
    }

    logger.info(
      { tenantId, projectId, branchName: decodedBranchName, rowCount: rows.length },
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
              conversationId: z.string().nullable(),
              agentStatus: z.string().optional(),
              messages: z.array(
                z.object({
                  role: z.string(),
                  content: z.unknown(),
                  createdAt: z.string().optional(),
                })
              ),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, branchName } = c.req.valid('param');
    const decodedBranchName = decodeURIComponent(branchName);

    if (!decodedBranchName.startsWith(IMPROVEMENT_BRANCH_PREFIX)) {
      throw createApiError({
        code: 'bad_request',
        message: 'Not an improvement branch',
      });
    }

    const { conversations } = await listConversations(runDbClient)({
      scopes: { tenantId, projectId: IMPROVEMENT_PROJECT_ID },
      pagination: { page: 1, limit: 100 },
    });

    const match = conversations.find((conv) => {
      const meta = conv.metadata as Record<string, unknown> | null;
      return meta?.improvementBranch === decodedBranchName;
    });

    if (!match) {
      return c.json({ conversationId: null, agentStatus: undefined, messages: [] });
    }

    const [messages, execution] = await Promise.all([
      getConversationHistory(runDbClient)({
        scopes: { tenantId, projectId: IMPROVEMENT_PROJECT_ID },
        conversationId: match.id,
        options: { limit: 200 },
      }),
      getWorkflowExecutionByConversation(runDbClient)({
        tenantId,
        projectId: IMPROVEMENT_PROJECT_ID,
        conversationId: match.id,
      }),
    ]);

    return c.json({
      conversationId: match.id,
      agentStatus: execution?.status,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
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
