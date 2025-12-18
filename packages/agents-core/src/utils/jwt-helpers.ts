import { jwtVerify, SignJWT } from 'jose';
import { env } from '../env';
import { getLogger } from './logger';

const logger = getLogger('jwt-helpers');

const DEV_SECRET = 'insecure-dev-secret-change-in-production-min-32-chars';

/**
 * Get the JWT signing secret from environment variables.
 * Falls back to an insecure default in non-production environments.
 */
export function getJwtSecret(): Uint8Array {
  const secret = env.INKEEP_AGENTS_JWT_SIGNING_SECRET;

  if (!secret) {
    if (env.ENVIRONMENT === 'production') {
      throw new Error(
        'INKEEP_AGENTS_JWT_SIGNING_SECRET environment variable is required in production'
      );
    }

    logger.warn(
      {},
      'INKEEP_AGENTS_JWT_SIGNING_SECRET not set, using insecure default. DO NOT USE IN PRODUCTION!'
    );
    return new TextEncoder().encode(DEV_SECRET);
  }

  return new TextEncoder().encode(secret);
}

/**
 * Common verification result structure
 */
export interface JwtVerifyResult<T> {
  valid: boolean;
  payload?: T;
  error?: string;
}

/**
 * Options for signing a JWT
 */
export interface SignJwtOptions {
  issuer: string;
  subject: string;
  audience?: string;
  expiresIn?: string;
  claims?: Record<string, unknown>;
}

/**
 * Sign a JWT with the shared secret
 */
export async function signJwt(options: SignJwtOptions): Promise<string> {
  const secret = getJwtSecret();

  const builder = new SignJWT(options.claims || {})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(options.issuer)
    .setSubject(options.subject)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn || '5m');

  if (options.audience) {
    builder.setAudience(options.audience);
  }

  return builder.sign(secret);
}

/**
 * Options for verifying a JWT
 */
export interface VerifyJwtOptions {
  issuer: string;
  audience?: string;
}

/**
 * Verify a JWT and return the raw payload
 */
export async function verifyJwt(
  token: string,
  options: VerifyJwtOptions
): Promise<JwtVerifyResult<Record<string, unknown>>> {
  const secret = getJwtSecret();

  try {
    const verifyOptions: { issuer: string; algorithms: ['HS256']; audience?: string } = {
      issuer: options.issuer,
      algorithms: ['HS256'],
    };

    if (options.audience) {
      verifyOptions.audience = options.audience;
    }

    const { payload } = await jwtVerify(token, secret, verifyOptions);

    return {
      valid: true,
      payload: payload as Record<string, unknown>,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        valid: false,
        error: error.message,
      };
    }

    return {
      valid: false,
      error: 'Token verification failed',
    };
  }
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): {
  token?: string;
  error?: string;
} {
  if (!authHeader) {
    return { error: 'Missing Authorization header' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Invalid Authorization header format. Expected: Bearer <token>' };
  }

  const token = authHeader.substring(7);

  if (!token) {
    return { error: 'Empty token in Authorization header' };
  }

  return { token };
}

/**
 * Decode JWT payload without verification (for checking issuer before full verify)
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Check if a token has a specific issuer (without full verification)
 */
export function hasIssuer(token: string, issuer: string): boolean {
  const payload = decodeJwtPayload(token);
  return payload?.iss === issuer;
}
