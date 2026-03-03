import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AnonymousSessionResponseSchema,
  commonGetErrorResponses,
  createApiError,
  extractAppPublicId,
  getAppByPublicId,
  validateOrigin,
} from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import { SignJWT } from 'jose';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('run-auth');

const DEV_ANON_SECRET = 'insecure-anon-dev-secret-change-in-production-32c';

export function getAnonJwtSecret(): Uint8Array {
  const secret = env.INKEEP_ANON_JWT_SECRET;

  if (!secret) {
    if (env.ENVIRONMENT === 'production') {
      throw new Error('INKEEP_ANON_JWT_SECRET environment variable is required in production');
    }
    return new TextEncoder().encode(DEV_ANON_SECRET);
  }

  return new TextEncoder().encode(secret);
}

const app = new OpenAPIHono();

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/apps/{appId}/anonymous-session',
    summary: 'Create Anonymous Session',
    description:
      'Issue an anonymous session JWT for a web_client app. The app must have anonymous access enabled and the Origin must match an allowed domain.',
    operationId: 'create-anonymous-session',
    tags: ['Auth'],
    permission: noAuth(),
    security: [],
    request: {
      params: z.object({
        appId: z.string().describe('App ID (e.g., app_a1b2c3d4e5f6)'),
      }),
    },
    responses: {
      200: {
        description: 'Anonymous session created successfully',
        content: {
          'application/json': {
            schema: AnonymousSessionResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { appId } = c.req.valid('param');

    const publicId = extractAppPublicId(appId);
    if (!publicId) {
      throw createApiError({ code: 'bad_request', message: 'Invalid app ID format' });
    }

    const appRecord = await getAppByPublicId(runDbClient)(publicId);

    if (!appRecord || !appRecord.enabled) {
      throw createApiError({ code: 'not_found', message: 'App not found or disabled' });
    }

    if (appRecord.type !== 'web_client') {
      throw createApiError({
        code: 'bad_request',
        message: 'Anonymous sessions are only available for web_client apps',
      });
    }

    const config = appRecord.config as {
      type: 'web_client';
      webClient: {
        allowedDomains: string[];
        authMode: string;
        anonymousSessionLifetimeSeconds?: number;
      };
    };

    if (
      config.webClient.authMode !== 'anonymous_only' &&
      config.webClient.authMode !== 'anonymous_and_authenticated'
    ) {
      throw createApiError({
        code: 'bad_request',
        message: 'Anonymous access is not enabled for this app',
      });
    }

    const origin = c.req.header('Origin');
    if (!validateOrigin(origin, config.webClient.allowedDomains)) {
      logger.warn(
        { origin, allowedDomains: config.webClient.allowedDomains, appId: appRecord.id },
        'Anonymous session: origin not allowed'
      );
      throw createApiError({ code: 'forbidden', message: 'Origin not allowed' });
    }

    const anonUserId = `anon_${crypto.randomUUID()}`;
    const lifetimeSeconds = config.webClient.anonymousSessionLifetimeSeconds ?? 86400;
    const now = Math.floor(Date.now() / 1000);
    const exp = now + lifetimeSeconds;
    const expiresAt = new Date(exp * 1000).toISOString();

    const secret = getAnonJwtSecret();
    const token = await new SignJWT({
      tid: appRecord.tenantId,
      pid: appRecord.projectId,
      app: appId,
      type: 'anonymous',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(anonUserId)
      .setIssuer('inkeep')
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(secret);

    logger.info(
      {
        appId: appRecord.id,
        appType: appRecord.type,
        origin,
        anonUserId,
      },
      'Anonymous session created'
    );

    return c.json({ token, expiresAt });
  }
);

export default app;
