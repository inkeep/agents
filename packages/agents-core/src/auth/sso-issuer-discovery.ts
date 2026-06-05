import { DiscoveryError, discoverOIDCConfig } from '@better-auth/sso';
import { APIError } from 'better-auth/api';
import { querySsoProviderById } from '../data-access/runtime/auth';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { getLogger } from '../utils/logger';

const logger = getLogger('sso-issuer-discovery');

const UPDATE_PROVIDER_PATH = '/sso/update-provider';

type OidcEndpointPatch = {
  discoveryEndpoint: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksEndpoint: string;
  userInfoEndpoint?: string;
  tokenEndpointAuthentication?: 'client_secret_basic' | 'client_secret_post';
};

type RediscoveryContext = {
  path: string;
  body: unknown;
  context: { isTrustedOrigin: (url: string) => boolean };
};

function normalizeIssuer(issuer: string): string {
  return issuer.endsWith('/') ? issuer.slice(0, -1) : issuer;
}

function sameOrigin(url: string, issuer: string): boolean {
  try {
    return new URL(url).origin === new URL(issuer).origin;
  } catch {
    return false;
  }
}

/**
 * Re-runs OIDC discovery server-side when an SSO provider's issuer is being
 * changed via `/sso/update-provider`, returning a Better Auth context patch
 * that overwrites the request body's `oidcConfig` with endpoints freshly
 * derived from the new issuer.
 *
 * Why this exists (do not remove without replacing the behavior):
 * `@better-auth/sso`'s update path merges every cached endpoint with
 * `updates.X ?? current.X` and never recomputes them from a changed issuer
 * (the register path does), so the stored discovery/authorization/token/jwks/
 * userinfo endpoints keep pointing at the old IdP and sign-in keeps hitting it.
 * The client cannot fix this: the update schema validates each endpoint as
 * `z.string().url()` (so empty strings to clear stale values are rejected) and
 * a browser fetch of the new issuer's discovery document is subject to CORS.
 * Running discovery here — server-side, at the single update chokepoint —
 * sidesteps both and corrects the stored config eagerly.
 *
 * Returns `undefined` (no-op) for any non-update path, a missing
 * provider/issuer, an unchanged issuer, or a provider that can't be read.
 *
 * @throws APIError(BAD_REQUEST) when discovery against the new issuer fails,
 * mirroring the register path's refusal to persist an unreachable issuer.
 */
export async function maybeRediscoverSsoIssuer(
  ctx: RediscoveryContext,
  dbClient: AgentsRunDatabaseClient
): Promise<{ context: { body: { oidcConfig: OidcEndpointPatch } } } | undefined> {
  if (ctx.path !== UPDATE_PROVIDER_PATH) return undefined;

  const body = ctx.body as { providerId?: unknown; issuer?: unknown } | null | undefined;
  const providerId = typeof body?.providerId === 'string' ? body.providerId : undefined;
  const newIssuer = typeof body?.issuer === 'string' ? body.issuer : undefined;
  if (!providerId || !newIssuer) return undefined;

  let existing: Awaited<ReturnType<ReturnType<typeof querySsoProviderById>>>;
  try {
    existing = await querySsoProviderById(dbClient)(providerId);
  } catch (err) {
    // Never block an edit on a lookup we couldn't complete: fall through and let
    // the plugin handle the update unchanged. Logged so a DB outage that skips
    // re-discovery is diagnosable rather than silent.
    logger.warn({ err, providerId }, 'SSO issuer rediscovery: provider lookup failed; skipping');
    return undefined;
  }

  // Only re-discover when the issuer actually changes.
  if (!existing || normalizeIssuer(existing.issuer) === normalizeIssuer(newIssuer)) {
    return undefined;
  }

  // The new issuer isn't persisted yet, so the request-scoped trusted-origins
  // list doesn't include it. Trust only the issuer the admin is explicitly
  // setting for this one discovery fetch — the same trust register grants a new
  // issuer, scoped to this call.
  const isTrustedOrigin = (url: string) =>
    ctx.context.isTrustedOrigin(url) || sameOrigin(url, newIssuer);

  let hydrated: Awaited<ReturnType<typeof discoverOIDCConfig>>;
  try {
    hydrated = await discoverOIDCConfig({ issuer: newIssuer, isTrustedOrigin });
  } catch (error) {
    logger.warn({ err: error, providerId, issuer: newIssuer }, 'SSO issuer rediscovery failed');
    // Surface the discovery reason for DiscoveryError (user-facing by design);
    // for anything else, return a generic message and keep the cause in the log.
    const detail = error instanceof DiscoveryError ? `: ${error.message}` : '';
    throw new APIError('BAD_REQUEST', {
      message: `OIDC discovery failed for the new issuer "${newIssuer}"${detail}`,
    });
  }

  const oidcConfig: OidcEndpointPatch = {
    discoveryEndpoint: hydrated.discoveryEndpoint,
    authorizationEndpoint: hydrated.authorizationEndpoint,
    tokenEndpoint: hydrated.tokenEndpoint,
    jwksEndpoint: hydrated.jwksEndpoint,
    ...(hydrated.userInfoEndpoint && { userInfoEndpoint: hydrated.userInfoEndpoint }),
    ...(hydrated.tokenEndpointAuthentication && {
      tokenEndpointAuthentication: hydrated.tokenEndpointAuthentication,
    }),
  };

  return { context: { body: { oidcConfig } } };
}
