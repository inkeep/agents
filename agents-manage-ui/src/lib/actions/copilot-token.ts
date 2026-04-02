'use server';

import { createSign } from 'node:crypto';
import { cookies } from 'next/headers';

import { DEFAULT_INKEEP_AGENTS_API_URL } from '../runtime-config/defaults';

type ActionResult<T = void> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

interface CopilotTokenResponse {
  apiKey: string;
  expiresAt: string;
  appId?: string;
  cookieHeader?: string;
}

async function getSessionUserId(cookieHeader: string): Promise<string | null> {
  const agentsApiUrl =
    process.env.INKEEP_AGENTS_API_URL ||
    process.env.PUBLIC_INKEEP_AGENTS_API_URL ||
    DEFAULT_INKEEP_AGENTS_API_URL;

  const res = await fetch(`${agentsApiUrl}/api/auth/get-session`, {
    headers: { cookie: cookieHeader },
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data?.user?.id ?? null;
}

function base64url(input: string | Buffer): string {
  const b = typeof input === 'string' ? Buffer.from(input) : input;
  return b.toString('base64url');
}

function signJwt(payload: Record<string, unknown>, privateKeyPem: string, kid: string): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid }));
  const body = base64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKeyPem, 'base64url');

  return `${signingInput}.${signature}`;
}

export async function getCopilotTokenAction(): Promise<ActionResult<CopilotTokenResponse>> {
  const copilotAppId =
    process.env.PUBLIC_INKEEP_COPILOT_APP_ID || process.env.NEXT_PUBLIC_INKEEP_COPILOT_APP_ID;
  const privateKeyB64 = process.env.INKEEP_COPILOT_JWT_PRIVATE_KEY;
  const kid = process.env.INKEEP_COPILOT_JWT_KID;

  if (!copilotAppId || !privateKeyB64 || !kid) {
    return {
      success: false,
      error: 'Copilot is not configured',
      code: 'configuration_error',
    };
  }

  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join('; ');

    if (!cookieHeader) {
      return {
        success: false,
        error: 'No active session — please log in',
        code: 'auth_error',
      };
    }

    const userId = await getSessionUserId(cookieHeader);
    if (!userId) {
      return {
        success: false,
        error: 'Session expired — please log in',
        code: 'auth_error',
      };
    }

    const privateKeyPem = Buffer.from(privateKeyB64, 'base64').toString('utf-8');
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;
    const expiresAt = new Date(exp * 1000).toISOString();

    const token = signJwt({ sub: userId, iat: now, exp }, privateKeyPem, kid);

    return {
      success: true,
      data: {
        apiKey: token,
        expiresAt,
        appId: copilotAppId,
        cookieHeader: cookieHeader || undefined,
      },
    };
  } catch {
    return {
      success: false,
      error: 'Failed to generate copilot token',
      code: 'network_error',
    };
  }
}
