import { StreamableHTTPTransport } from '@hono/mcp';
import {
  createConsoleLogger,
  createMCPServer,
  HeaderForwardingHook,
  InkeepAgentsCore,
  SDKHooks,
  type SDKOptions,
} from '@inkeep/agents-mcp';
import { Hono } from 'hono';
import { errors, jwtVerify } from 'jose';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { getAcceptedAudiences, getOAuthIssuer, getOAuthJwks } from '../../../utils/oauthJwks';
import { mcpWwwAuthenticateHeader } from '../../../utils/oauthProtectedResource';
import { INKEEP_MCP_ALLOWED_TOOLS } from '../mcpAllowedTools';
import { bindTenantId } from '../mcpGlobalParams';
import { INKEEP_MCP_INSTRUCTIONS, setServerInstructions } from '../mcpServerInstructions';
import { augmentToolDescriptions } from '../mcpToolDescriptions';
import { fillMissingToolTitles } from '../mcpToolTitles';

const app = new Hono();
const logger = getLogger('mcp');

/**
 * Headers to forward from incoming requests to downstream API calls.
 * x-forwarded-cookie is mapped to cookie for browser compatibility
 * (browsers don't allow setting Cookie header directly).
 */
const FORWARDED_HEADERS = [
  'x-forwarded-cookie',
  'authorization',
  'cookie',
  'x-inkeep-ref',
] as const;

app.all('/', async (c) => {
  const authHeader = c.req.header('authorization');
  const bearer = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : undefined;
  const hasCookie = Boolean(c.req.header('cookie') || c.req.header('x-forwarded-cookie'));

  // Tenant is bound from the session (the JWT's tenant claim), injected per-call below.
  let sessionTenantId: string | undefined;

  if (bearer && bearer.split('.').length === 3) {
    try {
      const { payload } = await jwtVerify(bearer, getOAuthJwks(), {
        issuer: getOAuthIssuer(),
        audience: getAcceptedAudiences(),
      });
      const tenantClaim = payload['https://inkeep.com/tenantId'];
      if (typeof tenantClaim !== 'string') {
        // A verified JWT should always carry the tenant claim (better-auth stamps it).
        // Treat its absence as a committed failure — consistent with manageAuth, and
        // fail-closed: we never proceed with an unbound tenant.
        return c.json(
          {
            error: 'invalid_token',
            error_description: 'The access token is missing the tenant claim',
          },
          401,
          {
            'WWW-Authenticate': mcpWwwAuthenticateHeader({
              error: 'invalid_token',
              description: 'The access token is missing the tenant claim',
            }),
          }
        );
      }
      sessionTenantId = tenantClaim;
    } catch (err) {
      // Distinguish a client-side token-validation failure (expected, noisy — log at debug)
      // from an operational failure such as a JWKS-endpoint outage (must be visible to
      // diagnose auth outages — log at warn). Without this, a JWKS fetch failure looks
      // identical to a bad signature in the logs.
      const isTokenValidationError =
        err instanceof errors.JWTExpired ||
        err instanceof errors.JWSSignatureVerificationFailed ||
        err instanceof errors.JWTClaimValidationFailed ||
        err instanceof errors.JWKSNoMatchingKey;
      if (isTokenValidationError) {
        logger.debug(
          { error: err instanceof Error ? err.message : err },
          'MCP: invalid bearer JWT'
        );
      } else {
        logger.warn(
          { error: err },
          'MCP: JWT verification failed unexpectedly (possible JWKS-endpoint outage)'
        );
      }
      return c.json(
        { error: 'invalid_token', error_description: 'The access token is invalid or expired' },
        401,
        {
          'WWW-Authenticate': mcpWwwAuthenticateHeader({
            error: 'invalid_token',
            description: 'The access token is invalid or expired',
          }),
        }
      );
    }
  } else if (!bearer && !hasCookie) {
    // No bearer and no cookie — unauthenticated; challenge to begin discovery.
    // NOTE: a present non-JWT bearer (API key, bypass secret, internal service token) is
    // intentionally NOT challenged here — those are valid auth methods the route forwards to
    // downstream auth, which validates them. The route only verifies/binds JWTs.
    return c.json({ error: 'unauthorized', error_description: 'Authentication required' }, 401, {
      'WWW-Authenticate': mcpWwwAuthenticateHeader(),
    });
  }

  const transport = new StreamableHTTPTransport();
  const noOpLogger = createConsoleLogger('error');

  const headersToForward: Record<string, string> = {};
  for (const headerName of FORWARDED_HEADERS) {
    const value = c.req.header(headerName);
    if (value) {
      headersToForward[headerName] = value;
    }
  }

  if (headersToForward['x-forwarded-cookie'] && !headersToForward.cookie) {
    headersToForward.cookie = headersToForward['x-forwarded-cookie'];
  }

  const createSDKWithHeaders = () => {
    const hooks = new SDKHooks();
    hooks.registerBeforeRequestHook(new HeaderForwardingHook(headersToForward));

    // `hooks` is accepted by the constructor (duck-typed) but absent from SDKOptions; the
    // intersection keeps serverURL type-checked instead of widening the whole object to any.
    return new InkeepAgentsCore({
      serverURL: env.INKEEP_AGENTS_API_URL,
      hooks,
    } as SDKOptions & { hooks: SDKHooks });
  };

  const mcpServer = createMCPServer({
    logger: noOpLogger,
    serverURL: env.INKEEP_AGENTS_API_URL,
    getSDK: createSDKWithHeaders,
    allowedTools: [...INKEEP_MCP_ALLOWED_TOOLS],
  });
  fillMissingToolTitles(mcpServer);
  augmentToolDescriptions(mcpServer);
  setServerInstructions(mcpServer, INKEEP_MCP_INSTRUCTIONS);
  if (sessionTenantId) {
    const { expected, injected, hidden } = bindTenantId(mcpServer, sessionTenantId, logger);
    if (injected < expected) {
      // Fail-closed signal: a tenant-scoped tool could not have the session tenant injected
      // (SDK shape drift). Downstream requireTenantAccess still gates, but this should not
      // happen — the tests assert injected === expected against the real registry.
      logger.warn(
        { sessionTenantId, expected, injected, hidden },
        'MCP: not all tenant-scoped tools could be tenant-bound'
      );
    } else {
      logger.debug(
        { sessionTenantId, expected, injected, hidden },
        'MCP: bound tenantId to session'
      );
    }
  } else {
    // No session tenant to bind: either a non-JWT bearer (API key, validated downstream) or a
    // cookie/browser session (tenant resolved downstream). Both expected — verified JWTs
    // without a tenant claim are rejected above, so we never silently proceed unbound.
    logger.debug({ hasCookie }, 'MCP: no session tenant bound here; resolved downstream');
  }

  await mcpServer.server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
