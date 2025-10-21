import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateServiceToken,
  type ServiceTokenPayload,
  validateTargetAgent,
  validateTenantId,
  verifyAuthorizationHeader,
  verifyServiceToken,
} from '../../utils/service-token-auth';

describe('Team Agent Authentication', () => {
  const mockParams = {
    tenantId: 'tenant_123',
    originAgentId: 'agent_origin',
    originProjectId: 'project_origin',
    targetAgentId: 'agent_target',
    targetProjectId: 'project_target',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateTeamAgentToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await generateServiceToken(mockParams);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts: header.payload.signature
    });

    it('should generate different tokens for different params', async () => {
      const token1 = await generateServiceToken(mockParams);
      const token2 = await generateServiceToken({
        ...mockParams,
        targetAgentId: 'different_agent',
      });

      expect(token1).not.toBe(token2);
    });

    it('should generate tokens that expire in 5 minutes', async () => {
      const beforeGeneration = Math.floor(Date.now() / 1000);
      const token = await generateServiceToken(mockParams);
      const result = await verifyServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();

      if (result.payload) {
        const expiryTime = result.payload.exp - result.payload.iat;
        expect(expiryTime).toBe(300); // 5 minutes = 300 seconds
        expect(result.payload.exp).toBeGreaterThan(beforeGeneration);
        expect(result.payload.exp).toBeLessThanOrEqual(beforeGeneration + 301); // Allow 1 second tolerance
      }
    });
  });

  describe('verifyTeamAgentToken', () => {
    it('should verify a valid token', async () => {
      const token = await generateServiceToken(mockParams);
      const result = await verifyServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return correct payload claims', async () => {
      const token = await generateServiceToken(mockParams);
      const result = await verifyServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toMatchObject({
        iss: 'inkeep-agents',
        sub: mockParams.originAgentId,
        aud: mockParams.targetAgentId,
        tenantId: mockParams.tenantId,
        originProjectId: mockParams.originProjectId,
        targetProjectId: mockParams.targetProjectId,
      });
      expect(result.payload?.iat).toBeDefined();
      expect(result.payload?.exp).toBeDefined();
    });

    it('should reject an invalid token', async () => {
      const result = await verifyServiceToken('invalid.token.here');

      expect(result.valid).toBe(false);
      expect(result.payload).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it('should reject a malformed token', async () => {
      const result = await verifyServiceToken('not-a-jwt');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a token with wrong signature', async () => {
      const token = await generateServiceToken(mockParams);
      // Tamper with the signature
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.TAMPERED`;

      const result = await verifyServiceToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject an expired token', async () => {
      // Create a token that expires immediately
      const { SignJWT } = await import('jose');
      const secret = new TextEncoder().encode(
        'insecure-dev-secret-change-in-production-min-32-chars'
      );

      const expiredToken = await new SignJWT({
        tenantId: mockParams.tenantId,
        originProjectId: mockParams.originProjectId,
        targetProjectId: mockParams.targetProjectId,
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer('inkeep-agents')
        .setSubject(mockParams.originAgentId)
        .setAudience(mockParams.targetAgentId)
        .setIssuedAt()
        .setExpirationTime('0s') // Expire immediately
        .sign(secret);

      // Wait a bit to ensure expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await verifyServiceToken(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exp');
    });

    it('should reject a token with missing claims', async () => {
      const { SignJWT } = await import('jose');
      const secret = new TextEncoder().encode(
        'insecure-dev-secret-change-in-production-min-32-chars'
      );

      // Create token without required custom claims
      const incompleteToken = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer('inkeep-agents')
        .setSubject(mockParams.originAgentId)
        .setAudience(mockParams.targetAgentId)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(secret);

      const result = await verifyServiceToken(incompleteToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing required claims');
    });
  });

  describe('validateTenantId', () => {
    let mockPayload: ServiceTokenPayload;

    beforeEach(() => {
      mockPayload = {
        iss: 'inkeep-agents',
        aud: 'agent_target',
        sub: 'agent_origin',
        tenantId: 'tenant_123',
        originProjectId: 'project_origin',
        targetProjectId: 'project_target',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };
    });

    it('should return true for matching tenant IDs', () => {
      const result = validateTenantId(mockPayload, 'tenant_123');
      expect(result).toBe(true);
    });

    it('should return false for non-matching tenant IDs', () => {
      const result = validateTenantId(mockPayload, 'tenant_456');
      expect(result).toBe(false);
    });

    it('should return false for cross-tenant attempts', () => {
      const result = validateTenantId(mockPayload, 'different_tenant');
      expect(result).toBe(false);
    });
  });

  describe('validateTargetAgent', () => {
    let mockPayload: ServiceTokenPayload;

    beforeEach(() => {
      mockPayload = {
        iss: 'inkeep-agents',
        aud: 'agent_target',
        sub: 'agent_origin',
        tenantId: 'tenant_123',
        originProjectId: 'project_origin',
        targetProjectId: 'project_target',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };
    });

    it('should return true for matching target agent IDs', () => {
      const result = validateTargetAgent(mockPayload, 'agent_target');
      expect(result).toBe(true);
    });

    it('should return false for non-matching target agent IDs', () => {
      const result = validateTargetAgent(mockPayload, 'agent_wrong');
      expect(result).toBe(false);
    });

    it('should return false when token is for different agent', () => {
      const result = validateTargetAgent(mockPayload, 'completely_different_agent');
      expect(result).toBe(false);
    });
  });

  describe('verifyAuthorizationHeader', () => {
    it('should verify a valid Bearer token', async () => {
      const token = await generateServiceToken(mockParams);
      const authHeader = `Bearer ${token}`;
      const result = await verifyAuthorizationHeader(authHeader);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    it('should reject missing Authorization header', async () => {
      const result = await verifyAuthorizationHeader(undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    it('should reject header without Bearer prefix', async () => {
      const token = await generateServiceToken(mockParams);
      const result = await verifyAuthorizationHeader(token); // No "Bearer " prefix

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Authorization header format');
    });

    it('should reject header with wrong scheme', async () => {
      const token = await generateServiceToken(mockParams);
      const authHeader = `Basic ${token}`;
      const result = await verifyAuthorizationHeader(authHeader);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Authorization header format');
    });

    it('should reject empty token after Bearer prefix', async () => {
      const result = await verifyAuthorizationHeader('Bearer ');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Empty token in Authorization header');
    });

    it('should handle Bearer token with extra whitespace', async () => {
      const token = await generateServiceToken(mockParams);
      const authHeader = `Bearer  ${token}`; // Extra space
      const result = await verifyAuthorizationHeader(authHeader);

      // Will fail token verification but not header parsing
      expect(result.valid).toBe(false);
    });
  });

  describe('End-to-end token flow', () => {
    it('should successfully generate, verify, and validate a token', async () => {
      // Generate token
      const token = await generateServiceToken(mockParams);

      // Verify token
      const verifyResult = await verifyServiceToken(token);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.payload).toBeDefined();

      // Validate tenant
      if (verifyResult.payload) {
        const tenantValid = validateTenantId(verifyResult.payload, mockParams.tenantId);
        expect(tenantValid).toBe(true);

        // Validate target agent
        const targetValid = validateTargetAgent(verifyResult.payload, mockParams.targetAgentId);
        expect(targetValid).toBe(true);
      }
    });

    it('should handle authorization header end-to-end', async () => {
      // Generate token
      const token = await generateServiceToken(mockParams);

      // Create auth header
      const authHeader = `Bearer ${token}`;

      // Verify via header
      const result = await verifyAuthorizationHeader(authHeader);
      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();

      // Validate claims
      if (result.payload) {
        expect(result.payload.tenantId).toBe(mockParams.tenantId);
        expect(result.payload.sub).toBe(mockParams.originAgentId);
        expect(result.payload.aud).toBe(mockParams.targetAgentId);
      }
    });

    it('should detect and reject cross-tenant delegation attempts', async () => {
      // Generate token for tenant A
      const token = await generateServiceToken(mockParams);

      // Verify token
      const verifyResult = await verifyServiceToken(token);
      expect(verifyResult.valid).toBe(true);

      // Try to validate against tenant B
      if (verifyResult.payload) {
        const crossTenantValid = validateTenantId(verifyResult.payload, 'different_tenant');
        expect(crossTenantValid).toBe(false);
      }
    });
  });
});
