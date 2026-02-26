/**
 * Tests for Slack Work App routes
 *
 * Integration tests for the Hono router covering:
 * - URL verification challenge
 * - Workspace listing and settings
 * - User linking and verification
 * - Channel configuration
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import slackRoutes from '../../slack/routes/index';

const mockFindWorkAppSlackWorkspaceByTeamId = vi.fn(
  async () => null as Record<string, unknown> | null
);
const mockUpdateWorkAppSlackWorkspace = vi.fn(async () => null as Record<string, unknown> | null);

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
    findWorkAppSlackWorkspaceByTeamId: vi.fn(() => mockFindWorkAppSlackWorkspaceByTeamId),
    updateWorkAppSlackWorkspace: vi.fn(() => mockUpdateWorkAppSlackWorkspace),
  };
});

vi.mock('../../slack/services/events', () => ({
  handleAppMention: vi.fn().mockResolvedValue(undefined),
  handleMessageShortcut: vi.fn().mockResolvedValue(undefined),
  handleModalSubmission: vi.fn().mockResolvedValue(undefined),
  handleOpenAgentSelectorModal: vi.fn().mockResolvedValue(undefined),
  handleToolApproval: vi.fn().mockResolvedValue(undefined),
  sendResponseUrlMessage: vi.fn().mockResolvedValue(undefined),
}));

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
  setWorkspaceDefaultAgent: vi.fn(async () => true),
  clearWorkspaceConnectionCache: vi.fn(),
  createConnectSession: vi.fn(async () => ({ url: 'https://nango.dev/connect' })),
  computeWorkspaceConnectionId: vi.fn(() => 'E:E123:T:T123'),
}));

vi.mock('../../slack/services/agent-resolution', () => ({
  lookupAgentName: vi.fn(async () => undefined as string | undefined),
  lookupProjectName: vi.fn(async () => undefined as string | undefined),
  resolveEffectiveAgent: vi.fn(async () => null),
  getAgentConfigSources: vi.fn(async () => ({
    channelConfig: null,
    workspaceConfig: null,
    effective: null,
  })),
}));

function createTestApp(contextOverrides: Record<string, unknown> = {}) {
  const testApp = new OpenAPIHono();
  testApp.use('*', async (c, next) => {
    for (const [key, value] of Object.entries(contextOverrides)) {
      c.set(key as never, value as never);
    }
    await next();
  });
  testApp.route('/', slackRoutes);
  return testApp;
}

describe('Slack Work App Routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('POST /events - Slack retry deduplication', () => {
    it('should acknowledge Slack retries without re-processing', async () => {
      const response = await app.request('/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-retry-num': '1',
          'x-slack-retry-reason': 'http_timeout',
        },
        body: JSON.stringify({
          type: 'event_callback',
          team_id: 'T123',
          event: {
            type: 'app_mention',
            user: 'U123',
            text: '<@UBOT> hello',
            channel: 'C123',
            ts: '1234.5678',
          },
        }),
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('');
    });

    it('should acknowledge retries even with retry reason only', async () => {
      const response = await app.request('/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-retry-num': '2',
        },
        body: JSON.stringify({ type: 'event_callback' }),
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('');
    });

    it('should process events normally when no retry headers are present', async () => {
      const response = await app.request('/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'url_verification',
          challenge: 'test-challenge-from-retry-test',
        }),
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('test-challenge-from-retry-test');
    });
  });

  describe('POST /events - view_submission', () => {
    it('should return empty body for successful view_submission', async () => {
      const response = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'view_submission',
          view: {
            callback_id: 'agent_selector_modal',
            private_metadata: '{}',
            state: {
              values: {
                agent_select_block: {
                  agent_select: { selected_option: { value: '{"agentId":"a1","projectId":"p1"}' } },
                },
              },
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    });

    it('should return validation errors when no agent selected', async () => {
      const response = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'view_submission',
          view: {
            callback_id: 'agent_selector_modal',
            state: {
              values: {
                agent_select_block: {
                  agent_select: { selected_option: { value: 'none' } },
                },
              },
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.response_action).toBe('errors');
      expect(json.errors).toBeDefined();
    });
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

  describe('PUT /workspaces/:teamId/settings', () => {
    const bypassHeaders = {
      'Content-Type': 'application/json',
      'x-test-bypass-auth': 'true',
    };

    async function mockWorkspaceAndAgent(agentName: string | undefined) {
      const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
      vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValueOnce({
        connectionId: 'E::T:T123',
        teamId: 'T123',
        teamName: 'Test Workspace',
        tenantId: 'default',
        botToken: 'xoxb-test',
      } as never);
      const { lookupAgentName } = await import('../../slack/services/agent-resolution');
      vi.mocked(lookupAgentName).mockResolvedValueOnce(agentName);
    }

    it('should set a default agent', async () => {
      const authedApp = createTestApp({ userId: 'user_admin' });
      await mockWorkspaceAndAgent('Test Agent');
      const { setWorkspaceDefaultAgent } = await import('../../slack/services/nango');
      vi.mocked(setWorkspaceDefaultAgent).mockResolvedValueOnce(true);

      const response = await authedApp.request('/workspaces/T123/settings', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({
          defaultAgent: {
            agentId: 'agent_123',
            projectId: 'proj_123',
            grantAccessToMembers: true,
          },
        }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(setWorkspaceDefaultAgent).toHaveBeenCalledWith('T123', {
        agentId: 'agent_123',
        projectId: 'proj_123',
        grantAccessToMembers: true,
      });
    });

    it('should clear the default agent when no defaultAgent is provided', async () => {
      const authedApp = createTestApp({ userId: 'user_admin' });
      const { setWorkspaceDefaultAgent } = await import('../../slack/services/nango');
      vi.mocked(setWorkspaceDefaultAgent).mockResolvedValueOnce(true);

      const response = await authedApp.request('/workspaces/T123/settings', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(setWorkspaceDefaultAgent).toHaveBeenCalledWith('T123', null);
    });

    it('should return 500 when Nango persistence fails', async () => {
      const authedApp = createTestApp({ userId: 'user_admin' });
      await mockWorkspaceAndAgent('Existing Agent');
      const { setWorkspaceDefaultAgent } = await import('../../slack/services/nango');
      vi.mocked(setWorkspaceDefaultAgent).mockResolvedValueOnce(false);

      const response = await authedApp.request('/workspaces/T123/settings', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({
          defaultAgent: {
            agentId: 'agent_123',
            projectId: 'proj_123',
          },
        }),
      });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it('should return 400 when agent does not exist', async () => {
      const authedApp = createTestApp({ userId: 'user_admin' });
      await mockWorkspaceAndAgent(undefined);

      const response = await authedApp.request('/workspaces/T123/settings', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({
          defaultAgent: {
            agentId: 'nonexistent_agent',
            projectId: 'proj_123',
          },
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('nonexistent_agent');
      expect(json.error).toContain('not found');
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

    const validLinkPayload = {
      iss: 'inkeep-auth' as const,
      aud: 'slack-link' as const,
      sub: 'slack:T123:U123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
      tokenUse: 'slackLinkCode' as const,
      tenantId: 'default',
      slack: { teamId: 'T123', userId: 'U123', enterpriseId: '', username: 'testuser' },
    };

    it('should reject non-session users with 403', async () => {
      const { verifySlackLinkToken } = await import('@inkeep/agents-core');
      vi.mocked(verifySlackLinkToken).mockResolvedValueOnce({
        valid: true,
        payload: validLinkPayload,
      });

      const response = await app.request('/users/link/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'valid.jwt.token',
          userId: 'user_123',
        }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Session authentication required for account linking');
    });

    it('should reject API key users with 403', async () => {
      const authedApp = createTestApp({ userId: 'apikey:key_123' });
      const { verifySlackLinkToken } = await import('@inkeep/agents-core');
      vi.mocked(verifySlackLinkToken).mockResolvedValueOnce({
        valid: true,
        payload: validLinkPayload,
      });

      const response = await authedApp.request('/users/link/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'valid.jwt.token',
          userId: 'user_123',
        }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Session authentication required for account linking');
    });

    it('should reject system token users with 403', async () => {
      const authedApp = createTestApp({ userId: 'system' });
      const { verifySlackLinkToken } = await import('@inkeep/agents-core');
      vi.mocked(verifySlackLinkToken).mockResolvedValueOnce({
        valid: true,
        payload: validLinkPayload,
      });

      const response = await authedApp.request('/users/link/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'valid.jwt.token',
          userId: 'user_123',
        }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Session authentication required for account linking');
    });

    it('should allow session-authenticated users to link accounts', async () => {
      const authedApp = createTestApp({ userId: 'user_123' });
      const { verifySlackLinkToken } = await import('@inkeep/agents-core');
      vi.mocked(verifySlackLinkToken).mockResolvedValueOnce({
        valid: true,
        payload: validLinkPayload,
      });

      const response = await authedApp.request('/users/link/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'valid.jwt.token',
          userId: 'user_123',
        }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.linkId).toBeDefined();
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

  describe('PUT /workspaces/:teamId/channels/:channelId/settings - agent validation', () => {
    const bypassHeaders = {
      'Content-Type': 'application/json',
      'x-test-bypass-auth': 'true',
    };

    async function mockWorkspaceAndAgent(agentName: string | undefined) {
      const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
      vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValueOnce({
        connectionId: 'E::T:T123',
        teamId: 'T123',
        teamName: 'Test Workspace',
        tenantId: 'default',
        botToken: 'xoxb-test',
      } as never);
      const { lookupAgentName } = await import('../../slack/services/agent-resolution');
      vi.mocked(lookupAgentName).mockResolvedValueOnce(agentName);
    }

    it('should return 400 when agent does not exist', async () => {
      const authedApp = createTestApp({ userId: 'user_admin', tenantId: 'default' });
      await mockWorkspaceAndAgent(undefined);

      const response = await authedApp.request('/workspaces/T123/channels/C123/settings', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({
          agentConfig: {
            agentId: 'nonexistent_agent',
            projectId: 'proj_123',
          },
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('nonexistent_agent');
      expect(json.error).toContain('not found');
    });

    it('should succeed when agent exists', async () => {
      const authedApp = createTestApp({ userId: 'user_admin', tenantId: 'default' });
      await mockWorkspaceAndAgent('My Agent');

      const response = await authedApp.request('/workspaces/T123/channels/C123/settings', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({
          agentConfig: {
            agentId: 'agent_123',
            projectId: 'proj_123',
          },
        }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.configId).toBeDefined();
    });
  });

  describe('PUT /workspaces/:teamId/channels/bulk - agent validation', () => {
    it('should return 400 when agent does not exist', async () => {
      const authedApp = createTestApp({ userId: 'user_admin', tenantId: 'default' });
      const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
      vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValueOnce({
        connectionId: 'E::T:T123',
        teamId: 'T123',
        teamName: 'Test Workspace',
        tenantId: 'default',
        botToken: 'xoxb-test',
      } as never);
      const { lookupAgentName } = await import('../../slack/services/agent-resolution');
      vi.mocked(lookupAgentName).mockResolvedValueOnce(undefined);

      const response = await authedApp.request('/workspaces/T123/channels/bulk', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-bypass-auth': 'true',
        },
        body: JSON.stringify({
          channelIds: ['C123', 'C456'],
          agentConfig: {
            agentId: 'nonexistent_agent',
            projectId: 'proj_123',
          },
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('nonexistent_agent');
      expect(json.error).toContain('not found');
    });
  });

  describe('GET /workspaces/:teamId/join-from-workspace', () => {
    it('should return false when no workspace in DB', async () => {
      const authedApp = createTestApp({ tenantId: 'default' });
      mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValueOnce(null);

      const response = await authedApp.request('/workspaces/T123/join-from-workspace', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.shouldAllowJoinFromWorkspace).toBe(false);
    });

    it('should return true when workspace has setting enabled', async () => {
      const authedApp = createTestApp({ tenantId: 'default' });
      mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValueOnce({
        id: 'wsw_123',
        slackTeamId: 'T123',
        shouldAllowJoinFromWorkspace: true,
      });

      const response = await authedApp.request('/workspaces/T123/join-from-workspace', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.shouldAllowJoinFromWorkspace).toBe(true);
    });

    it('should return 401 when no tenantId in session', async () => {
      const response = await app.request('/workspaces/T123/join-from-workspace', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /workspaces/:teamId/join-from-workspace', () => {
    const bypassHeaders = {
      'Content-Type': 'application/json',
      'x-test-bypass-auth': 'true',
    };

    it('should return 401 when no tenantId in session (even with bypass)', async () => {
      const response = await app.request('/workspaces/T123/join-from-workspace', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({ shouldAllowJoinFromWorkspace: true }),
      });

      expect(response.status).toBe(401);
    });

    it('should return 404 when workspace not found in DB', async () => {
      const authedApp = createTestApp({ tenantId: 'default', userId: 'user_admin' });
      mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValueOnce(null);

      const response = await authedApp.request('/workspaces/T123/join-from-workspace', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({ shouldAllowJoinFromWorkspace: true }),
      });

      expect(response.status).toBe(404);
    });

    it('should update setting and return success', async () => {
      const authedApp = createTestApp({ tenantId: 'default', userId: 'user_admin' });
      mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValueOnce({
        id: 'wsw_123',
        slackTeamId: 'T123',
        tenantId: 'default',
      });
      mockUpdateWorkAppSlackWorkspace.mockResolvedValueOnce({
        id: 'wsw_123',
        shouldAllowJoinFromWorkspace: true,
      });

      const response = await authedApp.request('/workspaces/T123/join-from-workspace', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({ shouldAllowJoinFromWorkspace: true }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
    });

    it('should return 500 when update fails', async () => {
      const authedApp = createTestApp({ tenantId: 'default', userId: 'user_admin' });
      mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValueOnce({
        id: 'wsw_123',
        slackTeamId: 'T123',
        tenantId: 'default',
      });
      mockUpdateWorkAppSlackWorkspace.mockResolvedValueOnce(null);

      const response = await authedApp.request('/workspaces/T123/join-from-workspace', {
        method: 'PUT',
        headers: bypassHeaders,
        body: JSON.stringify({ shouldAllowJoinFromWorkspace: false }),
      });

      expect(response.status).toBe(500);
    });
  });
});
