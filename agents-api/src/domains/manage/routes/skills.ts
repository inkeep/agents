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
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.use('/', (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission<{ Variables: ManageAppVariables }>('edit')(c, next);
  }
  return next();
});

app.use('/:id', (c, next) => {
  if (c.req.method === 'PUT') {
    return requireProjectPermission<{ Variables: ManageAppVariables }>('edit')(c, next);
  }
  if (c.req.method === 'DELETE') {
    return requireProjectPermission<{ Variables: ManageAppVariables }>('edit')(c, next);
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
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const result = await listSkills(db)({
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
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const skill = await getSkillById(db)({
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
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const skill = await createSkill(db)({
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
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const skill = await updateSkill(db)({
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
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    const removed = await deleteSkill(db)({
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
