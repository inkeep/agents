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
