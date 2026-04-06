import * as jose from 'jose';

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
