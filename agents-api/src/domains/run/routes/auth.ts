import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AnonymousSessionResponseSchema,
  commonGetErrorResponses,
  createApiError,
  errorSchemaFactory,
  getAppById,
  getPoWErrorMessage,
  isSentinelEnabled,
  isSentinelUpstreamUnavailable,
  validateOrigin,
  verifyPoW,
  verifySentinelPayload,
} from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import { HTTPException } from 'hono/http-exception';
import { errors, jwtVerify, SignJWT } from 'jose';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('run-auth');

const DEV_ANON_SECRET = crypto.randomUUID() + crypto.randomUUID();

// Emit the dual-enabled v1+v2 warning at most once per process. Operators need to be aware
// that running both paths simultaneously is a migration-only posture (see the comment block
// at the discriminator in /anonymous-session below for the security implication).
let dualSentinelWarned = false;

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

const app = new OpenAPIHono();

const FORWARDED_HEADERS = [
  'accept',
  'accept-language',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'user-agent',
] as const;

function forwardHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  // Trust only the IP determined by a known upstream proxy (Vercel/Cloudflare/nginx
  // all set x-real-ip). Forwarding the inbound x-forwarded-for verbatim would let
  // any client spoof their IP for Sentinel's per-IP rate-limit and threat scoring,
  // since these routes are noAuth().
  const trustedClientIp = req.headers.get('x-real-ip');
  if (trustedClientIp) headers['x-forwarded-for'] = trustedClientIp;
  return headers;
}

// Sentinel returns relative paths (`/v1/verify`, `/v1/challenge`) in `configuration.verifyUrl`
// and `his.url`. Rewrite them to our proxy paths so the widget calls back through us. The
// app id is threaded through the URL so subsequent proxy calls can re-validate Origin.
function rewriteChallengeUrls(body: unknown, appId: string): void {
  if (!body || typeof body !== 'object') return;
  const obj = body as Record<string, unknown>;
  const appIdParam = `?appId=${encodeURIComponent(appId)}`;

  if (
    obj.configuration &&
    typeof obj.configuration === 'object' &&
    'verifyUrl' in obj.configuration &&
    typeof (obj.configuration as Record<string, unknown>).verifyUrl === 'string'
  ) {
    (obj.configuration as Record<string, unknown>).verifyUrl =
      `/run/auth/challenge/verify${appIdParam}`;
  }

  if (
    obj.his &&
    typeof obj.his === 'object' &&
    'url' in obj.his &&
    typeof (obj.his as Record<string, unknown>).url === 'string'
  ) {
    (obj.his as Record<string, unknown>).url = `/run/auth/challenge${appIdParam}`;
  }
}

function createChallengeUpstreamError(status: number): HTTPException {
  if (status === 429) {
    return createApiError({
      code: 'too_many_requests',
      message: 'Challenge service rate limit exceeded',
    });
  }
  return createApiError({
    code: 'bad_gateway',
    message: 'Challenge service temporarily unavailable',
  });
}

// Look up the app for proxy-route origin validation. Throws 404 if the app doesn't exist
// or is disabled, 403 if the Origin header isn't in the app's allowedDomains.
async function validateProxyOrigin(
  appId: string,
  origin: string | undefined
): Promise<{ id: string; tenantId: string | null }> {
  const appRecord = await getAppById(runDbClient)(appId);
  if (!appRecord || !appRecord.enabled) {
    throw createApiError({ code: 'not_found', message: 'App not found or disabled' });
  }
  if (appRecord.type !== 'web_client') {
    throw createApiError({
      code: 'bad_request',
      message: 'Challenge proxy is only available for web_client apps',
    });
  }
  const config = appRecord.config as {
    type: 'web_client';
    webClient: { allowedDomains: string[] };
  };
  if (!validateOrigin(origin, config.webClient.allowedDomains)) {
    logger.warn(
      { origin, allowedDomains: config.webClient.allowedDomains, appId },
      'Challenge proxy: origin not allowed'
    );
    throw createApiError({ code: 'forbidden', message: 'Origin not allowed' });
  }
  return { id: appRecord.id, tenantId: appRecord.tenantId };
}

// Rate-limiting for the three Sentinel proxy routes (challenge GET/POST, verify POST)
// is enforced by upstream ALTCHA Sentinel itself, not by this proxy. Sentinel applies:
//   - IP-based rate limits via x-forwarded-for (we forward the trusted x-real-ip,
//     see forwardHeaders above)
//   - EDK (Ephemeral Device Key) per-device limits
//   - Threat-intel reputation scoring
// Adding a second rate-limit layer here would mostly duplicate upstream protection.
// Slowloris risk from the 5s timeout is bounded by Node.js's default HTTP keep-alive
// limits; if a flood materializes, the next layer of defense is the deployment-level
// edge (Vercel/Cloudflare/nginx) rate limit, not application middleware.

// Proxy logic shared by the canonical /run/auth/challenge routes and the deprecated
// /run/auth/sentinel/* aliases below. Each returns the upstream JSON body (rewritten,
// for the challenge routes) and throws an HTTPException on any failure.
async function proxyChallengeGet(
  appId: string,
  endpointClass: string | undefined,
  req: Request
): Promise<unknown> {
  const apiKeyId = env.INKEEP_SENTINEL_API_KEY_ID;
  const baseUrl = env.INKEEP_SENTINEL_BASE_URL;
  if (!isSentinelEnabled(apiKeyId) || !baseUrl) {
    throw createApiError({ code: 'not_found', message: 'Challenge service is not enabled' });
  }

  await validateProxyOrigin(appId, req.headers.get('Origin') ?? undefined);

  const upstreamUrl = `${baseUrl}/v1/challenge?apiKey=${encodeURIComponent(apiKeyId)}`;
  const headers = forwardHeaders(req);
  if (endpointClass) {
    headers['x-inkeep-endpoint-class'] = endpointClass;
  }

  try {
    const upstream = await fetch(upstreamUrl, { headers, signal: AbortSignal.timeout(5_000) });
    if (!upstream.ok) {
      logger.warn({ status: upstream.status, appId }, 'Challenge upstream error');
      throw createChallengeUpstreamError(upstream.status);
    }
    const body = await upstream.json();
    rewriteChallengeUrls(body, appId);
    return body;
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Challenge fetch failed'
    );
    throw createApiError({ code: 'bad_gateway', message: 'Challenge service unavailable' });
  }
}

// `rawBody` is read by the route handler via Hono's cache-safe `c.req.text()` (NOT
// `c.req.raw.text()`): the body-parsing middleware in createApp.ts (`app.use('/run/*', ...)`,
// ~line 204) calls `c.req.json()` before these handlers run, consuming the underlying
// request stream. Reading it again off the raw Request throws
// "Body is unusable: Body has already been read" → caught → 502. Hono's HonoRequest
// buffers/re-serializes the body, so the handler reads it safely and passes it in here.
async function proxyChallengePost(appId: string, req: Request, rawBody: string): Promise<unknown> {
  const apiKeyId = env.INKEEP_SENTINEL_API_KEY_ID;
  const baseUrl = env.INKEEP_SENTINEL_BASE_URL;
  if (!isSentinelEnabled(apiKeyId) || !baseUrl) {
    throw createApiError({ code: 'not_found', message: 'Challenge service is not enabled' });
  }

  await validateProxyOrigin(appId, req.headers.get('Origin') ?? undefined);

  const upstreamUrl = `${baseUrl}/v1/challenge?apiKey=${encodeURIComponent(apiKeyId)}`;
  const headers = forwardHeaders(req);
  headers['content-type'] = req.headers.get('content-type') ?? 'application/json';

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(5_000),
    });
    if (!upstream.ok) {
      logger.warn({ status: upstream.status, appId }, 'HIS challenge upstream error');
      throw createChallengeUpstreamError(upstream.status);
    }
    const body = await upstream.json();
    rewriteChallengeUrls(body, appId);
    return body;
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'HIS challenge fetch failed'
    );
    throw createApiError({ code: 'bad_gateway', message: 'Challenge service unavailable' });
  }
}

// See proxyChallengePost above for why `rawBody` is passed in rather than read from `req`.
async function proxyVerify(appId: string, req: Request, rawBody: string): Promise<unknown> {
  const apiKeyId = env.INKEEP_SENTINEL_API_KEY_ID;
  const baseUrl = env.INKEEP_SENTINEL_BASE_URL;
  if (!isSentinelEnabled(apiKeyId) || !baseUrl) {
    throw createApiError({ code: 'not_found', message: 'Challenge service is not enabled' });
  }

  await validateProxyOrigin(appId, req.headers.get('Origin') ?? undefined);

  const upstreamUrl = `${baseUrl}/v1/verify?apiKey=${encodeURIComponent(apiKeyId)}`;
  const headers = forwardHeaders(req);
  headers['content-type'] = req.headers.get('content-type') ?? 'application/json';

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(5_000),
    });
    if (!upstream.ok) {
      logger.warn({ status: upstream.status, appId }, 'Verify upstream error');
      throw createChallengeUpstreamError(upstream.status);
    }
    return await upstream.json();
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Verify fetch failed'
    );
    throw createApiError({ code: 'bad_gateway', message: 'Verification service unavailable' });
  }
}
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/challenge',
    summary: 'Get Challenge',
    description:
      'Proxy to the challenge service. Returns 404 when the challenge service is not configured.',
    operationId: 'get-challenge',
    tags: ['Auth'],
    permission: noAuth(),
    security: [],
    request: {
      query: z.object({
        appId: z.string().openapi({ example: 'app_a1b2c3d4e5f6' }),
        endpointClass: z
          .string()
          .max(32)
          .regex(/^[a-z0-9-]+$/, 'must be lowercase alphanumeric with hyphens')
          .optional()
          .openapi({ example: 'chat' }),
      }),
    },
    responses: {
      200: {
        description: 'Challenge returned',
        content: {
          'application/json': {
            schema: z.any(),
          },
        },
      },
      403: errorSchemaFactory('forbidden', 'Origin not allowed'),
      404: errorSchemaFactory('not_found', 'Challenge service is not enabled or app not found'),
      429: errorSchemaFactory('too_many_requests', 'Challenge service rate limit exceeded'),
      502: errorSchemaFactory('bad_gateway', 'Challenge upstream error'),
    },
  }),
  async (c) => {
    const { appId, endpointClass } = c.req.valid('query');
    const body = await proxyChallengeGet(appId, endpointClass, c.req.raw);
    return c.json(body, 200);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/challenge',
    summary: 'Post Challenge Interaction Data',
    description:
      'Proxy POST to the challenge service (interaction data). Returns 404 when the challenge service is not configured.',
    operationId: 'post-challenge',
    tags: ['Auth'],
    permission: noAuth(),
    security: [],
    request: {
      query: z.object({
        appId: z.string().openapi({ example: 'app_a1b2c3d4e5f6' }),
      }),
    },
    responses: {
      200: {
        description: 'Challenge returned',
        content: {
          'application/json': {
            schema: z.any(),
          },
        },
      },
      403: errorSchemaFactory('forbidden', 'Origin not allowed'),
      404: errorSchemaFactory('not_found', 'Challenge service is not enabled or app not found'),
      429: errorSchemaFactory('too_many_requests', 'Challenge service rate limit exceeded'),
      502: errorSchemaFactory('bad_gateway', 'Challenge upstream error'),
    },
  }),
  async (c) => {
    const { appId } = c.req.valid('query');
    // Read the body via Hono's cache-safe accessor, not c.req.raw.text() (see proxyChallengePost).
    const body = await proxyChallengePost(appId, c.req.raw, await c.req.text());
    return c.json(body, 200);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/challenge/verify',
    summary: 'Verify Challenge Solution',
    description: 'Proxy to the challenge verification endpoint.',
    operationId: 'verify-challenge',
    tags: ['Auth'],
    permission: noAuth(),
    security: [],
    request: {
      query: z.object({
        appId: z.string().openapi({ example: 'app_a1b2c3d4e5f6' }),
      }),
    },
    responses: {
      200: {
        description: 'Challenge verification result',
        content: {
          'application/json': {
            schema: z.any(),
          },
        },
      },
      403: errorSchemaFactory('forbidden', 'Origin not allowed'),
      404: errorSchemaFactory('not_found', 'Challenge service is not enabled or app not found'),
      429: errorSchemaFactory('too_many_requests', 'Challenge service rate limit exceeded'),
      502: errorSchemaFactory('bad_gateway', 'Challenge upstream error'),
    },
  }),
  async (c) => {
    const { appId } = c.req.valid('query');
    // Read the body via Hono's cache-safe accessor, not c.req.raw.text() (see proxyChallengePost).
    const body = await proxyVerify(appId, c.req.raw, await c.req.text());
    return c.json(body, 200);
  }
);

// Deprecated path aliases for embedded widgets that predate the vendor-neutral
// /run/auth/challenge rename (they call /run/auth/sentinel/*). Same handlers, kept off
// the OpenAPI spec. Challenge responses rewrite verifyUrl/his.url to the canonical
// /run/auth/challenge paths, so widgets entering here migrate their follow-up calls
// automatically. Sunset once /sentinel/* traffic drops to ~0.
const requireAppId = (appId: string | undefined): string => {
  if (!appId) throw createApiError({ code: 'bad_request', message: 'appId is required' });
  return appId;
};

app.get('/sentinel/challenge', async (c) => {
  const body = await proxyChallengeGet(
    requireAppId(c.req.query('appId')),
    c.req.query('endpointClass'),
    c.req.raw
  );
  return c.json(body, 200);
});

app.post('/sentinel/challenge', async (c) => {
  const body = await proxyChallengePost(
    requireAppId(c.req.query('appId')),
    c.req.raw,
    await c.req.text()
  );
  return c.json(body, 200);
});

app.post('/sentinel/verify', async (c) => {
  const body = await proxyVerify(requireAppId(c.req.query('appId')), c.req.raw, await c.req.text());
  return c.json(body, 200);
});

// Legacy compatibility: embedded widgets pinned to @inkeep/agents-ui versions that predate the
// pow→sentinel rename call GET /run/auth/pow/challenge and solve a classic ALTCHA proof-of-work.
// We back this with a Sentinel PoW v1 (no-HIS) Security Group, so old widgets keep working without
// a self-hosted PoW secret. Solutions are verified locally in /anonymous-session via verifyPoW
// using the v1 API secret as the HMAC key. New widgets use /run/auth/challenge (PoW v2 + HIS).
// Sunset this route once /pow/challenge traffic from old embeds drops to ~0.
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/pow/challenge',
    summary: 'Get Legacy PoW Challenge',
    description:
      'Compatibility proxy to ALTCHA Sentinel PoW v1 (classic proof-of-work) for embedded widgets predating the Sentinel rename. Returns 404 when Sentinel PoW v1 is not configured.',
    operationId: 'get-pow-challenge',
    tags: ['Auth'],
    permission: noAuth(),
    security: [],
    responses: {
      200: {
        description: 'Legacy PoW challenge returned',
        content: {
          'application/json': {
            schema: z.any(),
          },
        },
      },
      404: errorSchemaFactory('not_found', 'Legacy PoW is not enabled'),
      429: errorSchemaFactory('too_many_requests', 'Challenge service rate limit exceeded'),
      502: errorSchemaFactory('bad_gateway', 'Challenge upstream error'),
    },
  }),
  async (c) => {
    const apiKeyId = env.INKEEP_SENTINEL_V1_API_KEY_ID;
    const baseUrl = env.INKEEP_SENTINEL_BASE_URL;
    if (!isSentinelEnabled(apiKeyId) || !baseUrl) {
      throw createApiError({ code: 'not_found', message: 'Legacy PoW is not enabled' });
    }

    // No appId/Origin validation here, matching the original self-hosted /pow/challenge: issuing
    // a PoW challenge is not a protected action. Bot-protection enforcement happens at session
    // creation (/anonymous-session), which validates appId + Origin and verifies the solution.
    const upstreamUrl = `${baseUrl}/v1/challenge?apiKey=${encodeURIComponent(apiKeyId)}`;
    const headers = forwardHeaders(c.req.raw);

    try {
      const upstream = await fetch(upstreamUrl, {
        headers,
        signal: AbortSignal.timeout(5_000),
      });
      if (!upstream.ok) {
        logger.warn({ status: upstream.status }, 'Legacy PoW challenge upstream error');
        throw createChallengeUpstreamError(upstream.status);
      }
      const body = (await upstream.json()) as Record<string, unknown>;
      // Older widgets read a top-level numeric `expiresAt` (ms) for refresh timing. Sentinel
      // encodes expiry as an `expires=` (seconds) query param inside the salt; surface it so the
      // widget's expiry/refresh logic keeps working.
      if (typeof body.salt === 'string') {
        const expiresSec = new URLSearchParams(body.salt.split('?')[1] ?? '').get('expires');
        // Guard against non-numeric values (malformed upstream salt) — Number('abc')*1000 = NaN,
        // and JSON.stringify(NaN) is null, which would surface to widgets as a missing expiry.
        const expiresMs = expiresSec !== null ? Number(expiresSec) * 1000 : Number.NaN;
        if (Number.isFinite(expiresMs)) body.expiresAt = expiresMs;
      }
      return c.json(body, 200);
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        'Legacy PoW challenge fetch failed'
      );
      throw createApiError({
        code: 'bad_gateway',
        message: 'Challenge service unavailable',
      });
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/apps/{appId}/anonymous-session',
    summary: 'Create Anonymous Session',
    description:
      'Issue an anonymous session JWT for a web_client app. If a valid Bearer token for the same app is provided, the existing anonymous identity is preserved with a fresh expiry (rolling refresh). Otherwise a new identity is created.',
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
        allowAnonymous?: boolean;
      };
    };

    if (config.webClient.allowAnonymous === false) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Anonymous sessions are disabled for this app. Authentication is required.',
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

    const sentinelKeyId = env.INKEEP_SENTINEL_API_KEY_ID;
    const sentinelKeySecret = env.INKEEP_SENTINEL_API_KEY_SECRET;
    const sentinelBaseUrl = env.INKEEP_SENTINEL_BASE_URL;
    const v1KeySecret = env.INKEEP_SENTINEL_V1_API_KEY_SECRET;

    const sentinelV2Enabled =
      isSentinelEnabled(sentinelKeyId) && !!sentinelBaseUrl && !!sentinelKeySecret;
    // Legacy PoW v1 compatibility: solutions are verified locally (altcha-lib) with the v1
    // Security Group's API secret as the HMAC key, so it needs no base URL or upstream call.
    const sentinelV1Enabled = isSentinelEnabled(env.INKEEP_SENTINEL_V1_API_KEY_ID) && !!v1KeySecret;

    // SECURITY: When both paths are enabled, the client chooses which verification runs by
    // shaping the challenge header (object with `payload` string → v2; otherwise → v1). v1
    // performs local HMAC verification with no replay protection and no HIS scoring, so any
    // legitimate v1 solution (or replayed v1 solution within its salt expiry) bypasses HIS
    // entirely. This is intentional only as a migration window: enable v1 alongside v2 long
    // enough for old widget builds to upgrade, then disable v1 by clearing
    // INKEEP_SENTINEL_V1_* env vars. Once v1 is disabled, v1-shaped headers return 400.
    if (sentinelV2Enabled && sentinelV1Enabled && !dualSentinelWarned) {
      dualSentinelWarned = true;
      logger.warn(
        {},
        'Sentinel v1 and v2 are both enabled. Clients choose the verification path by envelope shape; v1 has no replay protection or HIS scoring. Disable INKEEP_SENTINEL_V1_* once legacy widget traffic drops to ~0.'
      );
    }

    if (sentinelV2Enabled || sentinelV1Enabled) {
      const challengeHeader = c.req.header('x-inkeep-challenge-solution');
      if (!challengeHeader) {
        throw createApiError({
          code: 'bad_request',
          message: 'Bot protection challenge solution is required.',
        });
      }

      // Discriminate the two widget envelopes, both base64(JSON(...)) in this header:
      //   v2 (current): btoa(JSON.stringify({ payload }))  → object with a string `payload`
      //   v1 (legacy):  btoa(JSON.stringify(solution))     → raw ALTCHA solution object
      //                 (algorithm/challenge/number/salt/signature — no `payload`)
      let decoded: unknown;
      try {
        decoded = JSON.parse(atob(challengeHeader));
      } catch (err) {
        logger.warn(
          { appId: appRecord.id, error: err instanceof Error ? err.message : String(err) },
          'Bot protection: undecodable challenge solution'
        );
        throw createApiError({
          code: 'bad_request',
          message: 'Bot protection challenge solution is invalid.',
        });
      }

      const v2Payload =
        decoded &&
        typeof decoded === 'object' &&
        typeof (decoded as Record<string, unknown>).payload === 'string'
          ? ((decoded as Record<string, unknown>).payload as string)
          : null;

      if (v2Payload !== null) {
        // ---- PoW v2 / Sentinel (HIS) path ----
        if (!sentinelV2Enabled) {
          throw createApiError({
            code: 'bad_request',
            message: 'Bot protection challenge solution is invalid.',
          });
        }

        // verifySentinelPayload handles its own errors and returns Result types — it never
        // throws. A .catch() here would map programming bugs (TypeError, ReferenceError) to
        // sentinel_network_error, which isSentinelUpstreamUnavailable treats as fail-open —
        // creating the very bypass we're trying to prevent. Let unexpected errors propagate.
        const result = await verifySentinelPayload(
          v2Payload,
          sentinelBaseUrl,
          sentinelKeyId,
          sentinelKeySecret
        );

        logger.info(
          {
            appId: appRecord.id,
            verified: result.ok,
            ...(result.ok
              ? {
                  classification: result.classification,
                  score: result.score,
                  verificationId: result.verificationId,
                }
              : { error: result.error, reason: result.reason }),
          },
          'Sentinel verification'
        );

        if (!result.ok) {
          if (isSentinelUpstreamUnavailable(result.error)) {
            logger.warn(
              { appId: appRecord.id, error: result.error, reason: result.reason },
              'Sentinel upstream unavailable; issuing session without bot verification'
            );
          } else {
            throw createApiError({
              code: 'forbidden',
              message: 'Bot protection verification failed',
            });
          }
        }
      } else {
        // ---- Legacy PoW v1 path (classic ALTCHA proof-of-work, verified locally) ----
        if (!sentinelV1Enabled) {
          throw createApiError({
            code: 'bad_request',
            message: 'Bot protection challenge solution is invalid.',
          });
        }

        const pow = await verifyPoW(c.req.raw, v1KeySecret);
        logger.info(
          { appId: appRecord.id, verified: pow.ok, ...(pow.ok ? {} : { error: pow.error }) },
          'Legacy PoW verification'
        );
        if (!pow.ok) {
          throw createApiError({ code: 'bad_request', message: getPoWErrorMessage(pow.error) });
        }
      }
    }

    const secret = getAnonJwtSecret();
    let anonUserId: string | undefined;
    let refreshTenantId: string | null | undefined;
    let refreshProjectId: string | null | undefined;

    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const bearerToken = authHeader.slice(7);
      try {
        const { payload } = await jwtVerify(bearerToken, secret, {
          issuer: 'inkeep',
          algorithms: ['HS256'],
        });
        if (
          payload.app === appId &&
          payload.type === 'anonymous' &&
          typeof payload.sub === 'string' &&
          payload.sub.startsWith('anon_')
        ) {
          anonUserId = payload.sub;
          refreshTenantId = typeof payload.tid === 'string' ? payload.tid : null;
          refreshProjectId = typeof payload.pid === 'string' ? payload.pid : null;
        } else {
          logger.debug(
            { appId, tokenApp: payload.app, tokenType: payload.type },
            'Anonymous session refresh: token claims mismatch, creating new identity'
          );
        }
      } catch (err) {
        if (err instanceof errors.JWTExpired) {
          logger.debug(
            { appId, error: err.message },
            'Anonymous session refresh: token expired, creating new identity'
          );
        } else {
          logger.debug(
            { appId, error: err instanceof Error ? err.message : String(err) },
            'Anonymous session refresh: invalid token, creating new identity'
          );
        }
      }
    }

    const isRefresh = !!anonUserId;
    if (!anonUserId) {
      anonUserId = `anon_${crypto.randomUUID()}`;
    }

    const tenantId = isRefresh ? (refreshTenantId ?? appRecord.tenantId) : appRecord.tenantId;
    const projectId = isRefresh ? (refreshProjectId ?? appRecord.projectId) : appRecord.projectId;

    const lifetimeSeconds = env.INKEEP_ANON_SESSION_LIFETIME_SECONDS;
    const now = Math.floor(Date.now() / 1000);
    const exp = now + lifetimeSeconds;
    const expiresAt = new Date(exp * 1000).toISOString();

    const token = await new SignJWT({
      tid: tenantId,
      pid: projectId,
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
        isRefresh,
      },
      isRefresh ? 'Anonymous session refreshed' : 'Anonymous session created'
    );

    return c.json({ token, expiresAt });
  }
);

export default app;
