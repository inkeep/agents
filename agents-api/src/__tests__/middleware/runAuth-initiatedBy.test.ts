import type { BaseExecutionContext } from '@inkeep/agents-core';
import { generateServiceToken, verifyServiceToken } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../data/db/runDbClient.js', () => ({ default: {} }));

vi.mock('../../logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../env.js', () => ({
  env: {
    ENVIRONMENT: 'development',
    INKEEP_AGENTS_API_URL: 'http://localhost:3000',
    INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY: undefined,
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: undefined,
    INKEEP_POW_HMAC_SECRET: undefined,
  },
}));

vi.mock('../../domains/run/routes/auth.js', () => ({
  getAnonJwtSecret: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    validateAndGetApiKey: vi.fn().mockResolvedValue(null),
    canUseProjectStrict: vi.fn().mockResolvedValue(false),
    getAppById: vi.fn(() => vi.fn().mockResolvedValue(null)),
    updateAppLastUsed: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
    validateOrigin: vi.fn().mockReturnValue(false),
    verifyPoW: vi.fn().mockResolvedValue({ ok: false }),
    getPoWErrorMessage: vi.fn().mockReturnValue('PoW failed'),
    isSlackUserToken: vi.fn().mockReturnValue(false),
    verifySlackUserToken: vi.fn().mockResolvedValue({ valid: false }),
  };
});

vi.mock('../../utils/copilot.js', () => ({
  isCopilotAgent: vi.fn().mockReturnValue(false),
}));

import { runApiKeyAuth } from '../../middleware/runAuth';

describe('runAuth middleware - initiatedBy propagation via service token', () => {
  let capturedContext: BaseExecutionContext | undefined;

  function createTestApp() {
    const app = new Hono<{ Variables: { executionContext: BaseExecutionContext } }>();
    app.use('*', runApiKeyAuth());
    app.get('/test', (c) => {
      capturedContext = c.get('executionContext');
      return c.json({ ok: true });
    });
    return app;
  }

  beforeEach(() => {
    capturedContext = undefined;
  });

  it('should propagate initiatedBy from service token into execution context metadata', async () => {
    const token = await generateServiceToken({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      originAgentId: 'origin-agent',
      targetAgentId: 'target-agent',
      initiatedBy: { type: 'user', id: 'user_abc123' },
    });

    const app = createTestApp();
    const res = await app.request('/test', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-agent-id': 'origin-agent',
        'x-inkeep-sub-agent-id': 'target-agent',
      },
    });

    expect(res.status).toBe(200);
    expect(capturedContext).toBeDefined();
    expect(capturedContext?.metadata).toEqual(
      expect.objectContaining({
        teamDelegation: true,
        originAgentId: 'origin-agent',
        initiatedBy: { type: 'user', id: 'user_abc123' },
      })
    );
  });

  it('should propagate initiatedBy with api_key type from service token', async () => {
    const token = await generateServiceToken({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      originAgentId: 'origin-agent',
      targetAgentId: 'target-agent',
      initiatedBy: { type: 'api_key', id: 'key_xyz789' },
    });

    const app = createTestApp();
    const res = await app.request('/test', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-agent-id': 'origin-agent',
        'x-inkeep-sub-agent-id': 'target-agent',
      },
    });

    expect(res.status).toBe(200);
    expect(capturedContext?.metadata).toEqual(
      expect.objectContaining({
        teamDelegation: true,
        initiatedBy: { type: 'api_key', id: 'key_xyz789' },
      })
    );
  });

  it('should not include initiatedBy in metadata when service token has none', async () => {
    const token = await generateServiceToken({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      originAgentId: 'origin-agent',
      targetAgentId: 'target-agent',
    });

    const app = createTestApp();
    const res = await app.request('/test', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-agent-id': 'origin-agent',
        'x-inkeep-sub-agent-id': 'target-agent',
      },
    });

    expect(res.status).toBe(200);
    expect(capturedContext?.metadata).toEqual(
      expect.objectContaining({
        teamDelegation: true,
        originAgentId: 'origin-agent',
      })
    );
    expect(capturedContext?.metadata).not.toHaveProperty('initiatedBy');
  });

  it('should preserve user identity through full generate → verify → auth chain', async () => {
    const userId = 'user_playground_session_12345';
    const token = await generateServiceToken({
      tenantId: 'tenant-acme',
      projectId: 'proj-support',
      originAgentId: 'router-agent',
      targetAgentId: 'qa-agent',
      initiatedBy: { type: 'user', id: userId },
    });

    const verified = await verifyServiceToken(token);
    expect(verified.valid).toBe(true);
    expect(verified.payload?.initiatedBy).toEqual({ type: 'user', id: userId });

    const app = createTestApp();
    const res = await app.request('/test', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-agent-id': 'router-agent',
        'x-inkeep-sub-agent-id': 'qa-agent',
      },
    });

    expect(res.status).toBe(200);
    expect(capturedContext?.tenantId).toBe('tenant-acme');
    expect(capturedContext?.projectId).toBe('proj-support');
    expect(capturedContext?.metadata).toEqual(
      expect.objectContaining({
        initiatedBy: { type: 'user', id: userId },
      })
    );
  });
});
