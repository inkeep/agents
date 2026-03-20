import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createSkill,
  createSkillFileById,
  deleteSkill,
  deleteSkillFileById,
  getSkillByIdWithFiles,
  getSkillFileById,
  listSkills,
  PaginationQueryParamsSchema,
  ResourceIdSchema,
  SKILL_ENTRY_FILE_PATH,
  SkillApiInsertSchema,
  SkillApiUpdateSchema,
  SkillFileApiInsertSchema,
  SkillFileApiUpdateSchema,
  SkillFileResponse,
  SkillListResponse,
  SkillWithFilesResponse,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateSkill,
  updateSkillFileById,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { HTTPException } from 'hono/http-exception';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types';
import {
  type ManageRouteHandler,
  openapiRegisterPutPatchRoutesForLegacy,
} from '../../../utils/openapiDualRoute';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const TenantProjectSkillFileParamsSchema = TenantProjectIdParamsSchema.extend({
  fileId: ResourceIdSchema,
});

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
    method: 'post',
    path: '/{id}/files',
    summary: 'Create Skill File',
    operationId: 'create-skill-file',
    tags: ['Skills'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SkillFileApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Skill file created successfully',
        content: {
          'application/json': {
            schema: SkillFileResponse,
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

    try {
      const file = await createSkillFileById(db)({
        scopes: { tenantId, projectId },
        skillId: id,
        data: body,
      });

      if (!file) {
        throw createApiError({
          code: 'not_found',
          message: 'Skill not found',
        });
      }

      return c.json({ data: file }, 201);
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      if (error instanceof Error) {
        throw createApiError({
          code: error.message.includes('already exists') ? 'conflict' : 'unprocessable_entity',
          message: error.message,
        });
      }

      throw error;
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/files/{fileId}',
    summary: 'Get Skill File',
    operationId: 'get-skill-file',
    tags: ['Skills'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectSkillFileParamsSchema,
    },
    responses: {
      200: {
        description: 'Skill file found',
        content: {
          'application/json': {
            schema: SkillFileResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id, fileId } = c.req.valid('param');
    const file = await getSkillFileById(db)({
      scopes: { tenantId, projectId },
      skillId: id,
      fileId,
    });

    if (!file) {
      throw createApiError({
        code: 'not_found',
        message: 'Skill file not found',
      });
    }

    return c.json({ data: file });
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
  const parsedBody = SkillApiUpdateSchema.parse(body);

  if (!parsedBody.files) {
    throw createApiError({
      code: 'unprocessable_entity',
      message: 'Skill updates must include files',
    });
  }

  const files = parsedBody.files;
  const data = files.some((file) => file.filePath === SKILL_ENTRY_FILE_PATH)
    ? { ...parsedBody, files }
    : { files: [] };

  const skill = await updateSkill(db)({
    scopes: { tenantId, projectId },
    skillId: id,
    data,
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
    method: 'patch',
    path: '/{id}/files/{fileId}',
    summary: 'Update Skill File',
    operationId: 'update-skill-file',
    tags: ['Skills'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectSkillFileParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SkillFileApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Skill file updated successfully',
        content: {
          'application/json': {
            schema: SkillFileResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id, fileId } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      const file = await updateSkillFileById(db)({
        scopes: { tenantId, projectId },
        skillId: id,
        fileId,
        ...body,
      });

      if (!file) {
        throw createApiError({
          code: 'not_found',
          message: 'Skill file not found',
        });
      }

      return c.json({ data: file });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      if (error instanceof z.ZodError) {
        throw createApiError({
          code: 'unprocessable_entity',
          message: 'Invalid skill file payload',
        });
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
