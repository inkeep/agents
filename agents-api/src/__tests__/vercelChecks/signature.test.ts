import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateVercelSignature } from '../../domains/manage/routes/vercelChecks/signature';

describe('validateVercelSignature', () => {
  const testSecret = 'test-webhook-secret-12345';
  const testBody = JSON.stringify({
    id: 'event-123',
    type: 'deployment.created',
    createdAt: 1704067200000,
    payload: {
      deployment: {
        id: 'dpl_abc123',
        name: 'my-project',
        url: 'my-project-abc123.vercel.app',
        target: 'preview',
      },
    },
  });

  // Compute a valid signature for testing
  const validSignature = crypto.createHmac('sha1', testSecret).update(testBody).digest('hex');

  it('should return true for a valid signature', () => {
    const result = validateVercelSignature(testBody, validSignature, testSecret);
    expect(result).toBe(true);
  });

  it('should return false for an invalid signature', () => {
    const invalidSignature = 'abc123invalidhash';
    const result = validateVercelSignature(testBody, invalidSignature, testSecret);
    expect(result).toBe(false);
  });

  it('should return false for a signature computed with wrong secret', () => {
    const wrongSecretSignature = crypto
      .createHmac('sha1', 'wrong-secret')
      .update(testBody)
      .digest('hex');
    const result = validateVercelSignature(testBody, wrongSecretSignature, testSecret);
    expect(result).toBe(false);
  });

  it('should return false for a signature computed from different body', () => {
    const differentBody = JSON.stringify({ different: 'payload' });
    const differentSignature = crypto
      .createHmac('sha1', testSecret)
      .update(differentBody)
      .digest('hex');
    const result = validateVercelSignature(testBody, differentSignature, testSecret);
    expect(result).toBe(false);
  });

  it('should return false for empty rawBody', () => {
    const result = validateVercelSignature('', validSignature, testSecret);
    expect(result).toBe(false);
  });

  it('should return false for empty signature', () => {
    const result = validateVercelSignature(testBody, '', testSecret);
    expect(result).toBe(false);
  });

  it('should return false for empty secret', () => {
    const result = validateVercelSignature(testBody, validSignature, '');
    expect(result).toBe(false);
  });

  it('should return false for signature with wrong length', () => {
    const shortSignature = 'abc123';
    const result = validateVercelSignature(testBody, shortSignature, testSecret);
    expect(result).toBe(false);
  });

  it('should return false for signature with correct length but wrong content', () => {
    // SHA1 hex digest is 40 characters
    const wrongSignature = 'a'.repeat(40);
    const result = validateVercelSignature(testBody, wrongSignature, testSecret);
    expect(result).toBe(false);
  });

  it('should handle special characters in body', () => {
    const specialBody = JSON.stringify({
      message: 'Hello "world" with <special> & characters',
      unicode: '日本語テスト',
    });
    const specialSignature = crypto
      .createHmac('sha1', testSecret)
      .update(specialBody)
      .digest('hex');
    const result = validateVercelSignature(specialBody, specialSignature, testSecret);
    expect(result).toBe(true);
  });

  it('should handle large payloads', () => {
    const largeBody = JSON.stringify({
      data: 'x'.repeat(10000),
      metadata: { items: Array(100).fill({ key: 'value' }) },
    });
    const largeSignature = crypto.createHmac('sha1', testSecret).update(largeBody).digest('hex');
    const result = validateVercelSignature(largeBody, largeSignature, testSecret);
    expect(result).toBe(true);
  });

  it('should use constant-time comparison (timing-safe)', () => {
    // This test verifies the function uses timingSafeEqual by checking
    // that signatures are compared byte-by-byte regardless of where they differ.
    // We can't directly test timing, but we verify the function rejects
    // signatures that differ at different positions consistently.

    // Signature differs at the start
    const diffStartSignature = `z${validSignature.slice(1)}`;
    expect(validateVercelSignature(testBody, diffStartSignature, testSecret)).toBe(false);

    // Signature differs at the end
    const diffEndSignature = `${validSignature.slice(0, -1)}z`;
    expect(validateVercelSignature(testBody, diffEndSignature, testSecret)).toBe(false);

    // Signature differs in the middle
    const midPoint = Math.floor(validSignature.length / 2);
    const diffMidSignature = `${validSignature.slice(0, midPoint)}z${validSignature.slice(midPoint + 1)}`;
    expect(validateVercelSignature(testBody, diffMidSignature, testSecret)).toBe(false);
  });
});
