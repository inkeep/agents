import { jwtVerify, SignJWT } from 'jose';
import { env } from '../env';
import { getLogger } from './logger';

const logger = getLogger('service-token-auth');

/**
 * Service Token JWT Claims
 */
export interface ServiceTokenPayload {
  /** Issuer - always 'inkeep-agents' */
  iss: string;
  /** Audience - the target agent ID */
  aud: string;
  /** Subject - the origin agent ID */
  sub: string;
  /** Tenant ID - must match for both origin and target agents */
  tenantId: string;
  /** Project ID - must match for both origin and target agents */
  projectId: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp (5 minutes from issue) */
  exp: number;
}

/**
 * Parameters for generating a service token
 */
export interface GenerateServiceTokenParams {
  tenantId: string;
  projectId: string;
  originAgentId: string;
  targetAgentId: string;
}

/**
 * Result of verifying a service token
 */
export interface VerifyServiceTokenResult {
  valid: boolean;
  payload?: ServiceTokenPayload;
  error?: string;
}

/**
 * Get the JWT secret from environment variables
 * Falls back to a default secret in non-production environments (with warning)
 */
function getJwtSecret(): Uint8Array {
  const secret = env.INKEEP_AGENTS_JWT_SIGNING_SECRET;
  const dev_secret = 'insecure-dev-secret-change-in-production-min-32-chars';

  if (!secret) {
    if (env.ENVIRONMENT === 'production') {
      throw new Error(
        'INKEEP_AGENTS_JWT_SIGNING_SECRET environment variable is required in production'
      );
    }

    // Development/test fallback - log warning
    logger.warn(
      {},
      'INKEEP_AGENTS_JWT_SIGNING_SECRET not set, using insecure default. DO NOT USE IN PRODUCTION!'
    );
    return new TextEncoder().encode(dev_secret);
  }

  return new TextEncoder().encode(secret);
}

/**
 * Generate a JWT token for team agent authentication
 * Token expires in 5 minutes
 *
 * @param params - Token generation parameters
 * @returns Signed JWT token string
 */
export async function generateServiceToken(params: GenerateServiceTokenParams): Promise<string> {
  const secret = getJwtSecret();

  try {
    const token = await new SignJWT({
      tenantId: params.tenantId,
      projectId: params.projectId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('inkeep-agents')
      .setSubject(params.originAgentId)
      .setAudience(params.targetAgentId)
      .setIssuedAt()
      .setExpirationTime('5m') // 5 minute expiry
      .sign(secret);

    logger.debug(
      {
        originAgentId: params.originAgentId,
        targetAgentId: params.targetAgentId,
        tenantId: params.tenantId,
      },
      'Generated team agent token'
    );

    return token;
  } catch (error) {
    logger.error({ error }, 'Failed to generate service token');
    throw new Error('Failed to generate service token');
  }
}

/**
 * Verify and decode a service JWT token
 *
 * @param token - JWT token string to verify
 * @returns Verification result with payload if valid
 */
export async function verifyServiceToken(token: string): Promise<VerifyServiceTokenResult> {
  const secret = getJwtSecret();

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'inkeep-agents',
      algorithms: ['HS256'],
    });

    // Validate required claims
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.aud !== 'string' ||
      typeof payload.tenantId !== 'string' ||
      typeof payload.projectId !== 'string'
    ) {
      logger.warn({ payload }, 'Invalid service token: missing required claims');
      return {
        valid: false,
        error: 'Invalid token: missing required claims',
      };
    }

    const validPayload: ServiceTokenPayload = {
      iss: payload.iss as string,
      aud: payload.aud as string,
      sub: payload.sub,
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };

    logger.debug(
      {
        originAgentId: validPayload.sub,
        targetAgentId: validPayload.aud,
        tenantId: validPayload.tenantId,
      },
      'Successfully verified team agent token'
    );

    return {
      valid: true,
      payload: validPayload,
    };
  } catch (error) {
    if (error instanceof Error) {
      logger.warn({ error: error.message }, 'Team agent token verification failed');
      return {
        valid: false,
        error: error.message,
      };
    }

    logger.warn({ error }, 'Team agent token verification failed with unknown error');
    return {
      valid: false,
      error: 'Token verification failed',
    };
  }
}

/**
 * Validate that the token's tenant ID matches the expected tenant
 * This prevents cross-tenant delegation attempts
 *
 * @param payload - Decoded token payload
 * @param expectedTenantId - The tenant ID to validate against
 * @returns true if tenant IDs match, false otherwise
 */
export function validateTenantId(payload: ServiceTokenPayload, expectedTenantId: string): boolean {
  if (payload.tenantId !== expectedTenantId) {
    logger.warn(
      {
        tokenTenantId: payload.tenantId,
        expectedTenantId,
        originAgentId: payload.sub,
        targetAgentId: payload.aud,
      },
      'Cross-tenant delegation attempt detected'
    );
    return false;
  }

  return true;
}

/**
 * Validate that the token's target agent ID matches the expected agent
 *
 * @param payload - Decoded token payload
 * @param expectedTargetAgentId - The agent ID to validate against
 * @returns true if agent IDs match, false otherwise
 */
export function validateTargetAgent(
  payload: ServiceTokenPayload,
  expectedTargetAgentId: string
): boolean {
  if (payload.aud !== expectedTargetAgentId) {
    logger.warn(
      {
        tokenTargetAgentId: payload.aud,
        expectedTargetAgentId,
        originAgentId: payload.sub,
      },
      'Token target agent mismatch'
    );
    return false;
  }

  return true;
}

/**
 * Extract the Authorization header and verify the bearer token
 *
 * @param authHeader - The Authorization header value (e.g., "Bearer <token>")
 * @returns Verification result with payload if valid
 */
export async function verifyAuthorizationHeader(
  authHeader: string | undefined
): Promise<VerifyServiceTokenResult> {
  if (!authHeader) {
    return {
      valid: false,
      error: 'Missing Authorization header',
    };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      error: 'Invalid Authorization header format. Expected: Bearer <token>',
    };
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!token) {
    return {
      valid: false,
      error: 'Empty token in Authorization header',
    };
  }

  return verifyServiceToken(token);
}
