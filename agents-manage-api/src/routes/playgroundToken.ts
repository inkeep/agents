import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createApiError,
  ErrorResponseSchema,
  getAgentById,
  projectExists,
  signTempToken,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import { requirePermission } from '../middleware/require-permission';
import type { BaseAppVariables } from '../types/app';

const logger = getLogger('playgroundToken');

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

// Require agent:create permission
app.use('/', requirePermission({ agent: ['create'] }));

const PlaygroundTokenRequestSchema = z.object({
  projectId: z.string(),
  agentId: z.string(),
});

const PlaygroundTokenResponseSchema = z.object({
  apiKey: z.string().describe('Temporary API key for playground use'),
  expiresAt: z.string().describe('ISO 8601 timestamp when the key expires'),
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Generate temporary API key for playground',
    operationId: 'create-playground-token',
    tags: ['Playground'],
    description:
      'Generates a short-lived API key (1 hour expiry) for authenticated users to access the run-api from the playground',
    security: [{ cookieAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: PlaygroundTokenRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Temporary API key generated successfully',
        content: {
          'application/json': {
            schema: PlaygroundTokenResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized - session required',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const tenantId = c.get('tenantId'); // Set by requireTenantAccess middleware from URL param
    const { projectId, agentId } = c.req.valid('json');

    logger.info(
      { userId, tenantId, projectId, agentId },
      'Generating temporary JWT token for playground'
    );

    // Verify project exists and belongs to the tenant
    const projectExistsCheck = await projectExists(dbClient)({ tenantId, projectId });
    if (!projectExistsCheck) {
      logger.warn({ userId, tenantId, projectId }, 'Project not found or access denied');
      throw createApiError({
        code: 'not_found',
        message: 'Project not found',
      });
    }

    // Verify agent exists and belongs to the project
    const agent = await getAgentById(dbClient)({ scopes: { tenantId, projectId, agentId } });
    if (!agent) {
      logger.warn({ userId, tenantId, projectId, agentId }, 'Agent not found or access denied');
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    if (!env.INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Temporary token signing not configured',
      });
    }

    const privateKeyPem = Buffer.from(env.INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY, 'base64').toString(
      'utf-8'
    );

    const result = await signTempToken(
      privateKeyPem,
      {
        tenantId,
        projectId,
        agentId,
        type: 'temporary',
        initiatedBy: { type: 'user', id: userId },
      },
      userId
    );

    logger.info({ userId, expiresAt: result.expiresAt }, 'Temporary JWT token generated');

    return c.json(
      {
        apiKey: result.token,
        expiresAt: result.expiresAt,
      },
      200
    );
  }
);

export default app;
