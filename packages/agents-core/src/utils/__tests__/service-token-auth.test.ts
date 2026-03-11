import { describe, expect, it } from 'vitest';
import {
  generateServiceToken,
  validateTargetAgent,
  validateTenantId,
  verifyServiceToken,
} from '../service-token-auth';

describe('Service Token Auth', () => {
  const baseParams = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    originAgentId: 'agent-origin',
    targetAgentId: 'agent-target',
  };

  describe('generateServiceToken + verifyServiceToken round-trip', () => {
    it('should round-trip basic claims', async () => {
      const token = await generateServiceToken(baseParams);
      const result = await verifyServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.sub).toBe('agent-origin');
      expect(result.payload?.aud).toBe('agent-target');
      expect(result.payload?.tenantId).toBe('tenant-1');
      expect(result.payload?.projectId).toBe('project-1');
      expect(result.payload?.iss).toBe('inkeep-agents');
    });

    it('should round-trip initiatedBy with type "user"', async () => {
      const token = await generateServiceToken({
        ...baseParams,
        initiatedBy: { type: 'user', id: 'user_abc123' },
      });

      const result = await verifyServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.initiatedBy).toEqual({ type: 'user', id: 'user_abc123' });
    });

    it('should round-trip initiatedBy with type "api_key"', async () => {
      const token = await generateServiceToken({
        ...baseParams,
        initiatedBy: { type: 'api_key', id: 'key_xyz789' },
      });

      const result = await verifyServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.initiatedBy).toEqual({ type: 'api_key', id: 'key_xyz789' });
    });

    it('should not include initiatedBy when not provided', async () => {
      const token = await generateServiceToken(baseParams);
      const result = await verifyServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.initiatedBy).toBeUndefined();
    });

    it('should not include initiatedBy when explicitly undefined', async () => {
      const token = await generateServiceToken({
        ...baseParams,
        initiatedBy: undefined,
      });
      const result = await verifyServiceToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.initiatedBy).toBeUndefined();
    });
  });

  describe('validateTenantId', () => {
    it('should return true for matching tenant', () => {
      const payload = {
        iss: 'inkeep-agents',
        aud: 'agent-target',
        sub: 'agent-origin',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        iat: Date.now(),
        exp: Date.now() + 3600,
      };
      expect(validateTenantId(payload, 'tenant-1')).toBe(true);
    });

    it('should return false for mismatched tenant', () => {
      const payload = {
        iss: 'inkeep-agents',
        aud: 'agent-target',
        sub: 'agent-origin',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        iat: Date.now(),
        exp: Date.now() + 3600,
      };
      expect(validateTenantId(payload, 'tenant-2')).toBe(false);
    });
  });

  describe('validateTargetAgent', () => {
    it('should return true for matching target agent', () => {
      const payload = {
        iss: 'inkeep-agents',
        aud: 'agent-target',
        sub: 'agent-origin',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        iat: Date.now(),
        exp: Date.now() + 3600,
      };
      expect(validateTargetAgent(payload, 'agent-target')).toBe(true);
    });

    it('should return false for mismatched target agent', () => {
      const payload = {
        iss: 'inkeep-agents',
        aud: 'agent-target',
        sub: 'agent-origin',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        iat: Date.now(),
        exp: Date.now() + 3600,
      };
      expect(validateTargetAgent(payload, 'wrong-agent')).toBe(false);
    });
  });

  describe('verifyServiceToken validation', () => {
    it('should reject tokens with invalid issuer', async () => {
      const result = await verifyServiceToken('not-a-valid-token');
      expect(result.valid).toBe(false);
    });
  });
});
