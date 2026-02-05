import { decodeProtectedHeader, errors, jwtVerify, type ProtectedHeaderParameters } from 'jose';
import { getLogger } from '../logger';
import { getJwkForToken } from './jwks';

const logger = getLogger('github-oidc-token');

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const EXPECTED_AUDIENCE = 'inkeep-agents-action';

export interface GitHubOidcClaims {
  repository: string;
  repository_owner: string;
  repository_id: string;
  workflow: string;
  actor: string;
  ref: string;
}

export interface ValidateTokenResult {
  success: true;
  claims: GitHubOidcClaims;
}

export interface ValidateTokenError {
  success: false;
  errorType:
    | 'invalid_signature'
    | 'expired'
    | 'wrong_issuer'
    | 'wrong_audience'
    | 'malformed'
    | 'jwks_error';
  message: string;
}

export type ValidateOidcTokenResult = ValidateTokenResult | ValidateTokenError;

export async function validateOidcToken(token: string): Promise<ValidateOidcTokenResult> {
  let header: ProtectedHeaderParameters;
  try {
    header = decodeProtectedHeader(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: message }, 'Failed to decode JWT header');
    return {
      success: false,
      errorType: 'malformed',
      message: 'Invalid JWT format: unable to decode token header',
    };
  }

  if (header.alg !== 'RS256') {
    logger.warn({ algorithm: header.alg }, 'Unexpected JWT algorithm');
    return {
      success: false,
      errorType: 'malformed',
      message: `Invalid JWT algorithm: expected RS256, got ${header.alg}`,
    };
  }

  const jwkResult = await getJwkForToken(header);
  if (!jwkResult.success) {
    logger.error({ error: jwkResult.error }, 'Failed to get JWK for token');
    return {
      success: false,
      errorType: 'jwks_error',
      message: jwkResult.error,
    };
  }

  try {
    const { payload } = await jwtVerify(token, jwkResult.key, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: EXPECTED_AUDIENCE,
    });

    const repository = payload.repository;
    const repositoryOwner = payload.repository_owner;
    const repositoryId = payload.repository_id;
    const workflow = payload.workflow;
    const actor = payload.actor;
    const ref = payload.ref;

    if (
      typeof repository !== 'string' ||
      typeof repositoryOwner !== 'string' ||
      typeof repositoryId !== 'string' ||
      typeof workflow !== 'string' ||
      typeof actor !== 'string' ||
      typeof ref !== 'string'
    ) {
      logger.warn({ payload }, 'OIDC token missing required claims');
      return {
        success: false,
        errorType: 'malformed',
        message:
          'OIDC token missing required claims: repository, repository_owner, repository_id, workflow, actor, or ref',
      };
    }

    logger.info({ repository, actor }, 'Successfully validated OIDC token');

    return {
      success: true,
      claims: {
        repository,
        repository_owner: repositoryOwner,
        repository_id: repositoryId,
        workflow,
        actor,
        ref,
      },
    };
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      logger.warn({}, 'OIDC token has expired');
      return {
        success: false,
        errorType: 'expired',
        message: 'OIDC token has expired',
      };
    }

    if (error instanceof errors.JWTClaimValidationFailed) {
      const claimError = error as errors.JWTClaimValidationFailed;
      if (claimError.claim === 'iss') {
        logger.warn({ issuer: claimError.reason }, 'Invalid OIDC token issuer');
        return {
          success: false,
          errorType: 'wrong_issuer',
          message: `Invalid token issuer: expected ${GITHUB_OIDC_ISSUER}`,
        };
      }
      if (claimError.claim === 'aud') {
        logger.warn({ audience: claimError.reason }, 'Invalid OIDC token audience');
        return {
          success: false,
          errorType: 'wrong_audience',
          message: `Invalid token audience: expected ${EXPECTED_AUDIENCE}`,
        };
      }
      logger.warn(
        { claim: claimError.claim, reason: claimError.reason },
        'JWT claim validation failed'
      );
      return {
        success: false,
        errorType: 'malformed',
        message: `JWT claim validation failed: ${claimError.claim} ${claimError.reason}`,
      };
    }

    if (error instanceof errors.JWSSignatureVerificationFailed) {
      logger.warn({}, 'Invalid OIDC token signature');
      return {
        success: false,
        errorType: 'invalid_signature',
        message: 'Invalid token signature',
      };
    }

    if (error instanceof errors.JOSEError) {
      logger.error(
        { error: error.message, code: error.code },
        'JOSE error during token validation'
      );
      return {
        success: false,
        errorType: 'malformed',
        message: `Token validation error: ${error.message}`,
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Unexpected error during token validation');
    return {
      success: false,
      errorType: 'malformed',
      message: `Token validation error: ${message}`,
    };
  }
}
