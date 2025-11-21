import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ErrorResponseSchema } from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import type { BaseAppVariables } from '../types/app';
import { createTempApiKey } from '../utils/temp-api-keys';

const logger = getLogger('playgroundToken');

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

const PlaygroundTokenRequestSchema = z.object({
  tenantId: z.string(),
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
    const { tenantId, projectId, agentId } = c.req.valid('json');

    logger.info(
      { userId, tenantId, projectId, agentId },
      'Generating temporary API key for playground'
    );

    const result = await createTempApiKey(dbClient, {
      tenantId,
      projectId,
      agentId,
      userId,
      expiryHours: 1,
    });

    logger.info({ userId, expiresAt: result.expiresAt }, 'Temporary API key generated');

    return c.json(
      {
        apiKey: result.apiKey,
        expiresAt: result.expiresAt,
      },
      200
    );
  }
);

export default app;

