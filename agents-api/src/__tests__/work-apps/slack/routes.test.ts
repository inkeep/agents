import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../../domains/work-apps/slack/routes';

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    findWorkAppSlackUserMapping: vi.fn(() => async () => null),
    createWorkAppSlackAccountLinkCode: vi.fn(() => async () => ({
      linkCode: {
        id: 'wslc_test123',
        slackUserId: 'U123',
        slackTeamId: 'T123',
        slackUsername: 'testuser',
        tenantId: 'default',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      plaintextCode: 'ABC123',
    })),
    consumeWorkAppSlackAccountLinkCode: vi.fn(() => async () => null),
    createWorkAppSlackUserMapping: vi.fn(() => async () => ({
      id: 'wsum_test123',
      slackUserId: 'U123',
      slackTeamId: 'T123',
      inkeepUserId: 'user_123',
      tenantId: 'default',
    })),
    listWorkAppSlackUserMappingsByTeam: vi.fn(() => async () => []),
    cleanupAllExpiredOrUsedLinkCodes: vi.fn(() => async () => ({ expired: 0, used: 0 })),
  };
});

vi.mock('../../../domains/work-apps/slack/services/nango', () => ({
  getSlackNango: vi.fn(() => ({
    listConnections: vi.fn(async () => ({ connections: [] })),
    getConnection: vi.fn(async () => ({})),
  })),
  getSlackIntegrationId: vi.fn(() => 'slack'),
  findWorkspaceConnectionByTeamId: vi.fn(async () => null),
  listWorkspaceInstallations: vi.fn(async () => []),
  storeWorkspaceInstallation: vi.fn(async () => ({ connectionId: 'test', success: true })),
  deleteWorkspaceInstallation: vi.fn(async () => true),
  getWorkspaceDefaultAgentFromNango: vi.fn(async () => null),
  createConnectSession: vi.fn(async () => ({ url: 'https://nango.dev/connect' })),
  computeWorkspaceConnectionId: vi.fn(() => 'E:E123:T:T123'),
}));

describe('Slack Work App Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /events - url_verification', () => {
    it('should respond to url_verification challenge', async () => {
      const response = await app.request('/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'url_verification',
          challenge: 'test-challenge-string',
        }),
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('test-challenge-string');
    });
  });

  describe('GET /workspaces', () => {
    it('should list workspace installations', async () => {
      const response = await app.request('/workspaces', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveProperty('workspaces');
      expect(Array.isArray(json.workspaces)).toBe(true);
    });
  });

  describe('POST /link/redeem', () => {
    it('should require code parameter', async () => {
      const response = await app.request('/link/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'user_123',
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('code');
    });

    it('should require userId parameter', async () => {
      const response = await app.request('/link/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'ABC123',
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('userId');
    });

    it('should return error for invalid link code', async () => {
      const response = await app.request('/link/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'INVALID123',
          userId: 'user_123',
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBeDefined();
    });
  });

  describe('POST /link-codes/cleanup', () => {
    it('should trigger cleanup of expired link codes', async () => {
      const response = await app.request('/link-codes/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveProperty('success');
      expect(json.success).toBe(true);
    });
  });

  describe('GET /linked-users', () => {
    it('should require teamId parameter', async () => {
      const response = await app.request('/linked-users', {
        method: 'GET',
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('teamId');
    });

    it('should return linked users for a team', async () => {
      const response = await app.request('/linked-users?teamId=T123', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveProperty('linkedUsers');
      expect(Array.isArray(json.linkedUsers)).toBe(true);
    });
  });

  describe('GET /workspace-settings', () => {
    it('should require teamId parameter', async () => {
      const response = await app.request('/workspace-settings', {
        method: 'GET',
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('teamId');
    });

    it('should return workspace settings', async () => {
      const response = await app.request('/workspace-settings?teamId=T123', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toBeDefined();
    });
  });
});
