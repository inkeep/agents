import { verifySolution } from 'altcha-lib';

export type PoWError = 'pow_required' | 'pow_invalid' | 'pow_expired';

export type PoWResult = { ok: true } | { ok: false; error: PoWError };

export type SentinelError =
  | 'sentinel_network_error'
  | 'sentinel_invalid_response'
  | 'sentinel_verify_failed'
  | 'sentinel_rejected';

export type SentinelVerifyResult =
  | {
      ok: true;
      classification: string;
      score: number;
      verificationId: string;
    }
  | {
      ok: false;
      error: SentinelError;
      reason: string;
    };

export function isSentinelUpstreamUnavailable(error: SentinelError): boolean {
  return error === 'sentinel_network_error' || error === 'sentinel_invalid_response';
}

const POW_ERROR_MESSAGES: Record<PoWError, string> = {
  pow_expired: 'Proof-of-work challenge has expired. Please request a new challenge.',
  pow_required: 'Proof-of-work challenge solution is required.',
  pow_invalid: 'Proof-of-work challenge solution is invalid.',
};

export function getPoWErrorMessage(error: PoWError): string {
  return POW_ERROR_MESSAGES[error];
}

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

export function isSentinelEnabled(apiKeyId: string | undefined): apiKeyId is string {
  return !!apiKeyId;
}

export async function verifySentinelPayload(
  payload: string,
  sentinelBaseUrl: string,
  apiKeyId: string,
  apiKeySecret: string
): Promise<SentinelVerifyResult> {
  // ALTCHA Sentinel /v1/verify/signature requires API credentials. Tested empirically:
  // Bearer auth → 403 "API key not found"; query-param auth → 200.
  const url = `${sentinelBaseUrl}/v1/verify/signature?apiKey=${encodeURIComponent(
    apiKeyId
  )}&apiSecret=${encodeURIComponent(apiKeySecret)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    return {
      ok: false,
      error: 'sentinel_network_error',
      reason: err instanceof Error ? err.message : 'Network error',
    };
  }

  // Check response.ok BEFORE attempting to parse JSON. Otherwise an HTML 5xx page
  // (Cloudflare/ALB) would throw SyntaxError → sentinel_invalid_response → fail-OPEN,
  // while a JSON 5xx would reach the response.ok check below → sentinel_verify_failed
  // → fail-CLOSED. The fail-open/closed decision must not depend on whether the
  // upstream's error page happens to be JSON.
  if (!response.ok) {
    let upstreamReason = `HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      if (typeof errBody.error === 'string') upstreamReason = errBody.error;
    } catch {
      // Non-JSON body — keep the HTTP status as the reason.
    }
    return {
      ok: false,
      error: 'sentinel_verify_failed',
      reason: upstreamReason,
    };
  }

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch (err) {
    const parseMessage = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: 'sentinel_invalid_response',
      reason: `Non-JSON response (HTTP ${response.status}): ${parseMessage}`,
    };
  }

  if (body.verified !== true) {
    return {
      ok: false,
      error: 'sentinel_rejected',
      reason: typeof body.reason === 'string' ? body.reason : 'Verification rejected',
    };
  }

  return {
    ok: true,
    classification: typeof body.classification === 'string' ? body.classification : 'unknown',
    score: typeof body.score === 'number' ? body.score : 0,
    verificationId: typeof body.verificationId === 'string' ? body.verificationId : '',
  };
}
