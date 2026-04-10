import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import type { ValidatePublicKeyResult } from '../validate-public-key';
import { validatePublicKey } from '../validate-public-key';

function expectInvalid(result: ValidatePublicKeyResult): string {
  expect(result.valid).toBe(false);
  if (!result.valid) return result.error;
  throw new Error('Expected invalid result');
}

describe('validatePublicKey', () => {
  it('accepts a valid RSA-2048 public key with RS256', async () => {
    const { publicKey } = await generateKeyPair('RS256');
    const pem = await exportSPKI(publicKey);
    const result = await validatePublicKey(pem, 'RS256');
    expect(result.valid).toBe(true);
  });

  it('accepts a valid EC P-256 public key with ES256', async () => {
    const { publicKey } = await generateKeyPair('ES256');
    const pem = await exportSPKI(publicKey);
    const result = await validatePublicKey(pem, 'ES256');
    expect(result.valid).toBe(true);
  });

  it('accepts a valid EC P-384 public key with ES384', async () => {
    const { publicKey } = await generateKeyPair('ES384');
    const pem = await exportSPKI(publicKey);
    const result = await validatePublicKey(pem, 'ES384');
    expect(result.valid).toBe(true);
  });

  it('rejects a private key', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const error = expectInvalid(await validatePublicKey(pem, 'RS256'));
    expect(error).toContain('public key');
  });

  it('rejects an algorithm not in the allowlist', async () => {
    const { publicKey } = await generateKeyPair('RS256');
    const pem = await exportSPKI(publicKey);
    const error = expectInvalid(await validatePublicKey(pem, 'HS256' as any));
    expect(error).toContain('algorithm');
  });

  it('rejects an RSA key declared as ES256 (algorithm mismatch)', async () => {
    const { publicKey } = await generateKeyPair('RS256');
    const pem = await exportSPKI(publicKey);
    const error = expectInvalid(await validatePublicKey(pem, 'ES256'));
    expect(error).toContain('match');
  });

  it('rejects an EC key declared as RS256 (algorithm mismatch)', async () => {
    const { publicKey } = await generateKeyPair('ES256');
    const pem = await exportSPKI(publicKey);
    const error = expectInvalid(await validatePublicKey(pem, 'RS256'));
    expect(error).toContain('match');
  });

  it('rejects malformed PEM', async () => {
    const error = expectInvalid(await validatePublicKey('not-a-pem-string', 'RS256'));
    expect(error).toContain('PEM');
  });

  it('accepts RS384 and RS512 algorithms', async () => {
    const { publicKey: rsa384 } = await generateKeyPair('RS384');
    const pem384 = await exportSPKI(rsa384);
    expect((await validatePublicKey(pem384, 'RS384')).valid).toBe(true);

    const { publicKey: rsa512 } = await generateKeyPair('RS512');
    const pem512 = await exportSPKI(rsa512);
    expect((await validatePublicKey(pem512, 'RS512')).valid).toBe(true);
  });

  it('accepts ES512 algorithm', async () => {
    const { publicKey } = await generateKeyPair('ES512');
    const pem = await exportSPKI(publicKey);
    expect((await validatePublicKey(pem, 'ES512')).valid).toBe(true);
  });
});
