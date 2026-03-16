import { describe, expect, it } from 'vitest';
import { signMcpAccessToken, verifyMcpAccessToken } from '../mcp-access-token';

describe('mcp-access-token', () => {
  const params = { tenantId: 'tenant-1', projectId: 'project-1' };

  describe('signMcpAccessToken', () => {
    it('should return a JWT string', async () => {
      const token = await signMcpAccessToken(params);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyMcpAccessToken', () => {
    it('should verify a valid token and return payload', async () => {
      const token = await signMcpAccessToken(params);
      const result = await verifyMcpAccessToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.tenantId).toBe(params.tenantId);
      expect(result.payload?.projectId).toBe(params.projectId);
      expect(result.payload?.tokenUse).toBe('mcpAccess');
      expect(result.payload?.iss).toBe('inkeep-auth');
      expect(result.payload?.aud).toBe('inkeep-mcp');
      expect(result.payload?.act.sub).toBe('inkeep-agents-api');
    });

    it('should reject a token with wrong audience', async () => {
      const { signJwt } = await import('../jwt-helpers');
      const token = await signJwt({
        issuer: 'inkeep-auth',
        subject: params.tenantId,
        audience: 'wrong-audience',
        expiresIn: '5m',
        claims: {
          tokenUse: 'mcpAccess',
          act: { sub: 'inkeep-agents-api' },
          tenantId: params.tenantId,
          projectId: params.projectId,
        },
      });

      const result = await verifyMcpAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a token with wrong issuer', async () => {
      const { signJwt } = await import('../jwt-helpers');
      const token = await signJwt({
        issuer: 'wrong-issuer',
        subject: params.tenantId,
        audience: 'inkeep-mcp',
        expiresIn: '5m',
        claims: {
          tokenUse: 'mcpAccess',
          act: { sub: 'inkeep-agents-api' },
          tenantId: params.tenantId,
          projectId: params.projectId,
        },
      });

      const result = await verifyMcpAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a malformed token', async () => {
      const result = await verifyMcpAccessToken('not.a.valid.jwt.token');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a token with invalid schema (missing projectId)', async () => {
      const { signJwt } = await import('../jwt-helpers');
      const token = await signJwt({
        issuer: 'inkeep-auth',
        subject: params.tenantId,
        audience: 'inkeep-mcp',
        expiresIn: '5m',
        claims: {
          tokenUse: 'mcpAccess',
          act: { sub: 'inkeep-agents-api' },
          tenantId: params.tenantId,
        },
      });

      const result = await verifyMcpAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token schema');
    });
  });
});
