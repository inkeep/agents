import { timingSafeEqual } from 'node:crypto';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  canAppReadCredential,
  canUseProjectStrict,
  getAppById,
  getCredentialReference,
  getCredentialStoreLookupKeyFromRetrievalParams,
  getProjectScopedRef,
  resolveRef,
  SUPPORT_COPILOT_PLATFORMS,
  withRef,
} from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import { jwtVerify } from 'jose';
import manageDbClient from '../../data/db/manageDbClient';
import manageDbPool from '../../data/db/manageDbPool';
import runDbClient from '../../data/db/runDbClient';
import { env } from '../../env';
import { getLogger } from '../../logger';
import type { AppVariables } from '../../types/app';
import { getOAuthIssuer, getOAuthJwks } from '../../utils/oauthJwks';

const logger = getLogger('credential-gateway');

const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

const TokenExchangeBodySchema = z.object({
  grant_type: z.literal(TOKEN_EXCHANGE_GRANT_TYPE),
  subject_token: z.string().min(1),
  subject_token_type: z.literal(ACCESS_TOKEN_TYPE),
  audience: z.string().min(1),
  inkeep_app_id: z.string().startsWith('app_'),
  resource: z.string().optional(),
});

const TokenExchangeResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number(),
  issued_token_type: z.literal(ACCESS_TOKEN_TYPE),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
  error_description: z.string(),
});

function rfc8693Error(status: 401 | 400 | 403 | 502, error: string, errorDescription: string) {
  return {
    status,
    body: { error, error_description: errorDescription },
  };
}

function safeTimingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const app = new OpenAPIHono<{ Variables: AppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/token',
    permission: noAuth(),
    security: [],
    summary: 'Token Exchange (RFC 8693)',
    description:
      'Exchange a user JWT for a third-party credential via RFC 8693 token exchange. Server-to-server only.',
    operationId: 'exchange-credential-gateway-token',
    tags: ['Credential Gateway'],
    request: {
      body: {
        required: true,
        content: {
          'application/x-www-form-urlencoded': {
            schema: TokenExchangeBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Token exchange successful',
        content: { 'application/json': { schema: TokenExchangeResponseSchema } },
      },
      400: {
        description: 'Bad request (invalid_request, invalid_target)',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized (invalid_client, invalid_grant)',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      403: {
        description: 'Forbidden (access_denied)',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      502: {
        description: 'Upstream credential store error',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RFC 8693 handler returns multiple status codes
  (async (c: any) => {
    const body = c.req.valid('form');

    // Step 1: Basic Auth — parse and validate client credentials
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Basic ')) {
      logger.info({ outcome: 'invalid_client', reason: 'missing_header' }, 'Token exchange denied');
      const err = rfc8693Error(401, 'invalid_client', 'Missing or malformed Authorization header');
      return c.json(err.body, err.status);
    }

    const gatewayClientId = env.COPILOT_GATEWAY_CLIENT_ID;
    const gatewayClientSecret = env.COPILOT_GATEWAY_CLIENT_SECRET;

    if (!gatewayClientId || !gatewayClientSecret) {
      logger.warn(
        {},
        'Credential gateway not configured: missing COPILOT_GATEWAY_CLIENT_ID or COPILOT_GATEWAY_CLIENT_SECRET'
      );
      const err = rfc8693Error(401, 'invalid_client', 'Credential gateway not configured');
      return c.json(err.body, err.status);
    }

    let clientId: string;
    let clientSecret: string;
    try {
      const decoded = atob(authHeader.slice(6));
      const colonIdx = decoded.indexOf(':');
      if (colonIdx === -1) throw new Error('No colon');
      clientId = decoded.slice(0, colonIdx);
      clientSecret = decoded.slice(colonIdx + 1);
    } catch {
      logger.info(
        { outcome: 'invalid_client', reason: 'malformed_basic' },
        'Token exchange denied'
      );
      const err = rfc8693Error(401, 'invalid_client', 'Malformed Basic credentials');
      return c.json(err.body, err.status);
    }

    if (
      !safeTimingSafeEqual(clientId, gatewayClientId) ||
      !safeTimingSafeEqual(clientSecret, gatewayClientSecret)
    ) {
      logger.info({ outcome: 'invalid_client' }, 'Token exchange denied');
      const err = rfc8693Error(401, 'invalid_client', 'Invalid client credentials');
      return c.json(err.body, err.status);
    }

    // Step 2: Verify user JWT
    let sub: string;
    let tenantId: string;
    try {
      const result = await jwtVerify(body.subject_token, getOAuthJwks(), {
        issuer: getOAuthIssuer(),
      });
      const payload = result.payload as Record<string, unknown>;
      const jwtSub = payload.sub as string | undefined;
      const azp = payload.azp as string | undefined;
      const jwtTenantId = payload['https://inkeep.com/tenantId'] as string | undefined;

      if (!jwtSub || !jwtTenantId) {
        throw new Error('Missing required claims');
      }

      if (azp !== env.COPILOT_OAUTH_CLIENT_ID) {
        throw new Error('Invalid authorized party');
      }

      sub = jwtSub;
      tenantId = jwtTenantId;
    } catch {
      logger.info({ outcome: 'bad_jwt' }, 'Token exchange denied');
      const err = rfc8693Error(401, 'invalid_grant', 'Invalid or expired subject token');
      return c.json(err.body, err.status);
    }

    // Step 3: Look up app and validate
    const appRecord = await getAppById(runDbClient)(body.inkeep_app_id);

    if (
      !appRecord ||
      appRecord.tenantId !== tenantId ||
      !appRecord.enabled ||
      appRecord.type !== 'support_copilot' ||
      !appRecord.projectId
    ) {
      logger.info(
        { outcome: 'access_denied', userSub: sub, appId: body.inkeep_app_id },
        'Token exchange denied'
      );
      const err = rfc8693Error(403, 'access_denied', 'Access denied');
      return c.json(err.body, err.status);
    }

    const { tenantId: appTenantId, projectId: appProjectId } = appRecord;

    // Step 4: Check project membership
    const canUse = await canUseProjectStrict({
      userId: sub,
      tenantId: appTenantId,
      projectId: appProjectId,
    });

    if (!canUse) {
      logger.info(
        { outcome: 'project_denied', userSub: sub, appId: body.inkeep_app_id },
        'Token exchange denied'
      );
      const err = rfc8693Error(403, 'access_denied', 'Access denied');
      return c.json(err.body, err.status);
    }

    // Step 5: Look up the configured credential for this support_copilot app.
    // The app config declares exactly one platform + credentialReferenceId.
    const supportCopilotConfig =
      appRecord.config?.type === 'support_copilot' ? appRecord.config.supportCopilot : undefined;
    if (!supportCopilotConfig?.platform || !supportCopilotConfig?.credentialReferenceId) {
      logger.info(
        { outcome: 'app_not_configured', userSub: sub, appId: body.inkeep_app_id },
        'Token exchange denied'
      );
      const err = rfc8693Error(403, 'access_denied', 'Access denied');
      return c.json(err.body, err.status);
    }

    if (body.audience !== supportCopilotConfig.platform) {
      logger.info(
        {
          outcome: 'audience_mismatch',
          userSub: sub,
          appId: body.inkeep_app_id,
          audience: body.audience,
          platform: supportCopilotConfig.platform,
        },
        'Token exchange denied'
      );
      const err = rfc8693Error(400, 'invalid_target', 'Audience does not match app configuration');
      return c.json(err.body, err.status);
    }

    const credentialReferenceId = supportCopilotConfig.credentialReferenceId;

    const hasAccess = await canAppReadCredential({
      tenantId: appTenantId,
      projectId: appProjectId,
      credentialReferenceId,
      appId: appRecord.id,
    });
    if (!hasAccess) {
      logger.info(
        {
          outcome: 'credential_denied',
          userSub: sub,
          appId: body.inkeep_app_id,
          credentialReferenceId,
        },
        'Token exchange denied'
      );
      const err = rfc8693Error(403, 'access_denied', 'Access denied');
      return c.json(err.body, err.status);
    }

    // Step 6: Load the credential_reference row (branch-scoped) and resolve Nango
    const projectRef = getProjectScopedRef(appTenantId, appProjectId, 'main');
    const resolvedRef = await resolveRef(manageDbClient)(projectRef);
    if (!resolvedRef) {
      logger.info(
        { outcome: 'project_branch_missing', userSub: sub, appId: body.inkeep_app_id },
        'Token exchange denied'
      );
      const err = rfc8693Error(502, 'server_error', 'Credential unavailable');
      return c.json(err.body, err.status);
    }
    const credRef = await withRef(manageDbPool, resolvedRef, (db) =>
      getCredentialReference(db)({
        scopes: { tenantId: appTenantId, projectId: appProjectId },
        id: credentialReferenceId,
      })
    );
    if (!credRef) {
      logger.warn(
        { outcome: 'credential_missing', credentialReferenceId },
        'Configured credential not found'
      );
      const err = rfc8693Error(502, 'server_error', 'Credential unavailable');
      return c.json(err.body, err.status);
    }
    const credentialStores = c.get('credentialStores');
    const store = credentialStores.get(credRef.credentialStoreId);

    if (!store || !credRef.retrievalParams) {
      logger.warn(
        { outcome: 'nango_error', credentialReferenceId: credRef.id },
        'Credential store not found or missing retrieval params'
      );
      const err = rfc8693Error(502, 'server_error', 'Credential retrieval failed');
      return c.json(err.body, err.status);
    }

    const lookupKey = getCredentialStoreLookupKeyFromRetrievalParams({
      retrievalParams: credRef.retrievalParams as Record<string, unknown>,
      credentialStoreType: store.type,
    });

    if (!lookupKey) {
      logger.warn(
        { outcome: 'nango_error', credentialReferenceId: credRef.id },
        'Could not build credential lookup key'
      );
      const err = rfc8693Error(502, 'server_error', 'Credential retrieval failed');
      return c.json(err.body, err.status);
    }

    let credentialJson: string | null;
    try {
      credentialJson = await store.get(lookupKey);
    } catch (error) {
      logger.warn(
        { outcome: 'nango_error', credentialReferenceId: credRef.id, error },
        'Credential store fetch failed'
      );
      const err = rfc8693Error(502, 'server_error', 'Credential retrieval failed');
      return c.json(err.body, err.status);
    }

    if (!credentialJson) {
      logger.warn(
        { outcome: 'nango_error', credentialReferenceId: credRef.id },
        'Credential store returned null'
      );
      const err = rfc8693Error(502, 'server_error', 'Credential retrieval failed');
      return c.json(err.body, err.status);
    }

    let accessToken: string;
    let expiresIn: number;
    try {
      const parsed = JSON.parse(credentialJson);
      accessToken = parsed.access_token || parsed.token;
      if (!accessToken) {
        throw new Error('No access_token in credential data');
      }
      if (parsed.expires_in) {
        expiresIn = parsed.expires_in;
      } else if (parsed.expiresAt) {
        expiresIn = Math.max(
          0,
          Math.floor((new Date(parsed.expiresAt).getTime() - Date.now()) / 1000)
        );
      } else {
        expiresIn = 3600;
      }
    } catch (error) {
      logger.warn(
        { outcome: 'nango_error', credentialReferenceId: credRef.id, error },
        'Failed to parse credential data'
      );
      const err = rfc8693Error(502, 'server_error', 'Credential retrieval failed');
      return c.json(err.body, err.status);
    }

    logger.info(
      {
        outcome: 'ok',
        clientId: gatewayClientId,
        userSub: sub,
        appId: body.inkeep_app_id,
        credentialReferenceId: credRef.id,
      },
      'Token exchange successful'
    );

    return c.json(
      {
        access_token: accessToken,
        token_type: 'Bearer' as const,
        expires_in: expiresIn,
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token' as const,
      },
      200
    );
  }) as any
);

// ---------------------------------------------------------------------------
// Platform catalog (public discovery endpoint for browser extensions)
// ---------------------------------------------------------------------------

const PageMatcherSchema = z.object({
  pageType: z.string(),
  hostGlob: z.string(),
  pathPattern: z.string(),
});

const PlatformEntrySchema = z.object({
  slug: z.string(),
  label: z.string(),
  credentialRequired: z.boolean(),
  pageMatchers: z.array(PageMatcherSchema),
});

const PlatformCatalogResponseSchema = z.object({
  platforms: z.array(PlatformEntrySchema),
});

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/.well-known/platforms',
    summary: 'Support Copilot platform catalog',
    description:
      'Returns the list of supported platforms along with URL matchers. ' +
      'Consumed by browser extensions to detect the current tab platform and ticket ID. ' +
      'Public — safe to cache.',
    operationId: 'list-credential-gateway-platforms',
    tags: ['Credential Gateway'],
    permission: noAuth(),
    security: [],
    responses: {
      200: {
        description: 'Platform catalog',
        content: { 'application/json': { schema: PlatformCatalogResponseSchema } },
      },
    },
  }),
  ((c: any) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json({ platforms: SUPPORT_COPILOT_PLATFORMS }, 200);
  }) as any
);

export { app as credentialGatewayRoutes };
