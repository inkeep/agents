'use server';

import crypto from 'crypto';
import { importPKCS8, SignJWT } from 'jose';
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

async function deriveKid(publicKeyPem: string): Promise<string> {
  const data = new TextEncoder().encode(publicKeyPem);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `pg-${hashHex.substring(0, 12)}`;
}

export async function getCopilotTokenAction(): Promise<ActionResult<CopilotTokenResponse>> {
  const copilotAppId =
    process.env.PUBLIC_INKEEP_COPILOT_APP_ID || process.env.NEXT_PUBLIC_INKEEP_COPILOT_APP_ID;
  const privateKeyB64 = process.env.INKEEP_COPILOT_JWT_PRIVATE_KEY;
  const publicKeyPem = process.env.INKEEP_COPILOT_JWT_PUBLIC_KEY;

  if (!copilotAppId || !privateKeyB64 || !publicKeyPem) {
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
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    const kid = await deriveKid(publicKeyPem);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    return {
      success: true,
      data: {
        apiKey: token,
        expiresAt,
        appId: copilotAppId,
        cookieHeader: cookieHeader || undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'network_error',
    };
  }
}
