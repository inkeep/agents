import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AnonymousSessionResponseSchema,
  commonGetErrorResponses,
  createApiError,
  getAppById,
  validateOrigin,
} from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import { createChallenge } from 'altcha-lib';
import { SignJWT } from 'jose';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('run-auth');

const DEV_ANON_SECRET = crypto.randomUUID() + crypto.randomUUID();

export function getAnonJwtSecret(): Uint8Array {
  const secret = env.INKEEP_ANON_JWT_SECRET;

  if (!secret) {
    if (env.ENVIRONMENT !== 'development' && env.ENVIRONMENT !== 'test') {
      throw new Error('INKEEP_ANON_JWT_SECRET environment variable is required');
    }
    logger.warn(
      {},
      'Using random ephemeral secret for anonymous JWTs — set INKEEP_ANON_JWT_SECRET'
    );
    return new TextEncoder().encode(DEV_ANON_SECRET);
  }

  return new TextEncoder().encode(secret);
}

const PowChallengeResponseSchema = z
  .object({
    algorithm: z.string().openapi({ example: 'SHA-256' }),
    challenge: z.string(),
    maxnumber: z.number(),
    salt: z.string(),
    signature: z.string(),
  })
  .openapi('PowChallengeResponse');

const PowDisabledErrorSchema = z
  .object({
    error: z.literal('pow_disabled'),
    message: z.string(),
  })
  .openapi('PowDisabledError');

const app = new OpenAPIHono();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/pow/challenge',
    summary: 'Get PoW Challenge',
    description:
      'Fetch an ALTCHA Proof-of-Work challenge. Returns 404 when PoW is not enabled on the server.',
    operationId: 'get-pow-challenge',
    tags: ['Auth'],
    permission: noAuth(),
    security: [],
    responses: {
      200: {
        description: 'PoW challenge generated successfully',
        content: {
          'application/json': {
            schema: PowChallengeResponseSchema,
          },
        },
      },
      404: {
        description: 'PoW is not enabled',
        content: {
          'application/json': {
            schema: PowDisabledErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const hmacSecret = env.INKEEP_POW_HMAC_SECRET;
    if (!hmacSecret) {
      return c.json({ error: 'pow_disabled' as const, message: 'PoW is not enabled' }, 404);
    }

    const challenge = await createChallenge({
      hmacKey: hmacSecret,
      algorithm: 'SHA-256',
      maxnumber: env.INKEEP_POW_DIFFICULTY,
      expires: new Date(Date.now() + env.INKEEP_POW_CHALLENGE_TTL_SECONDS * 1000),
    });

    return c.json({
      algorithm: challenge.algorithm,
      challenge: challenge.challenge,
      maxnumber: challenge.maxnumber,
      salt: challenge.salt,
      signature: challenge.signature,
    });
  }
);

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

    const appRecord = await getAppById(runDbClient)(appId);

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
      };
    };

    const origin = c.req.header('Origin');
    if (!validateOrigin(origin, config.webClient.allowedDomains)) {
      logger.warn(
        { origin, allowedDomains: config.webClient.allowedDomains, appId: appRecord.id },
        'Anonymous session: origin not allowed'
      );
      throw createApiError({ code: 'forbidden', message: 'Origin not allowed' });
    }

    const anonUserId = `anon_${crypto.randomUUID()}`;
    const lifetimeSeconds = env.INKEEP_ANON_SESSION_LIFETIME_SECONDS;
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
