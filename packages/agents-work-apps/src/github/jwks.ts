import { type CryptoKey, createRemoteJWKSet, type JWSHeaderParameters } from 'jose';
import { getLogger } from '../logger';

const logger = getLogger('github-jwks');

const GITHUB_OIDC_JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type JwksFunction = ReturnType<typeof createRemoteJWKSet>;

interface JwksCache {
  jwks: JwksFunction;
  fetchedAt: number;
}

let jwksCache: JwksCache | null = null;

function createJwksWithLogging(): JwksFunction {
  logger.info({}, 'Creating new JWKS fetch function for GitHub OIDC');
  return createRemoteJWKSet(new URL(GITHUB_OIDC_JWKS_URL), {
    cacheMaxAge: CACHE_TTL_MS,
  });
}

function isCacheExpired(): boolean {
  if (!jwksCache) return true;
  return Date.now() - jwksCache.fetchedAt > CACHE_TTL_MS;
}

function getOrCreateJwksFunction(): JwksFunction {
  if (!jwksCache || isCacheExpired()) {
    jwksCache = {
      jwks: createJwksWithLogging(),
      fetchedAt: Date.now(),
    };
  }
  return jwksCache.jwks;
}

export interface JwksResult {
  success: true;
  key: CryptoKey;
}

export interface JwksError {
  success: false;
  error: string;
}

export type GetJwkResult = JwksResult | JwksError;

export async function getJwkForToken(header: JWSHeaderParameters): Promise<GetJwkResult> {
  const kid = header.kid;

  if (!kid) {
    return {
      success: false,
      error: 'Token is missing key ID (kid) in header',
    };
  }

  try {
    const jwks = getOrCreateJwksFunction();
    const key = await jwks(header);
    logger.debug({ kid }, 'Successfully retrieved JWK for token');
    return { success: true, key };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('no applicable key found')) {
      logger.warn({ kid }, 'Key ID not found in JWKS, refreshing cache');
      jwksCache = null;

      try {
        const freshJwks = getOrCreateJwksFunction();
        const key = await freshJwks(header);
        logger.info({ kid }, 'Successfully retrieved JWK after cache refresh');
        return { success: true, key };
      } catch (retryError) {
        const retryErrorMessage =
          retryError instanceof Error ? retryError.message : 'Unknown error';
        logger.error(
          { kid, error: retryErrorMessage },
          'Failed to retrieve JWK after cache refresh'
        );
        return {
          success: false,
          error: `Key ID '${kid}' not found in GitHub OIDC JWKS`,
        };
      }
    }

    logger.error({ kid, error: errorMessage }, 'Failed to fetch JWKS from GitHub');
    return {
      success: false,
      error: `Failed to fetch GitHub OIDC JWKS: ${errorMessage}`,
    };
  }
}

export function clearJwksCache(): void {
  jwksCache = null;
  logger.debug({}, 'JWKS cache cleared');
}

export function getJwksCacheStatus(): { cached: boolean; expiresIn?: number } {
  if (!jwksCache) {
    return { cached: false };
  }

  const expiresIn = CACHE_TTL_MS - (Date.now() - jwksCache.fetchedAt);
  return {
    cached: true,
    expiresIn: Math.max(0, expiresIn),
  };
}
