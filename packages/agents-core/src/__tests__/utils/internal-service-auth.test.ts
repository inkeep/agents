import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateInternalServiceToken,
  InternalServices,
  isInternalServiceToken,
  validateInternalServiceProjectAccess,
  validateInternalServiceTenantAccess,
  verifyInternalServiceAuthHeader,
  verifyInternalServiceToken,
  type InternalServiceTokenPayload,
} from '../../utils/internal-service-auth';

vi.mock('../../env', () => ({
  env: {
    ENVIRONMENT: 'test',
    INKEEP_AGENTS_JWT_SIGNING_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  },
}));

describe('Internal Service Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('InternalServices', () => {
    it('should have correct service identifiers', () => {
      expect(InternalServices.AGENTS_RUN_API).toBe('agents-run-api');
    });
  });

  describe('generateInternalServiceToken', () => {
    it('should generate a valid token for agents-run-api', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate a token with tenant scope', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
        tenantId: 'tenant-123',
      });

      const result = await verifyInternalServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.tenantId).toBe('tenant-123');
    });

    it('should generate a token with project scope', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
        projectId: 'project-456',
      });

      const result = await verifyInternalServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.projectId).toBe('project-456');
    });

    it('should generate a token with both tenant and project scope', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
        tenantId: 'tenant-123',
        projectId: 'project-456',
      });

      const result = await verifyInternalServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.tenantId).toBe('tenant-123');
      expect(result.payload?.projectId).toBe('project-456');
      expect(result.payload?.sub).toBe(InternalServices.AGENTS_RUN_API);
    });

    it('should generate a token with custom expiry', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
        expiresIn: '1h',
      });

      const result = await verifyInternalServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe(InternalServices.AGENTS_RUN_API);
    });
  });

  describe('verifyInternalServiceToken', () => {
    it('should verify a valid internal service token', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
      });

      const result = await verifyInternalServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.sub).toBe(InternalServices.AGENTS_RUN_API);
      expect(result.payload?.iss).toBe('inkeep-agents-internal');
    });

    it('should reject token with invalid format', async () => {
      const result = await verifyInternalServiceToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject token with wrong issuer', async () => {
      const { signJwt } = await import('../../utils/jwt-helpers');
      const token = await signJwt({
        issuer: 'wrong-issuer',
        subject: InternalServices.AGENTS_RUN_API,
      });

      const result = await verifyInternalServiceToken(token);

      expect(result.valid).toBe(false);
    });

    it('should reject token with unknown service ID', async () => {
      const { signJwt } = await import('../../utils/jwt-helpers');
      const token = await signJwt({
        issuer: 'inkeep-agents-internal',
        subject: 'unknown-service',
      });

      const result = await verifyInternalServiceToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown service identifier');
    });

    it('should include tenant and project in payload', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
        tenantId: 'tenant-abc',
        projectId: 'project-xyz',
      });

      const result = await verifyInternalServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.tenantId).toBe('tenant-abc');
      expect(result.payload?.projectId).toBe('project-xyz');
    });

    it('should include timestamps in payload', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
      });

      const result = await verifyInternalServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.iat).toBeDefined();
      expect(result.payload?.exp).toBeDefined();
      expect(typeof result.payload?.iat).toBe('number');
      expect(typeof result.payload?.exp).toBe('number');
    });
  });

  describe('verifyInternalServiceAuthHeader', () => {
    it('should verify a valid Authorization header', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
      });

      const result = await verifyInternalServiceAuthHeader(`Bearer ${token}`);

      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe(InternalServices.AGENTS_RUN_API);
    });

    it('should reject missing header', async () => {
      const result = await verifyInternalServiceAuthHeader(undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    it('should reject non-Bearer header', async () => {
      const result = await verifyInternalServiceAuthHeader('Basic credentials');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Authorization header format');
    });

    it('should reject empty token', async () => {
      const result = await verifyInternalServiceAuthHeader('Bearer ');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Empty token in Authorization header');
    });
  });

  describe('isInternalServiceToken', () => {
    it('should return true for internal service token', async () => {
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
      });

      expect(isInternalServiceToken(token)).toBe(true);
    });

    it('should return false for token with different issuer', async () => {
      const { signJwt } = await import('../../utils/jwt-helpers');
      const token = await signJwt({
        issuer: 'different-issuer',
        subject: 'some-subject',
      });

      expect(isInternalServiceToken(token)).toBe(false);
    });

    it('should return false for invalid token', () => {
      expect(isInternalServiceToken('invalid-token')).toBe(false);
    });
  });

  describe('validateInternalServiceTenantAccess', () => {
    it('should allow access when token has no tenant scope', () => {
      const payload: InternalServiceTokenPayload = {
        iss: 'inkeep-agents-internal',
        sub: InternalServices.AGENTS_RUN_API,
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 300,
      };

      expect(validateInternalServiceTenantAccess(payload, 'any-tenant')).toBe(true);
    });

    it('should allow access when tenant matches', () => {
      const payload: InternalServiceTokenPayload = {
        iss: 'inkeep-agents-internal',
        sub: InternalServices.AGENTS_RUN_API,
        tenantId: 'tenant-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 300,
      };

      expect(validateInternalServiceTenantAccess(payload, 'tenant-123')).toBe(true);
    });

    it('should deny access when tenant does not match', () => {
      const payload: InternalServiceTokenPayload = {
        iss: 'inkeep-agents-internal',
        sub: InternalServices.AGENTS_RUN_API,
        tenantId: 'tenant-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 300,
      };

      expect(validateInternalServiceTenantAccess(payload, 'tenant-456')).toBe(false);
    });
  });

  describe('validateInternalServiceProjectAccess', () => {
    it('should allow access when token has no project scope', () => {
      const payload: InternalServiceTokenPayload = {
        iss: 'inkeep-agents-internal',
        sub: InternalServices.AGENTS_RUN_API,
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 300,
      };

      expect(validateInternalServiceProjectAccess(payload, 'any-project')).toBe(true);
    });

    it('should allow access when project matches', () => {
      const payload: InternalServiceTokenPayload = {
        iss: 'inkeep-agents-internal',
        sub: InternalServices.AGENTS_RUN_API,
        projectId: 'project-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 300,
      };

      expect(validateInternalServiceProjectAccess(payload, 'project-123')).toBe(true);
    });

    it('should deny access when project does not match', () => {
      const payload: InternalServiceTokenPayload = {
        iss: 'inkeep-agents-internal',
        sub: InternalServices.AGENTS_RUN_API,
        projectId: 'project-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 300,
      };

      expect(validateInternalServiceProjectAccess(payload, 'project-456')).toBe(false);
    });
  });

  describe('end-to-end token flow', () => {
    it('should generate, verify, and validate a full token flow', async () => {
      // Generate token with scopes
      const token = await generateInternalServiceToken({
        serviceId: InternalServices.AGENTS_RUN_API,
        tenantId: 'tenant-abc',
        projectId: 'project-xyz',
      });

      // Verify from header
      const result = await verifyInternalServiceAuthHeader(`Bearer ${token}`);
      expect(result.valid).toBe(true);

      // Validate tenant access
      expect(validateInternalServiceTenantAccess(result.payload!, 'tenant-abc')).toBe(true);
      expect(validateInternalServiceTenantAccess(result.payload!, 'wrong-tenant')).toBe(false);

      // Validate project access
      expect(validateInternalServiceProjectAccess(result.payload!, 'project-xyz')).toBe(true);
      expect(validateInternalServiceProjectAccess(result.payload!, 'wrong-project')).toBe(false);
    });

    it('should work for all service types', async () => {
      for (const serviceId of Object.values(InternalServices)) {
        const token = await generateInternalServiceToken({ serviceId });
        const result = await verifyInternalServiceToken(token);

        expect(result.valid).toBe(true);
        expect(result.payload?.sub).toBe(serviceId);
      }
    });
  });
});

