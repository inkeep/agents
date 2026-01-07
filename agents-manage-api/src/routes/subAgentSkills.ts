import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  deleteSubAgentSkill,
  ErrorResponseSchema,
  getSkillsForSubAgents,
  getSkillById,
  getSubAgentById,
  RemovedResponseSchema,
  SubAgentSkillApiInsertSchema,
  SubAgentSkillResponse,
  SubAgentSkillWithIndexArrayResponse,
  TenantProjectAgentParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
  upsertSubAgentSkill,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { requirePermission } from '../middleware/require-permission';
import type { BaseAppVariables } from '../types/app';

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requirePermission({ sub_agent: ['create'] })(c, next);
  }
  return next();
});

app.use('/agent/:subAgentId/skill/:skillId', async (c, next) => {
  if (c.req.method === 'DELETE') {
    return requirePermission({ sub_agent: ['delete'] })(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/{subAgentId}',
    summary: 'List Skills for Sub-Agent',
    operationId: 'get-skills-for-subagent',
    tags: ['SubAgent Skills'],
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

    const skills = await getSkillsForSubAgents(dbClient)({
      scopes: { tenantId, projectId, agentId },
      subAgentIds: [subAgentId],
    });

    return c.json({ data: skills });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Attach Skill to Sub-Agent',
    operationId: 'create-subagent-skill',
    tags: ['SubAgent Skills'],
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
      404: {
        description: 'Sub-agent or skill not found',
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
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { subAgentId, skillId, index } = c.req.valid('json');

    const [subAgent, skill] = await Promise.all([
      getSubAgentById(dbClient)({ scopes: { tenantId, projectId, agentId }, subAgentId }),
      getSkillById(dbClient)({ scopes: { tenantId, projectId }, skillId }),
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

    const relation = await upsertSubAgentSkill(dbClient)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      skillId,
      index,
    });

    return c.json({ data: relation }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/agent/{subAgentId}/skill/{skillId}',
    summary: 'Detach Skill from Sub-Agent',
    operationId: 'delete-subagent-skill',
    tags: ['SubAgent Skills'],
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        subAgentId: z.string(),
        skillId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Skill detached successfully',
        content: {
          'application/json': {
            schema: RemovedResponseSchema,
          },
        },
      },
      404: {
        description: 'Skill relation not found',
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
    const { tenantId, projectId, agentId, subAgentId, skillId } = c.req.valid('param');

    const existingSkills = await getSkillsForSubAgents(dbClient)({
      scopes: { tenantId, projectId, agentId },
      subAgentIds: [subAgentId],
    });

    const relation = existingSkills.find((s) => s.id === skillId);

    if (!relation || !relation.subAgentSkillId) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub-agent skill relation not found',
      });
    }

    const removed = await deleteSubAgentSkill(dbClient)({
      scopes: { tenantId, projectId, agentId },
      subAgentSkillId: relation.subAgentSkillId,
    });

    if (!removed) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub-agent skill relation not found',
      });
    }

    return c.json({ message: 'Skill detached', removed: true });
  }
);

export default app;
