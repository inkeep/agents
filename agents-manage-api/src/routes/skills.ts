import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createSkill,
  deleteSkill,
  getSkillById,
  listSkills,
  PaginationQueryParamsSchema,
  SkillApiInsertSchema,
  SkillApiUpdateSchema,
  SkillListResponse,
  SkillResponse,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateSkill,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { requirePermission } from '../middleware/require-permission';
import type { BaseAppVariables } from '../types/app';
import { speakeasyOffsetLimitPagination } from './shared';

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requirePermission({ policy: ['create'] })(c, next);
  }
  return next();
});

app.use('/:id', async (c, next) => {
  if (c.req.method === 'PUT') {
    return requirePermission({ policy: ['update'] })(c, next);
  }
  if (c.req.method === 'DELETE') {
    return requirePermission({ policy: ['delete'] })(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Skills',
    operationId: 'list-skills',
    tags: ['Skills'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'Skills retrieved successfully',
        content: {
          'application/json': {
            schema: SkillListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const result = await listSkills(dbClient)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
    });

    return c.json(result);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Skill',
    operationId: 'get-skill',
    tags: ['Skills'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Skill found',
        content: {
          'application/json': {
            schema: SkillResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const skill = await getSkillById(dbClient)({
      scopes: { tenantId, projectId },
      skillId: id,
    });

    if (!skill) {
      throw createApiError({
        code: 'not_found',
        message: 'Skill not found',
      });
    }

    return c.json({ data: skill });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Skill',
    operationId: 'create-skill',
    tags: ['Skills'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SkillApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Skill created successfully',
        content: {
          'application/json': {
            schema: SkillResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const skill = await createSkill(dbClient)({
      ...body,
      tenantId,
      projectId,
    });

    return c.json({ data: skill }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Skill',
    operationId: 'update-skill',
    tags: ['Skills'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SkillApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Skill updated successfully',
        content: {
          'application/json': {
            schema: SkillResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const skill = await updateSkill(dbClient)({
      scopes: { tenantId, projectId },
      skillId: id,
      data: body,
    });

    if (!skill) {
      throw createApiError({
        code: 'not_found',
        message: 'Skill not found',
      });
    }

    return c.json({ data: skill });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Skill',
    operationId: 'delete-skill',
    tags: ['Skills'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Skill deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');

    const removed = await deleteSkill(dbClient)({
      scopes: { tenantId, projectId },
      skillId: id,
    });

    if (!removed) {
      throw createApiError({
        code: 'not_found',
        message: 'Skill not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
