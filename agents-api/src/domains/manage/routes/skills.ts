import { OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createSkill,
  deleteSkill,
  getSkillByIdWithFiles,
  listSkills,
  PaginationQueryParamsSchema,
  SkillApiInsertSchema,
  SkillApiUpdateSchema,
  SkillListResponse,
  SkillWithFilesResponse,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateSkill,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types';
import {
  type ManageRouteHandler,
  openapiRegisterPutPatchRoutesForLegacy,
} from '../../../utils/openapiDualRoute';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Skills',
    operationId: 'list-skills',
    tags: ['Skills'],
    permission: requireProjectPermission('view'),
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
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Skill',
    operationId: 'get-skill',
    tags: ['Skills'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Skill found',
        content: {
          'application/json': {
            schema: SkillWithFilesResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const skill = await getSkillByIdWithFiles(db)({
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
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Skill',
    operationId: 'create-skill',
    tags: ['Skills'],
    permission: requireProjectPermission('edit'),
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
            schema: SkillWithFilesResponse,
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

const updateSkillRouteConfig = {
  path: '/{id}' as const,
  summary: 'Update Skill',
  tags: ['Skills'],
  permission: requireProjectPermission('edit'),
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
          schema: SkillWithFilesResponse,
        },
      },
    },
    ...commonGetErrorResponses,
  },
};

const updateSkillHandler: ManageRouteHandler<typeof updateSkillRouteConfig> = async (c) => {
  const db = c.get('db');
  const { tenantId, projectId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  // let data: {
  //   description: string;
  //   metadata: Record<string, string> | null;
  //   content: string;
  //   files: Array<{ filePath: string; content: string }>;
  // };
  //
  // try {
  //   if (!body.files) {
  //     throw new Error('Skill updates must include files');
  //   }
  //
  //   const transformedBody = body as typeof body & {
  //     name?: string;
  //     description?: string;
  //     metadata?: Record<string, string> | null;
  //     content?: string;
  //   };
  //
  //   const skillName = transformedBody.name;
  //
  //   if (typeof skillName === 'string' && skillName !== id) {
  //     throw new Error(`${SKILL_ENTRY_FILE_PATH} name must match the skill id`);
  //   }
  //
  //   if (transformedBody.description === undefined || transformedBody.content === undefined) {
  //     throw new Error(`Skill updates with files must include ${SKILL_ENTRY_FILE_PATH}`);
  //   }
  //
  //   data = {
  //     description: transformedBody.description,
  //     metadata: transformedBody.metadata ?? null,
  //     content: transformedBody.content,
  //     files: body.files,
  //   };
  // } catch (error) {
  //   throw createApiError({
  //     code: 'unprocessable_entity',
  //     message: error instanceof Error ? error.message : 'Invalid skill update payload',
  //   });
  // }

  const skill = await updateSkill(db)({
    scopes: { tenantId, projectId },
    skillId: id,
    // @ts-expect-error -- fixme
    data: SkillApiUpdateSchema.parse(body),
  });

  if (!skill) {
    throw createApiError({
      code: 'not_found',
      message: 'Skill not found',
    });
  }

  return c.json({ data: skill });
};

openapiRegisterPutPatchRoutesForLegacy(app, updateSkillRouteConfig, updateSkillHandler, {
  operationId: 'update-skill',
});

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Skill',
    operationId: 'delete-skill',
    tags: ['Skills'],
    permission: requireProjectPermission('edit'),
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

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}/files/{fileId}',
    summary: 'Delete Skill File',
    operationId: 'delete-skill-file',
    tags: ['Skills'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectSkillFileParamsSchema,
    },
    responses: {
      204: {
        description: 'Skill file deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id, fileId } = c.req.valid('param');

    try {
      const removed = await deleteSkillFileById(db)({
        scopes: { tenantId, projectId },
        skillId: id,
        fileId,
      });

      if (!removed) {
        throw createApiError({
          code: 'not_found',
          message: 'Skill file not found',
        });
      }

      return c.body(null, 204);
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      if (error instanceof Error) {
        throw createApiError({
          code: 'unprocessable_entity',
          message: error.message,
        });
      }

      throw error;
    }
  }
);

export default app;
