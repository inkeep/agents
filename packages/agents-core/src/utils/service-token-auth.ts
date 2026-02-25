import { extractBearerToken, type JwtVerifyResult, signJwt, verifyJwt } from './jwt-helpers';
import { getLogger } from './logger';

const logger = getLogger('service-token-auth');

const ISSUER = 'inkeep-agents';

/**
 * Service Token JWT Claims (for agent-to-agent communication)
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
export type VerifyServiceTokenResult = JwtVerifyResult<ServiceTokenPayload>;

/**
 * Generate a JWT token for agent-to-agent authentication.
 * Token expires in 1 hour.
 */
export async function generateServiceToken(params: GenerateServiceTokenParams): Promise<string> {
  try {
    const token = await signJwt({
      issuer: ISSUER,
      subject: params.originAgentId,
      audience: params.targetAgentId,
      expiresIn: '1h',
      claims: {
        tenantId: params.tenantId,
        projectId: params.projectId,
      },
    });

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
 */
export async function verifyServiceToken(token: string): Promise<VerifyServiceTokenResult> {
  const result = await verifyJwt(token, { issuer: ISSUER });

  if (!result.valid || !result.payload) {
    logger.warn({ error: result.error }, 'Team agent token verification failed');
    return {
      valid: false,
      error: result.error,
    };
  }

  const payload = result.payload;

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
    tenantId: payload.tenantId as string,
    projectId: payload.projectId as string,
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
}

/**
 * Validate that the token's tenant ID matches the expected tenant.
 * This prevents cross-tenant delegation attempts.
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
 */
export async function verifyAuthorizationHeader(
  authHeader: string | undefined
): Promise<VerifyServiceTokenResult> {
  const extracted = extractBearerToken(authHeader);

  if (!extracted.token) {
    return {
      valid: false,
      error: extracted.error,
    };
  }

  return verifyServiceToken(extracted.token);
}
