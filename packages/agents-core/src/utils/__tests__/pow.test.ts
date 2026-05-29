import { createChallenge, solveChallenge } from 'altcha-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPoWEnabled,
  isSentinelEnabled,
  isSentinelUpstreamUnavailable,
  verifyPoW,
  verifySentinelPayload,
} from '../pow';

const TEST_HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-chars-long';

function makeRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost/test', { headers });
}

describe('isPoWEnabled', () => {
  it('should return false when hmacSecret is undefined', () => {
    expect(isPoWEnabled(undefined)).toBe(false);
  });

  it('should return false when hmacSecret is empty string', () => {
    expect(isPoWEnabled('')).toBe(false);
  });

  it('should return true when hmacSecret is set', () => {
    expect(isPoWEnabled(TEST_HMAC_SECRET)).toBe(true);
  });
});

describe('verifyPoW', () => {
  it('should pass through when PoW is disabled', async () => {
    const result = await verifyPoW(makeRequest(), undefined);
    expect(result).toEqual({ ok: true });
  });

  it('should return pow_required when header is missing and PoW is enabled', async () => {
    const result = await verifyPoW(makeRequest(), TEST_HMAC_SECRET);
    expect(result).toEqual({ ok: false, error: 'pow_required' });
  });

  it('should return pow_invalid for an invalid solution', async () => {
    const result = await verifyPoW(
      makeRequest({ 'x-inkeep-challenge-solution': 'invalid-base64-garbage' }),
      TEST_HMAC_SECRET
    );
    expect(result).toEqual({ ok: false, error: 'pow_invalid' });
  });

  it('should return ok for a valid solution', async () => {
    const challenge = await createChallenge({
      hmacKey: TEST_HMAC_SECRET,
      algorithm: 'SHA-256',
      maxnumber: 1000,
      expires: new Date(Date.now() + 300_000),
    });

    const solver = solveChallenge(
      challenge.challenge,
      challenge.salt,
      challenge.algorithm,
      challenge.maxnumber
    );
    const solution = await solver.promise;

    const payload = btoa(
      JSON.stringify({
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        number: solution?.number,
        salt: challenge.salt,
        signature: challenge.signature,
      })
    );

    const result = await verifyPoW(
      makeRequest({ 'x-inkeep-challenge-solution': payload }),
      TEST_HMAC_SECRET
    );
    expect(result).toEqual({ ok: true });
  });

  it('should return pow_expired for an expired challenge', async () => {
    const challenge = await createChallenge({
      hmacKey: TEST_HMAC_SECRET,
      algorithm: 'SHA-256',
      maxnumber: 1000,
      expires: new Date(Date.now() - 1000),
    });

    const solver = solveChallenge(
      challenge.challenge,
      challenge.salt,
      challenge.algorithm,
      challenge.maxnumber
    );
    const solution = await solver.promise;

    const payload = btoa(
      JSON.stringify({
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        number: solution?.number,
        salt: challenge.salt,
        signature: challenge.signature,
      })
    );

    const result = await verifyPoW(
      makeRequest({ 'x-inkeep-challenge-solution': payload }),
      TEST_HMAC_SECRET
    );
    expect(result).toEqual({ ok: false, error: 'pow_expired' });
  });
});

describe('isSentinelEnabled', () => {
  it('should return false when apiKeyId is undefined', () => {
    expect(isSentinelEnabled(undefined)).toBe(false);
  });

  it('should return false when apiKeyId is empty string', () => {
    expect(isSentinelEnabled('')).toBe(false);
  });

  it('should return true when apiKeyId is set', () => {
    expect(isSentinelEnabled('key_abc123')).toBe(true);
  });
});

describe('verifySentinelPayload', () => {
  const BASE_URL = 'https://challenges.example.com';
  const API_KEY_ID = 'key_test_id';
  const API_KEY_SECRET = 'test-secret-value';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return ok with classification and score for a valid payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          verified: true,
          classification: 'GOOD',
          score: 0.95,
          verificationId: 'ver_abc123',
        }),
        { status: 200 }
      )
    );

    const result = await verifySentinelPayload(
      'valid-payload',
      BASE_URL,
      API_KEY_ID,
      API_KEY_SECRET
    );

    expect(result).toEqual({
      ok: true,
      classification: 'GOOD',
      score: 0.95,
      verificationId: 'ver_abc123',
    });

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/v1/verify/signature?apiKey=${API_KEY_ID}&apiSecret=${API_KEY_SECRET}`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: 'valid-payload' }),
      })
    );
  });

  it('should URL-encode credentials in the request URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ verified: true, classification: 'GOOD', score: 0 }), {
        status: 200,
      })
    );

    // Secrets with reserved URL characters must be encoded.
    await verifySentinelPayload('any-payload', BASE_URL, 'key/with+chars', 'secret&value=1');

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('apiKey=key%2Fwith%2Bchars');
    expect(url).toContain('apiSecret=secret%26value%3D1');
    // Credentials go in the query string (required by ALTCHA Sentinel API),
    // not in the Authorization header.
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });

  it('should return error with PAYLOAD_ALREADY_USED for replayed payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          verified: false,
          reason: 'PAYLOAD_ALREADY_USED',
        }),
        { status: 200 }
      )
    );

    const result = await verifySentinelPayload(
      'replayed-payload',
      BASE_URL,
      API_KEY_ID,
      API_KEY_SECRET
    );

    expect(result).toEqual({
      ok: false,
      error: 'sentinel_rejected',
      reason: 'PAYLOAD_ALREADY_USED',
    });
  });

  it('should return error for malformed/invalid payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid payload format' }), { status: 400 })
    );

    const result = await verifySentinelPayload('garbage', BASE_URL, API_KEY_ID, API_KEY_SECRET);

    expect(result).toEqual({
      ok: false,
      error: 'sentinel_verify_failed',
      reason: 'Invalid payload format',
    });
  });

  it('should return error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

    const result = await verifySentinelPayload(
      'some-payload',
      BASE_URL,
      API_KEY_ID,
      API_KEY_SECRET
    );

    expect(result).toEqual({
      ok: false,
      error: 'sentinel_network_error',
      reason: 'Connection refused',
    });
  });

  it('should fail closed for non-JSON 5xx responses (HTML error pages)', async () => {
    // Cloudflare/ALB sometimes return HTML 5xx error pages. The fail-open/closed
    // decision must NOT depend on whether the upstream's error body is JSON —
    // any 5xx is treated as sentinel_verify_failed (fail-closed) regardless of
    // content type. Otherwise an attacker could trigger HTML 5xx responses to
    // bypass bot protection.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 })
    );

    const result = await verifySentinelPayload(
      'some-payload',
      BASE_URL,
      API_KEY_ID,
      API_KEY_SECRET
    );

    expect(result).toEqual({
      ok: false,
      error: 'sentinel_verify_failed',
      reason: 'HTTP 500',
    });
  });

  it('should return sentinel_invalid_response only for a 200 with unparseable body', async () => {
    // The narrow case where sentinel_invalid_response (fail-OPEN per
    // isSentinelUpstreamUnavailable) still fires: Sentinel returned 200 OK but
    // the body is not parseable JSON. This is a Sentinel-side protocol violation,
    // not an error response, so failing open here is the right posture.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not-json-but-200', { status: 200 })
    );

    const result = await verifySentinelPayload(
      'some-payload',
      BASE_URL,
      API_KEY_ID,
      API_KEY_SECRET
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'sentinel_invalid_response',
    });
    if (!result.ok) {
      expect(result.reason).toMatch(/^Non-JSON response \(HTTP 200\):/);
    }
  });
});

describe('isSentinelUpstreamUnavailable', () => {
  it('should return true for sentinel_network_error', () => {
    expect(isSentinelUpstreamUnavailable('sentinel_network_error')).toBe(true);
  });

  it('should return true for sentinel_invalid_response', () => {
    expect(isSentinelUpstreamUnavailable('sentinel_invalid_response')).toBe(true);
  });

  it('should return false for sentinel_verify_failed', () => {
    expect(isSentinelUpstreamUnavailable('sentinel_verify_failed')).toBe(false);
  });

  it('should return false for sentinel_rejected', () => {
    expect(isSentinelUpstreamUnavailable('sentinel_rejected')).toBe(false);
  });
});
