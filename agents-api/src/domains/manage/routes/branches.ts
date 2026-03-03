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
