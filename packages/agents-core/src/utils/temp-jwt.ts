import * as jose from 'jose';
import { generateId } from './conversations';

export interface TempTokenPayload {
  tenantId: string;
  projectId: string;
  agentId: string;
  type: 'temporary';
  initiatedBy: {
    type: 'user' | 'api_key';
    id: string;
  };
  sub: string;
}

export interface SignedTempToken {
  token: string;
  expiresAt: string;
}

export async function signTempToken(
  privateKeyPem: string,
  payload: TempTokenPayload
): Promise<SignedTempToken> {
  const privateKey = await jose.importPKCS8(privateKeyPem, 'RS256');

  const jwt = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer('inkeep-manage-api')
    .setAudience('inkeep-run-api')
    .setSubject(payload.sub)
    .setJti(generateId())
    .sign(privateKey);

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return { token: jwt, expiresAt };
}

export async function verifyTempToken(
  publicKeyPem: string,
  token: string
): Promise<TempTokenPayload> {
  const publicKey = await jose.importSPKI(publicKeyPem, 'RS256');

  const { payload } = await jose.jwtVerify(token, publicKey, {
    issuer: 'inkeep-manage-api',
    audience: 'inkeep-run-api',
  });

  if (payload.type !== 'temporary') {
    throw new Error('Invalid token type');
  }

  if (!payload.sub) {
    throw new Error('Invalid token: missing subject claim');
  }

  return payload as unknown as TempTokenPayload;
}
