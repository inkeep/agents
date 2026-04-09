import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  deleteBranch,
  doltDiff,
  doltDiffSummary,
  doltGetBranchNamespace,
  doltMerge,
  getConversationHistory,
  listBranches,
  listConversations,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';
import { triggerImprovement } from '../../run/services/ImprovementService';

const IMPROVEMENT_PROJECT_ID = 'improvement-agent';

const logger = getLogger('improvements');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const IMPROVEMENT_BRANCH_PREFIX = 'improvement/';

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

    const branches = await listBranches(db)({ tenantId, projectId });

    const improvements = branches
      .filter((b) => b.baseName.startsWith(IMPROVEMENT_BRANCH_PREFIX))
      .map((b) => {
        const parts = b.baseName.replace(IMPROVEMENT_BRANCH_PREFIX, '').split('/');
        const rawTimestamp = parts[1] ?? '';
        const isoTimestamp = rawTimestamp.replace(
          /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/,
          '$1T$2:$3:$4.$5Z'
        );
        return {
          branchName: b.baseName,
          agentId: parts[0] ?? '',
          timestamp: isoTimestamp || rawTimestamp,
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
            }),
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Improvement triggered',
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
    const { feedbackIds, agentId } = c.req.valid('json');
    const resolvedRef = c.get('resolvedRef');

    const { branchName, conversationId } = await triggerImprovement({
      tenantId,
      projectId,
      agentId,
      feedbackIds,
      resolvedRef,
    });

    return c.json({ branchName, conversationId }, 202);
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

    const summaryRows = await doltDiffSummary(db)({
      fromRevision: targetFullName,
      toRevision: sourceFullName,
    });

    logger.info({ summaryRows, sourceFullName, targetFullName }, 'Diff summary raw rows');

    const summary = summaryRows
      .map((row: any) => {
        const tableName =
          row.table_name ?? row.to_table_name ?? row.from_table_name ?? undefined;
        if (!tableName) return null;
        const name = String(tableName);
        if (EVAL_INFRASTRUCTURE_TABLES.has(name)) return null;
        const dataChange = row.data_change === true || row.data_change === 't' || row.data_change === 1;
        const schemaChange = row.schema_change === true || row.schema_change === 't' || row.schema_change === 1;
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

    return c.json({
      branchName: decodedBranchName,
      summary,
      tables,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{branchName}/merge',
    summary: 'Merge Improvement',
    description: 'Approve and merge an improvement branch into main.',
    operationId: 'merge-improvement',
    tags: ['Improvements'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ImprovementBranchParamsSchema,
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

    await doltMerge(db)({
      fromBranch: sourceFullName,
      toBranch: targetFullName,
      message: `Merge improvement "${decodedBranchName}" into main`,
    });

    return c.json({
      success: true,
      message: `Improvement branch "${decodedBranchName}" merged into main`,
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

    await deleteBranch(db)({ tenantId, projectId, branchName: decodedBranchName });

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
    description:
      'Get the improvement agent conversation trace for a given improvement branch.',
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
      return c.json({ conversationId: null, messages: [] });
    }

    const messages = await getConversationHistory(runDbClient)({
      scopes: { tenantId, projectId: IMPROVEMENT_PROJECT_ID },
      conversationId: match.id,
      options: { limit: 200 },
    });

    return c.json({
      conversationId: match.id,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  }
);

export default app;
