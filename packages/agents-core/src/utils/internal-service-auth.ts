import { getLogger } from './logger';
import {
  signJwt,
  verifyJwt,
  extractBearerToken,
  hasIssuer,
  type JwtVerifyResult,
} from './jwt-helpers';

const logger = getLogger('internal-service-auth');

const ISSUER = 'inkeep-agents-internal';

/**
 * Known internal services that can authenticate
 */
export const InternalServices = {
  AGENTS_RUN_API: 'agents-run-api',
} as const;

export type InternalServiceId = (typeof InternalServices)[keyof typeof InternalServices];

/**
 * Internal Service Token JWT Claims (for service-to-service communication)
 */
export interface InternalServiceTokenPayload {
  /** Issuer - always 'inkeep-agents-internal' */
  iss: string;
  /** Subject - the calling service ID */
  sub: InternalServiceId;
  /** Tenant ID scope (optional - for tenant-scoped operations) */
  tenantId?: string;
  /** Project ID scope (optional - for project-scoped operations) */
  projectId?: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
}

/**
 * Parameters for generating an internal service token
 */
export interface GenerateInternalServiceTokenParams {
  serviceId: InternalServiceId;
  /** Optional tenant scope */
  tenantId?: string;
  /** Optional project scope */
  projectId?: string;
  /** Token expiry (default: '5m') */
  expiresIn?: string;
}

/**
 * Result of verifying an internal service token
 */
export type VerifyInternalServiceTokenResult = JwtVerifyResult<InternalServiceTokenPayload>;

/**
 * Generate an internal service token for service-to-service authentication
 */
export async function generateInternalServiceToken(
  params: GenerateInternalServiceTokenParams
): Promise<string> {
  try {
    const claims: Record<string, unknown> = {};

    if (params.tenantId) {
      claims.tenantId = params.tenantId;
    }
    if (params.projectId) {
      claims.projectId = params.projectId;
    }

    const token = await signJwt({
      issuer: ISSUER,
      subject: params.serviceId,
      expiresIn: params.expiresIn || '5m',
      claims,
    });

    logger.debug(
      {
        serviceId: params.serviceId,
        tenantId: params.tenantId,
        projectId: params.projectId,
      },
      'Generated internal service token'
    );

    return token;
  } catch (error) {
    logger.error({ error }, 'Failed to generate internal service token');
    throw new Error('Failed to generate internal service token');
  }
}

/**
 * Verify and decode an internal service token
 */
export async function verifyInternalServiceToken(
  token: string
): Promise<VerifyInternalServiceTokenResult> {
  const result = await verifyJwt(token, { issuer: ISSUER });

  if (!result.valid || !result.payload) {
    logger.warn({ error: result.error }, 'Internal service token verification failed');
    return {
      valid: false,
      error: result.error,
    };
  }

  const payload = result.payload;

  // Validate required claims
  if (typeof payload.sub !== 'string') {
    logger.warn({ payload }, 'Invalid internal service token: missing subject');
    return {
      valid: false,
      error: 'Invalid token: missing service identifier',
    };
  }

  // Validate service ID is known
  const validServiceIds = Object.values(InternalServices);
  if (!validServiceIds.includes(payload.sub as InternalServiceId)) {
    logger.warn({ serviceId: payload.sub }, 'Unknown service identifier in token');
    return {
      valid: false,
      error: `Unknown service identifier: ${payload.sub}`,
    };
  }

  const validPayload: InternalServiceTokenPayload = {
    iss: payload.iss as string,
    sub: payload.sub as InternalServiceId,
    tenantId: payload.tenantId as string | undefined,
    projectId: payload.projectId as string | undefined,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };

  logger.debug(
    {
      serviceId: validPayload.sub,
      tenantId: validPayload.tenantId,
      projectId: validPayload.projectId,
    },
    'Successfully verified internal service token'
  );

  return {
    valid: true,
    payload: validPayload,
  };
}

/**
 * Extract and verify an internal service token from Authorization header
 */
export async function verifyInternalServiceAuthHeader(
  authHeader: string | undefined
): Promise<VerifyInternalServiceTokenResult> {
  const extracted = extractBearerToken(authHeader);

  if (!extracted.token) {
    return {
      valid: false,
      error: extracted.error,
    };
  }

  return verifyInternalServiceToken(extracted.token);
}

/**
 * Check if a token is an internal service token (vs user/agent token)
 * by checking the issuer claim without full verification
 */
export function isInternalServiceToken(token: string): boolean {
  return hasIssuer(token, ISSUER);
}

/**
 * Validate that the token has access to the specified tenant.
 * If token has no tenantId claim, it has access to all tenants (superuser service).
 */
export function validateInternalServiceTenantAccess(
  payload: InternalServiceTokenPayload,
  tenantId: string
): boolean {
  // No tenant scope = access to all tenants
  if (!payload.tenantId) {
    return true;
  }

  if (payload.tenantId !== tenantId) {
    logger.warn(
      {
        tokenTenantId: payload.tenantId,
        requestedTenantId: tenantId,
        serviceId: payload.sub,
      },
      'Internal service token tenant mismatch'
    );
    return false;
  }

  return true;
}

/**
 * Validate that the token has access to the specified project.
 * If token has no projectId claim, it has access to all projects in the allowed tenant(s).
 */
export function validateInternalServiceProjectAccess(
  payload: InternalServiceTokenPayload,
  projectId: string
): boolean {
  // No project scope = access to all projects
  if (!payload.projectId) {
    return true;
  }

  if (payload.projectId !== projectId) {
    logger.warn(
      {
        tokenProjectId: payload.projectId,
        requestedProjectId: projectId,
        serviceId: payload.sub,
      },
      'Internal service token project mismatch'
    );
    return false;
  }

  return true;
}
