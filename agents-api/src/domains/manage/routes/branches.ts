import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  BranchListResponseSchema,
  BranchNameParamsSchema,
  BranchResponseSchema,
  CreateBranchRequestSchema,
  cascadeDeleteByBranch,
  commonGetErrorResponses,
  createApiError,
  createBranch,
  deleteBranch,
  doltDiff,
  doltDiffSummary,
  doltMerge,
  ErrorResponseSchema,
  getBranch,
  getProjectScopedRef,
  listBranches,
  listBranchesForAgent,
  TenantProjectAgentParamsSchema,
  TenantProjectParamsSchema,
  throwIfUniqueConstraintError,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const logger = getLogger('branches');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

// List branches for a project
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Branches',
    description: 'List all branches within a project',
    operationId: 'list-branches',
    tags: ['Branches'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of branches retrieved successfully',
        content: {
          'application/json': {
            schema: BranchListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');

    const branches = await listBranches(db)({ tenantId, projectId });
    return c.json({ data: branches });
  }
);

// Get a single branch
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{branchName}',
    summary: 'Get Branch',
    description: 'Get a single branch by name',
    operationId: 'get-branch',
    tags: ['Branches'],
    permission: requireProjectPermission('view'),
    request: {
      params: BranchNameParamsSchema,
    },
    responses: {
      200: {
        description: 'Branch found',
        content: {
          'application/json': {
            schema: BranchResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, branchName } = c.req.valid('param');

    const branch = await getBranch(db)({ tenantId, projectId, name: branchName });

    if (!branch) {
      throw createApiError({
        code: 'not_found',
        message: `Branch '${branchName}' not found`,
      });
    }

    return c.json({ data: branch });
  }
);

const BranchDiffItemSchema = z
  .object({
    tableName: z.string(),
    diffType: z.string(),
    dataChange: z.boolean(),
    schemaChange: z.boolean(),
  })
  .openapi('BranchDiffItem');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{branchName}/diff',
    summary: 'Get Branch Diff',
    description: 'Get a summary of changes on a branch compared to main',
    operationId: 'get-branch-diff',
    tags: ['Branches'],
    permission: requireProjectPermission('view'),
    request: {
      params: BranchNameParamsSchema,
    },
    responses: {
      200: {
        description: 'Diff summary retrieved',
        content: {
          'application/json': {
            schema: z.object({ data: z.array(BranchDiffItemSchema) }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, branchName } = c.req.valid('param');

    const branch = await getBranch(db)({ tenantId, projectId, name: branchName });
    if (!branch) {
      throw createApiError({
        code: 'not_found',
        message: `Branch '${branchName}' not found`,
      });
    }

    const mainRef = getProjectScopedRef(tenantId, projectId, 'main');
    const branchRef = getProjectScopedRef(tenantId, projectId, branchName);

    const rows = await doltDiffSummary(db)({
      fromRevision: mainRef,
      toRevision: branchRef,
    });

    const data = rows.map((row: any) => ({
      tableName: row.to_table_name || row.from_table_name,
      diffType: row.diff_type,
      dataChange: row.data_change,
      schemaChange: row.schema_change,
    }));

    return c.json({ data });
  }
);

const TABLE_DISPLAY_NAMES: Record<string, string> = {
  agents: 'Agent',
  sub_agents: 'Sub Agent',
  sub_agent_relations: 'Sub Agent Relation',
  sub_agent_external_agent_relations: 'External Agent Relation',
  sub_agent_team_agent_relations: 'Team Agent Relation',
  sub_agent_tool_relations: 'Tool Relation',
  sub_agent_artifact_components: 'Artifact Component Relation',
  sub_agent_data_components: 'Data Component Relation',
  sub_agent_function_tool_relations: 'Function Tool Relation',
  artifact_components: 'Artifact Component',
  data_components: 'Data Component',
  context_configs: 'Context Config',
  tools: 'Tool',
  function_tools: 'Function Tool',
  functions: 'Function',
  credential_references: 'Credential',
  projects: 'Project',
  triggers: 'Trigger',
  scheduled_triggers: 'Scheduled Trigger',
  dataset: 'Dataset',
  dataset_item: 'Dataset Item',
  evaluators: 'Evaluator',
  external_agents: 'External Agent',
  skills: 'Skill',
  sub_agent_skills: 'Sub Agent Skill',
  dataset_run_config: 'Dataset Run Config',
  dataset_run_config_agent_relations: 'Dataset Run Config Agent',
  evaluation_suite_config: 'Evaluation Suite Config',
  evaluation_run_config: 'Evaluation Run Config',
  evaluation_job_config: 'Evaluation Job Config',
};

const IGNORED_COLUMNS = new Set([
  'tenant_id',
  'project_id',
  'created_at',
  'updated_at',
  'commit',
  'commit_date',
]);

const CODE_FIELDS = new Set([
  'prompt',
  'execute_code',
  'system_message',
  'description',
  'input',
  'expected_output',
  'model_config',
  'config',
]);

function parseDoltDiffRows(rows: any[]): Array<{
  entityId: string;
  entityName: string;
  changeType: string;
  fields: Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
    renderAsCode: boolean;
  }>;
}> {
  return rows.map((row) => {
    const fields: Array<{
      field: string;
      oldValue: string | null;
      newValue: string | null;
      renderAsCode: boolean;
    }> = [];

    const columnNames = new Set<string>();
    for (const key of Object.keys(row)) {
      if (key === 'diff_type') continue;
      const match = key.match(/^(?:from_|to_)(.+)$/);
      if (match) columnNames.add(match[1]);
    }

    for (const col of columnNames) {
      if (IGNORED_COLUMNS.has(col) || col === 'id') continue;
      const oldVal = row[`from_${col}`] ?? null;
      const newVal = row[`to_${col}`] ?? null;
      const oldStr =
        oldVal != null ? (typeof oldVal === 'object' ? JSON.stringify(oldVal, null, 2) : String(oldVal)) : null;
      const newStr =
        newVal != null ? (typeof newVal === 'object' ? JSON.stringify(newVal, null, 2) : String(newVal)) : null;
      if (oldStr === newStr) continue;
      fields.push({
        field: col,
        oldValue: oldStr,
        newValue: newStr,
        renderAsCode: CODE_FIELDS.has(col),
      });
    }

    const entityId = row.to_id || row.from_id || 'unknown';
    const entityName = row.to_name || row.from_name || entityId;

    return {
      entityId,
      entityName,
      changeType: (row.diff_type || 'modified').toLowerCase(),
      fields,
    };
  });
}

const BranchDiffFieldSchema = z.object({
  field: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  renderAsCode: z.boolean(),
});

const BranchDiffChangeSchema = z.object({
  entityId: z.string(),
  entityName: z.string(),
  changeType: z.string(),
  fields: z.array(BranchDiffFieldSchema),
});

const BranchDiffDetailItemSchema = z
  .object({
    tableName: z.string(),
    displayName: z.string(),
    diffType: z.string(),
    changes: z.array(BranchDiffChangeSchema),
  })
  .openapi('BranchDiffDetailItem');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{branchName}/diff/details',
    summary: 'Get Detailed Branch Diff',
    description:
      'Get detailed row-level field diffs for all changed entities on a branch compared to main',
    operationId: 'get-branch-diff-details',
    tags: ['Branches'],
    permission: requireProjectPermission('view'),
    request: {
      params: BranchNameParamsSchema,
    },
    responses: {
      200: {
        description: 'Detailed diff retrieved',
        content: {
          'application/json': {
            schema: z.object({ data: z.array(BranchDiffDetailItemSchema) }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, branchName } = c.req.valid('param');

    const branch = await getBranch(db)({ tenantId, projectId, name: branchName });
    if (!branch) {
      throw createApiError({
        code: 'not_found',
        message: `Branch '${branchName}' not found`,
      });
    }

    const mainRef = getProjectScopedRef(tenantId, projectId, 'main');
    const branchRef = getProjectScopedRef(tenantId, projectId, branchName);

    const summaryRows = await doltDiffSummary(db)({
      fromRevision: mainRef,
      toRevision: branchRef,
    });

    const tablesWithDataChanges = summaryRows.filter((r: any) => r.data_change);

    const data = await Promise.all(
      tablesWithDataChanges.map(async (summaryRow: any) => {
        const rawTableName = summaryRow.to_table_name || summaryRow.from_table_name;
        const tableName = rawTableName.replace(/^public\./, '');
        const diffRows = await doltDiff(db)({
          fromRevision: mainRef,
          toRevision: branchRef,
          tableName,
        });

        const changes = parseDoltDiffRows(diffRows);

        return {
          tableName,
          displayName: TABLE_DISPLAY_NAMES[tableName] || tableName,
          diffType: summaryRow.diff_type,
          changes,
        };
      })
    );

    return c.json({ data: data.filter((d) => d.changes.length > 0) });
  }
);

// List branches for an agent
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/agents/{agentId}',
    summary: 'List Branches for Agent',
    description: 'List all branches within a project that contain the agent',
    operationId: 'list-branches-for-agent',
    tags: ['Branches'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'List of branches retrieved successfully',
        content: {
          'application/json': {
            schema: BranchListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');

    const branches = await listBranchesForAgent(db)({ tenantId, projectId, agentId });
    return c.json({ data: branches });
  }
);

// Create a new branch
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Branch',
    description: 'Create a new branch',
    operationId: 'create-branch',
    tags: ['Branches'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: CreateBranchRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Branch created successfully',
        content: {
          'application/json': {
            schema: BranchResponseSchema,
          },
        },
      },
      409: {
        description: 'Branch already exists',
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
    const { name, from } = c.req.valid('json');

    try {
      const branch = await createBranch(db)({
        tenantId,
        projectId,
        name,
        from,
      });

      return c.json({ data: branch }, 201);
    } catch (error: any) {
      const message = error?.message || 'Unknown error';

      throwIfUniqueConstraintError(error, `Branch '${name}' already exists`);

      if (message.includes('cannot be empty') || message.includes('invalid')) {
        throw createApiError({
          code: 'bad_request',
          message,
        });
      }

      throw error;
    }
  }
);

// Delete a branch
app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{branchName}',
    summary: 'Delete Branch',
    description: 'Delete a branch. Cannot delete protected branches like main.',
    operationId: 'delete-branch',
    tags: ['Branches'],
    permission: requireProjectPermission('edit'),
    request: {
      params: BranchNameParamsSchema,
    },
    responses: {
      204: {
        description: 'Branch deleted successfully',
      },
      ...commonGetErrorResponses,
      403: {
        description: 'Cannot delete protected branch',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, branchName } = c.req.valid('param');

    try {
      // First delete runtime entities associated with this branch
      const fullBranchName = `${tenantId}_${projectId}_${branchName}`;
      await cascadeDeleteByBranch(runDbClient)({
        scopes: { tenantId, projectId },
        fullBranchName,
      });

      // Then delete the branch from the config DB
      await deleteBranch(db)({ tenantId, projectId, name: branchName });
      return c.body(null, 204);
    } catch (error: any) {
      const message = error?.message || 'Unknown error';

      if (message.includes('protected branch')) {
        throw createApiError({
          code: 'forbidden',
          message,
        });
      }

      if (message.includes('not found')) {
        throw createApiError({
          code: 'not_found',
          message: `Branch '${branchName}' not found`,
        });
      }

      throw error;
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{branchName}/merge',
    summary: 'Merge Branch',
    description: 'Merge a branch into the project main branch.',
    operationId: 'merge-branch',
    tags: ['Branches'],
    permission: requireProjectPermission('edit'),
    request: {
      params: BranchNameParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              message: z.string().optional().describe('Optional commit message for the merge'),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Branch merged successfully',
        content: {
          'application/json': {
            schema: z
              .object({
                data: z.object({
                  status: z.enum(['success', 'conflicts']),
                  from: z.string(),
                  to: z.string(),
                  hasConflicts: z.boolean(),
                }),
              })
              .openapi('MergeBranchResponse'),
          },
        },
      },
      409: {
        description: 'Merge has conflicts',
        content: {
          'application/json': {
            schema: z
              .object({
                data: z.object({
                  status: z.literal('conflicts'),
                  from: z.string(),
                  to: z.string(),
                  hasConflicts: z.literal(true),
                  toHead: z.string().optional(),
                }),
              })
              .openapi('MergeBranchConflictResponse'),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, branchName } = c.req.valid('param');
    const { message } = c.req.valid('json');
    const userId = c.get('userId') as string | undefined;
    const userEmail = c.get('userEmail') as string | undefined;

    if (branchName === 'main') {
      throw createApiError({
        code: 'bad_request',
        message: 'Cannot merge main into itself',
      });
    }

    const fullBranchName = getProjectScopedRef(tenantId, projectId, branchName);
    const projectMain = getProjectScopedRef(tenantId, projectId, 'main');

    try {
      const result = await doltMerge(db)({
        fromBranch: fullBranchName,
        toBranch: projectMain,
        message: message || `Merge branch '${branchName}' into main`,
        author: userId ? { name: userId, email: userEmail || 'api@inkeep.com' } : undefined,
      });

      if (result.hasConflicts) {
        logger.warn(
          { tenantId, projectId, branchName, result },
          'Branch merge resulted in conflicts'
        );
        return c.json({ data: result }, 409) as any;
      }

      logger.info({ tenantId, projectId, branchName, result }, 'Branch merged successfully');
      return c.json({ data: result }) as any;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';

      if (errorMessage.includes('not found')) {
        throw createApiError({
          code: 'not_found',
          message: `Branch '${branchName}' not found`,
        });
      }

      throw error;
    }
  }
);

export default app;
