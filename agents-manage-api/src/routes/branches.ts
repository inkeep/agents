import { createRoute } from '@hono/zod-openapi';
import {
  BranchListResponseSchema,
  BranchNameParamsSchema,
  BranchResponseSchema,
  CreateBranchRequestSchema,
  commonGetErrorResponses,
  createApiError,
  createBranch,
  deleteBranch,
  ErrorResponseSchema,
  getBranch,
  listBranches,
  listBranchesForAgent,
  TenantProjectAgentParamsSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';

import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

// List branches for a project
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Branches',
    description: 'List all branches within a project',
    operationId: 'list-branches',
    tags: ['Branches'],
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
  createRoute({
    method: 'get',
    path: '/{branchName}',
    summary: 'Get Branch',
    description: 'Get a single branch by name',
    operationId: 'get-branch',
    tags: ['Branches'],
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
  createRoute({
    method: 'get',
    path: '/agents/{agentId}',
    summary: 'List Branches for Agent',
    description: 'List all branches within a project that contain the agent',
    operationId: 'list-branches-for-agent',
    tags: ['Branches'],
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
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Branch',
    description: 'Create a new branch',
    operationId: 'create-branch',
    tags: ['Branches'],
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

      if (message.includes('already exists')) {
        throw createApiError({
          code: 'conflict',
          message: `Branch '${name}' already exists`,
        });
      }

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
  createRoute({
    method: 'delete',
    path: '/{branchName}',
    summary: 'Delete Branch',
    description: 'Delete a branch. Cannot delete protected branches like main.',
    operationId: 'delete-branch',
    tags: ['Branches'],
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

export default app;
