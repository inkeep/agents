import { OpenAPIHono, z } from '@hono/zod-openapi';
import { createApiError, deriveKidFromPublicKey, ErrorResponseSchema } from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import { exportSPKI, importPKCS8, SignJWT } from 'jose';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { sessionAuth } from '../../../middleware/sessionAuth';
import type { AppVariables } from '../../../types/app';

const logger = getLogger('copilotToken');

const app = new OpenAPIHono<{ Variables: AppVariables }>();

app.use('*', sessionAuth());

const CopilotTokenResponseSchema = z.object({
  apiKey: z.string().describe('Temporary JWT for copilot use'),
  expiresAt: z.string().describe('ISO 8601 timestamp when the key expires'),
  appId: z.string().describe('App ID to include as x-inkeep-app-id header'),
});

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Generate temporary JWT for copilot (chat-to-edit)',
    operationId: 'create-copilot-token',
    tags: ['API Keys'],
    description:
      'Generates a short-lived JWT (1 hour) for authenticated users to access the copilot agent. The token is a minimal identity assertion; scope comes from the copilot app record.',
    security: [{ cookieAuth: [] }],
    permission: noAuth(),
    responses: {
      200: {
        description: 'Copilot JWT generated successfully',
        content: {
          'application/json': {
            schema: CopilotTokenResponseSchema,
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

    if (!userId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User not found',
      });
    }

    const copilotAppId = env.INKEEP_COPILOT_APP_ID;
    if (!copilotAppId) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Copilot app not configured',
      });
    }

    if (!env.INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Token signing not configured',
      });
    }

    const privateKeyPem = Buffer.from(env.INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY, 'base64').toString(
      'utf-8'
    );
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');

    const publicKeyPem = env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY
      ? Buffer.from(env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY, 'base64').toString('utf-8')
      : await exportSPKI(privateKey);
    const kid = await deriveKidFromPublicKey(publicKeyPem);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    logger.info({ userId, expiresAt }, 'Copilot JWT token generated');

    return c.json({ apiKey: token, expiresAt, appId: copilotAppId }, 200);
  }
);

export default app;
