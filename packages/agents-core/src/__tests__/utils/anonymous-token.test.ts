import { describe, expect, it } from 'vitest';
import {
  generateAnonymousToken,
  isAnonymousToken,
  verifyAnonymousToken,
} from '../../utils/anonymous-token';

describe('Anonymous Token (JWE)', () => {
  const testPayload = {
    anonymousUserId: 'anon_abc123',
    tenantId: 'test-tenant',
    projectId: 'test-project',
  };

  describe('generateAnonymousToken', () => {
    it('should generate a JWE token string', async () => {
      const token = await generateAnonymousToken(testPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(5);
    });

    it('should generate different tokens for different users', async () => {
      const token1 = await generateAnonymousToken(testPayload);
      const token2 = await generateAnonymousToken({
        ...testPayload,
        anonymousUserId: 'anon_xyz789',
      });

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyAnonymousToken', () => {
    it('should verify a valid token and return the payload', async () => {
      const token = await generateAnonymousToken(testPayload);
      const result = await verifyAnonymousToken(token);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.anonymousUserId).toBe(testPayload.anonymousUserId);
        expect(result.payload.tenantId).toBe(testPayload.tenantId);
        expect(result.payload.projectId).toBe(testPayload.projectId);
      }
    });

    it('should reject an invalid token', async () => {
      const result = await verifyAnonymousToken('invalid.token.string.here.now');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBeDefined();
      }
    });

    it('should reject a tampered token', async () => {
      const token = await generateAnonymousToken(testPayload);
      const parts = token.split('.');
      parts[3] = 'tampered' + parts[3].slice(8);
      const tamperedToken = parts.join('.');

      const result = await verifyAnonymousToken(tamperedToken);
      expect(result.valid).toBe(false);
    });
  });

  describe('isAnonymousToken', () => {
    it('should identify a JWE token as anonymous', async () => {
      const token = await generateAnonymousToken(testPayload);

      expect(isAnonymousToken(token)).toBe(true);
    });

    it('should not identify a regular JWT as anonymous', () => {
      const fakeJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

      expect(isAnonymousToken(fakeJwt)).toBe(false);
    });

    it('should return false for non-token strings', () => {
      expect(isAnonymousToken('not-a-token')).toBe(false);
      expect(isAnonymousToken('')).toBe(false);
    });
  });

  describe('roundtrip', () => {
    it('should successfully roundtrip generate -> verify', async () => {
      const original = {
        anonymousUserId: 'anon_roundtrip123',
        tenantId: 'tenant-roundtrip',
        projectId: 'project-roundtrip',
      };

      const token = await generateAnonymousToken(original);
      const result = await verifyAnonymousToken(token);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload).toEqual(original);
      }
    });
  });
});
