import { getInProcessFetch } from '@inkeep/agents-core';
import { createRemoteJWKSet, customFetch } from 'jose';
import { env } from '../env';

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Shared JWKS singleton for verifying OAuth JWTs issued by the local
 * oauthProvider plugin. Lazy-initialized so module imports don't depend
 * on env values at load time.
 */
export function getOAuthJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJwks) {
    const jwksUrl = new URL('/api/auth/jwks', env.INKEEP_AGENTS_API_URL || 'http://localhost:3002');
    cachedJwks = createRemoteJWKSet(jwksUrl, {
      [customFetch]: getInProcessFetch(),
    });
  }
  return cachedJwks;
}

/**
 * Issuer value that the oauthProvider plugin sets on JWTs it issues.
 * Used for defense-in-depth `iss` claim validation in `jwtVerify({ issuer })`.
 */
export function getOAuthIssuer(): string {
  return `${env.INKEEP_AGENTS_API_URL || 'http://localhost:3002'}/api/auth`;
}

/**
 * Audiences this resource server accepts for an RFC 8707 audience-bound token.
 * All of these identify this same resource; we accept every variant because MCP
 * clients normalize the resource indicator inconsistently — some send the API
 * base, some append a trailing slash (e.g. Cursor sends `<base>/`), and some use
 * the most-specific `/mcp` endpoint. Accepting all keeps a single token valid at
 * `/mcp` and when that route forwards it to the manage/run domains.
 *
 * INVARIANT: this triplet must stay in sync with the authorization server's
 * `validAudiences`, which the oauthProvider plugin derives from `config.baseURL`
 * (see `auth.ts`). Both produce `[base, base + '/', base + '/mcp']`, but from
 * independent sources (`INKEEP_AGENTS_API_URL` here vs `config.baseURL` there). A
 * deployment MUST point both at the same origin or the AS will mint tokens this
 * server rejects (or vice versa). Keep the two derivations identical if either changes.
 */
export function getAcceptedAudiences(): string[] {
  const base = (env.INKEEP_AGENTS_API_URL || 'http://localhost:3002').replace(/\/+$/, '');
  return [base, `${base}/`, `${base}/mcp`];
}
