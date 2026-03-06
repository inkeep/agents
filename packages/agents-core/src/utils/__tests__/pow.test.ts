import { createChallenge, solveChallenge } from 'altcha-lib';
import { describe, expect, it } from 'vitest';
import { isPoWEnabled, verifyPoW } from '../pow';

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
      makeRequest({ 'x-inkeep-altcha': 'invalid-base64-garbage' }),
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
        number: solution!.number,
        salt: challenge.salt,
        signature: challenge.signature,
      })
    );

    const result = await verifyPoW(makeRequest({ 'x-inkeep-altcha': payload }), TEST_HMAC_SECRET);
    expect(result).toEqual({ ok: true });
  });

  it('should return pow_invalid for an expired challenge', async () => {
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
        number: solution!.number,
        salt: challenge.salt,
        signature: challenge.signature,
      })
    );

    const result = await verifyPoW(makeRequest({ 'x-inkeep-altcha': payload }), TEST_HMAC_SECRET);
    expect(result).toEqual({ ok: false, error: 'pow_invalid' });
  });
});
