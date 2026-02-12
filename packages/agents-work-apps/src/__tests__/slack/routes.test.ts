/**
 * Tests for Slack Work App routes
 *
 * Integration tests for the Hono router covering:
 * - URL verification challenge
 * - Workspace listing and settings
 * - User linking and verification
 * - Channel configuration
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../slack/routes/index';

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    findWorkAppSlackUserMapping: vi.fn(() => async () => null),
    createWorkAppSlackUserMapping: vi.fn(() => async () => ({
      id: 'wsum_test123',
      slackUserId: 'U123',
      slackTeamId: 'T123',
      inkeepUserId: 'user_123',
      tenantId: 'default',
      linkedAt: new Date().toISOString(),
    })),
    listWorkAppSlackUserMappingsByTeam: vi.fn(() => async () => []),
    verifySlackLinkToken: vi.fn(async () => ({
      valid: false,
      error: 'Invalid token',
    })),
    listWorkAppSlackChannelAgentConfigsByTeam: vi.fn(() => async () => []),
    findWorkAppSlackChannelAgentConfig: vi.fn(() => async () => null),
    upsertWorkAppSlackChannelAgentConfig: vi.fn(() => async () => ({
      id: 'wscac_test123',
      tenantId: 'default',
      slackTeamId: 'T123',
      slackChannelId: 'C123',
      projectId: 'proj_123',
      agentId: 'agent_123',
    })),
    deleteWorkAppSlackChannelAgentConfig: vi.fn(() => async () => true),
    createApiKey: vi.fn(() => async () => {}),
    generateApiKey: vi.fn(async () => ({
      id: 'key_123',
      publicId: 'pub_123',
      keyHash: 'hash_123',
      keyPrefix: 'iak_',
      key: 'iak_test_key_123',
    })),
  };
});

vi.mock('../../slack/services/security', () => ({
  verifySlackRequest: vi.fn(() => true),
  parseSlackCommandBody: vi.fn(() => ({})),
  parseSlackEventBody: vi.fn((body: string) => JSON.parse(body)),
}));

vi.mock('../../env', () => ({
  env: {
    SLACK_SIGNING_SECRET: 'test-signing-secret',
    NANGO_SECRET_KEY: 'test-nango-key',
    NANGO_SLACK_SECRET_KEY: 'test-nango-slack-key',
    ENVIRONMENT: 'test',
  },
}));

vi.mock('../../slack/services/nango', () => ({
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

  describe('GET /workspaces/:teamId/users', () => {
    it('should return linked users for a team', async () => {
      const response = await app.request('/workspaces/T123/users', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveProperty('linkedUsers');
      expect(Array.isArray(json.linkedUsers)).toBe(true);
    });
  });

  describe('GET /workspaces/:teamId/settings', () => {
    it('should return workspace settings', async () => {
      const response = await app.request('/workspaces/T123/settings', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toBeDefined();
    });
  });

  describe('POST /users/link/verify-token', () => {
    it('should require token parameter', async () => {
      const response = await app.request('/users/link/verify-token', {
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
      expect(json.success).toBe(false);
    });

    it('should require userId parameter', async () => {
      const response = await app.request('/users/link/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'some.jwt.token',
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it('should return error for invalid token', async () => {
      const response = await app.request('/users/link/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'invalid.jwt.token',
          userId: 'user_123',
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBeDefined();
    });
  });

  describe('GET /workspaces/:teamId/channels/:channelId/settings', () => {
    it('should return channel settings', async () => {
      const response = await app.request('/workspaces/T123/channels/C123/settings', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveProperty('channelId');
      expect(json.channelId).toBe('C123');
    });
  });
});
