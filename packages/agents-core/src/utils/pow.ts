import { verifySolution } from 'altcha-lib';

export type PoWResult = { ok: true } | { ok: false; error: 'pow_required' | 'pow_invalid' };

export function isPoWEnabled(hmacSecret: string | undefined): boolean {
  return !!hmacSecret;
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

  try {
    const valid = await verifySolution(challengeHeader, hmacSecret);
    if (!valid) {
      return { ok: false, error: 'pow_invalid' };
    }
  } catch {
    return { ok: false, error: 'pow_invalid' };
  }

  return { ok: true };
}
