import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  deleteSubAgentSkill,
  getSkillById,
  getSkillsForSubAgents,
  getSubAgentById,
  SubAgentSkillApiInsertSchema,
  SubAgentSkillResponse,
  SubAgentSkillWithIndexArrayResponse,
  TenantProjectAgentParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
  upsertSubAgentSkill,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/agent/{subAgentId}',
    summary: 'List Skills for Sub-Agent',
    operationId: 'get-skills-for-subagent',
    tags: ['Skills'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'Skills retrieved successfully for sub-agent',
        content: {
          'application/json': {
            schema: SubAgentSkillWithIndexArrayResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');
    const db = c.get('db');
    const skills = await getSkillsForSubAgents(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentIds: [subAgentId],
    });

    return c.json({ data: skills });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Attach Skill to Sub-Agent',
    operationId: 'create-subagent-skill',
    tags: ['Skills'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentSkillApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Skill attached to sub-agent successfully',
        content: {
          'application/json': {
            schema: SubAgentSkillResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { subAgentId, skillId, index, alwaysLoaded } = c.req.valid('json');
    const db = c.get('db');
    const [subAgent, skill] = await Promise.all([
      getSubAgentById(db)({ scopes: { tenantId, projectId, agentId }, subAgentId }),
      getSkillById(db)({ scopes: { tenantId, projectId }, skillId }),
    ]);

    if (!subAgent) {
      throw createApiError({
        code: 'not_found',
        message: `Sub-agent with id '${subAgentId}' not found`,
      });
    }

    if (!skill) {
      throw createApiError({
        code: 'not_found',
        message: `Skill with id '${skillId}' not found`,
      });
    }

    const relation = await upsertSubAgentSkill(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      skillId,
      index,
      alwaysLoaded,
    });

    return c.json({ data: relation }, 201);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/agent/{subAgentId}/skill/{skillId}',
    summary: 'Detach Skill from Sub-Agent',
    operationId: 'delete-subagent-skill',
    tags: ['Skills'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        subAgentId: z.string(),
        skillId: z.string(),
      }),
    },
    responses: {
      204: {
        description: 'Skill detached successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, subAgentId, skillId } = c.req.valid('param');
    const db = c.get('db');
    const existingSkills = await getSkillsForSubAgents(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentIds: [subAgentId],
    });

    const relation = existingSkills.find((s) => s.id === skillId);

    if (!relation?.subAgentSkillId) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub-agent skill relation not found',
      });
    }

    const removed = await deleteSubAgentSkill(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentSkillId: relation.subAgentSkillId,
    });

    if (!removed) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub-agent skill relation not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
