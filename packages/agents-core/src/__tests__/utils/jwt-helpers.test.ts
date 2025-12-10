import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeJwtPayload,
  extractBearerToken,
  getJwtSecret,
  hasIssuer,
  signJwt,
  verifyJwt,
} from '../../utils/jwt-helpers';

vi.mock('../../env', () => ({
  env: {
    ENVIRONMENT: 'test',
    INKEEP_AGENTS_JWT_SIGNING_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  },
}));

describe('JWT Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getJwtSecret', () => {
    it('should return a Uint8Array', () => {
      const secret = getJwtSecret();
      expect(secret).toBeInstanceOf(Uint8Array);
    });

    it('should return consistent secret for same environment', () => {
      const secret1 = getJwtSecret();
      const secret2 = getJwtSecret();
      expect(secret1).toEqual(secret2);
    });
  });

  describe('signJwt', () => {
    it('should sign a JWT with required options', async () => {
      const token = await signJwt({
        issuer: 'test-issuer',
        subject: 'test-subject',
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should sign a JWT with all options', async () => {
      const token = await signJwt({
        issuer: 'test-issuer',
        subject: 'test-subject',
        audience: 'test-audience',
        expiresIn: '10m',
        claims: { customClaim: 'value' },
      });

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include custom claims in the token', async () => {
      const token = await signJwt({
        issuer: 'test-issuer',
        subject: 'test-subject',
        claims: { role: 'admin', tenantId: 'tenant-123' },
      });

      const payload = decodeJwtPayload(token);
      expect(payload?.role).toBe('admin');
      expect(payload?.tenantId).toBe('tenant-123');
    });
  });

  describe('verifyJwt', () => {
    it('should verify a valid JWT', async () => {
      const token = await signJwt({
        issuer: 'test-issuer',
        subject: 'test-subject',
      });

      const result = await verifyJwt(token, { issuer: 'test-issuer' });

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.sub).toBe('test-subject');
      expect(result.payload?.iss).toBe('test-issuer');
    });

    it('should verify a JWT with audience', async () => {
      const token = await signJwt({
        issuer: 'test-issuer',
        subject: 'test-subject',
        audience: 'test-audience',
      });

      const result = await verifyJwt(token, {
        issuer: 'test-issuer',
        audience: 'test-audience',
      });

      expect(result.valid).toBe(true);
      expect(result.payload?.aud).toBe('test-audience');
    });

    it('should fail verification for wrong issuer', async () => {
      const token = await signJwt({
        issuer: 'test-issuer',
        subject: 'test-subject',
      });

      const result = await verifyJwt(token, { issuer: 'wrong-issuer' });

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail verification for wrong audience', async () => {
      const token = await signJwt({
        issuer: 'test-issuer',
        subject: 'test-subject',
        audience: 'test-audience',
      });

      const result = await verifyJwt(token, {
        issuer: 'test-issuer',
        audience: 'wrong-audience',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail verification for invalid token', async () => {
      const result = await verifyJwt('invalid-token', { issuer: 'test-issuer' });

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail verification for tampered token', async () => {
      const token = await signJwt({
        issuer: 'test-issuer',
        subject: 'test-subject',
      });

      // Tamper with the token
      const parts = token.split('.');
      parts[1] = Buffer.from(JSON.stringify({ sub: 'hacked' })).toString('base64url');
      const tamperedToken = parts.join('.');

      const result = await verifyJwt(tamperedToken, { issuer: 'test-issuer' });

      expect(result.valid).toBe(false);
    });
  });

  describe('extractBearerToken', () => {
    it('should extract token from valid Authorization header', () => {
      const result = extractBearerToken('Bearer my-token-value');

      expect(result.token).toBe('my-token-value');
      expect(result.error).toBeUndefined();
    });

    it('should return error for missing header', () => {
      const result = extractBearerToken(undefined);

      expect(result.token).toBeUndefined();
      expect(result.error).toBe('Missing Authorization header');
    });

    it('should return error for non-Bearer header', () => {
      const result = extractBearerToken('Basic credentials');

      expect(result.token).toBeUndefined();
      expect(result.error).toBe('Invalid Authorization header format. Expected: Bearer <token>');
    });

    it('should return error for empty token', () => {
      const result = extractBearerToken('Bearer ');

      expect(result.token).toBeUndefined();
      expect(result.error).toBe('Empty token in Authorization header');
    });

    it('should handle Bearer without space correctly', () => {
      const result = extractBearerToken('Bearertoken');

      expect(result.token).toBeUndefined();
      expect(result.error).toBe('Invalid Authorization header format. Expected: Bearer <token>');
    });
  });

  describe('decodeJwtPayload', () => {
    it('should decode a valid JWT payload', async () => {
      const token = await signJwt({
        issuer: 'test-issuer',
        subject: 'test-subject',
        claims: { customField: 'customValue' },
      });

      const payload = decodeJwtPayload(token);

      expect(payload).toBeDefined();
      expect(payload?.iss).toBe('test-issuer');
      expect(payload?.sub).toBe('test-subject');
      expect(payload?.customField).toBe('customValue');
    });

    it('should return null for invalid token format', () => {
      const payload = decodeJwtPayload('not-a-jwt');

      expect(payload).toBeNull();
    });

    it('should return null for token with wrong number of parts', () => {
      const payload = decodeJwtPayload('part1.part2');

      expect(payload).toBeNull();
    });

    it('should return null for token with invalid base64', () => {
      const payload = decodeJwtPayload('header.!!!invalid!!!.signature');

      expect(payload).toBeNull();
    });
  });

  describe('hasIssuer', () => {
    it('should return true for matching issuer', async () => {
      const token = await signJwt({
        issuer: 'my-issuer',
        subject: 'test-subject',
      });

      expect(hasIssuer(token, 'my-issuer')).toBe(true);
    });

    it('should return false for non-matching issuer', async () => {
      const token = await signJwt({
        issuer: 'my-issuer',
        subject: 'test-subject',
      });

      expect(hasIssuer(token, 'different-issuer')).toBe(false);
    });

    it('should return false for invalid token', () => {
      expect(hasIssuer('invalid-token', 'any-issuer')).toBe(false);
    });
  });
});

