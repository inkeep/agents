import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { env } from '../env';
import { getLogger } from './logger';

const logger = getLogger('anonymous-token');

const DEV_SECRET = 'insecure-dev-secret-change-in-production-min-32-chars';
const ISSUER = 'inkeep-anonymous';
const DEFAULT_EXPIRY = '30d';

function getEncryptionKey(): Uint8Array {
  const secret = env.INKEEP_AGENTS_JWT_SIGNING_SECRET;

  let raw: string;
  if (!secret) {
    if (env.ENVIRONMENT === 'production') {
      throw new Error(
        'INKEEP_AGENTS_JWT_SIGNING_SECRET environment variable is required in production'
      );
    }
    logger.warn(
      {},
      'INKEEP_AGENTS_JWT_SIGNING_SECRET not set, using insecure default for anonymous tokens.'
    );
    raw = DEV_SECRET;
  } else {
    raw = secret;
  }

  const hash = createHash('sha256').update(`anonymous-jwe:${raw}`).digest();
  return new Uint8Array(hash);
}

export interface AnonymousTokenPayload {
  anonymousUserId: string;
  tenantId: string;
  projectId: string;
}

export async function generateAnonymousToken(params: AnonymousTokenPayload): Promise<string> {
  const key = getEncryptionKey();

  const token = await new EncryptJWT({
    tenantId: params.tenantId,
    projectId: params.projectId,
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setSubject(params.anonymousUserId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(DEFAULT_EXPIRY)
    .encrypt(key);

  return token;
}

export async function verifyAnonymousToken(
  token: string
): Promise<{ valid: true; payload: AnonymousTokenPayload } | { valid: false; error: string }> {
  const key = getEncryptionKey();

  try {
    const { payload } = await jwtDecrypt(token, key, {
      issuer: ISSUER,
    });

    const anonymousUserId = payload.sub;
    const tenantId = payload.tenantId as string | undefined;
    const projectId = payload.projectId as string | undefined;

    if (!anonymousUserId || !tenantId || !projectId) {
      return { valid: false, error: 'Missing required claims in anonymous token' };
    }

    return {
      valid: true,
      payload: { anonymousUserId, tenantId, projectId },
    };
  } catch (error) {
    if (error instanceof Error) {
      return { valid: false, error: error.message };
    }
    return { valid: false, error: 'Anonymous token verification failed' };
  }
}

export function isAnonymousToken(token: string): boolean {
  try {
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    return header.alg === 'dir' && header.enc === 'A256GCM';
  } catch {
    return false;
  }
}
