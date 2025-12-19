import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  deleteSubAgentPolicy,
  ErrorResponseSchema,
  getPoliciesForSubAgents,
  getPolicyById,
  getSubAgentById,
  RemovedResponseSchema,
  SubAgentPolicyApiInsertSchema,
  SubAgentPolicyResponse,
  SubAgentPolicyWithIndexArrayResponse,
  TenantProjectAgentParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
  upsertSubAgentPolicy,
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

app.use('/agent/:subAgentId/policy/:policyId', async (c, next) => {
  if (c.req.method === 'DELETE') {
    return requirePermission({ sub_agent: ['delete'] })(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/{subAgentId}',
    summary: 'List Policies for Sub-Agent',
    operationId: 'get-policies-for-subagent',
    tags: ['SubAgent Policies'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'Policies retrieved successfully for sub-agent',
        content: {
          'application/json': {
            schema: SubAgentPolicyWithIndexArrayResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');

    const policies = await getPoliciesForSubAgents(dbClient)({
      scopes: { tenantId, projectId, agentId },
      subAgentIds: [subAgentId],
    });

    return c.json({ data: policies });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Attach Policy to Sub-Agent',
    operationId: 'create-subagent-policy',
    tags: ['SubAgent Policies'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentPolicyApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Policy attached to sub-agent successfully',
        content: {
          'application/json': {
            schema: SubAgentPolicyResponse,
          },
        },
      },
      404: {
        description: 'Sub-agent or policy not found',
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
    const { subAgentId, policyId, index } = c.req.valid('json');

    const [subAgent, policy] = await Promise.all([
      getSubAgentById(dbClient)({ scopes: { tenantId, projectId, agentId }, subAgentId }),
      getPolicyById(dbClient)({ scopes: { tenantId, projectId }, policyId }),
    ]);

    if (!subAgent) {
      throw createApiError({
        code: 'not_found',
        message: `Sub-agent with id '${subAgentId}' not found`,
      });
    }

    if (!policy) {
      throw createApiError({
        code: 'not_found',
        message: `Policy with id '${policyId}' not found`,
      });
    }

    const relation = await upsertSubAgentPolicy(dbClient)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      policyId,
      index,
    });

    return c.json({ data: relation }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/agent/{subAgentId}/policy/{policyId}',
    summary: 'Detach Policy from Sub-Agent',
    operationId: 'delete-subagent-policy',
    tags: ['SubAgent Policies'],
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        subAgentId: z.string(),
        policyId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Policy detached successfully',
        content: {
          'application/json': {
            schema: RemovedResponseSchema,
          },
        },
      },
      404: {
        description: 'Policy relation not found',
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
    const { tenantId, projectId, agentId, subAgentId, policyId } = c.req.valid('param');

    const existingPolicies = await getPoliciesForSubAgents(dbClient)({
      scopes: { tenantId, projectId, agentId },
      subAgentIds: [subAgentId],
    });

    const relation = existingPolicies.find((p) => p.id === policyId);

    if (!relation || !relation.subAgentPolicyId) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub-agent policy relation not found',
      });
    }

    const removed = await deleteSubAgentPolicy(dbClient)({
      scopes: { tenantId, projectId, agentId },
      subAgentPolicyId: relation.subAgentPolicyId,
    });

    if (!removed) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub-agent policy relation not found',
      });
    }

    return c.json({ message: 'Policy detached', removed: true });
  }
);

export default app;
