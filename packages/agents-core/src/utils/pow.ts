import { verifySolution } from 'altcha-lib';

export type PoWResult =
  | { ok: true }
  | { ok: false; error: 'pow_required' | 'pow_invalid' | 'pow_expired' };

export function isPoWEnabled(hmacSecret: string | undefined): boolean {
  return !!hmacSecret;
}

function isChallengeExpired(payload: string): boolean {
  try {
    const decoded = JSON.parse(atob(payload));
    const salt: string | undefined = decoded?.salt;
    if (!salt) return false;
    const params = new URLSearchParams(salt.split('?')[1] ?? '');
    const expires = params.get('expires');
    if (!expires) return false;
    return Date.now() / 1000 > Number(expires);
  } catch {
    return false;
  }
}

export async function verifyPoW(
  request: Request,
  hmacSecret: string | undefined
): Promise<PoWResult> {
  if (!hmacSecret) {
    return { ok: true };
  }

  const challengeHeader = request.headers.get('x-inkeep-challenge-solution');
  if (!challengeHeader) {
    return { ok: false, error: 'pow_required' };
  }

  if (isChallengeExpired(challengeHeader)) {
    return { ok: false, error: 'pow_expired' };
  }

  try {
    const valid = await verifySolution(challengeHeader, hmacSecret, false);
    if (!valid) {
      return { ok: false, error: 'pow_invalid' };
    }
  } catch {
    return { ok: false, error: 'pow_invalid' };
  }

  return { ok: true };
}
