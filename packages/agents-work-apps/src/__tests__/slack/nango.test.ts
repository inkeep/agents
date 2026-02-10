/**
 * Tests for Nango integration service
 *
 * Tests cover:
 * - Workspace connection ID computation
 * - Integration ID resolution
 * - Type definitions for workspace connections
 */

import { describe, expect, it, vi } from 'vitest';
import { computeWorkspaceConnectionId, getSlackIntegrationId } from '../../slack/services/nango';

vi.mock('../../../../env', () => ({
  env: {
    NANGO_SLACK_SECRET_KEY: 'test-nango-secret',
    NANGO_SECRET_KEY: 'test-nango-secret-fallback',
    NANGO_SLACK_INTEGRATION_ID: undefined,
    NANGO_SERVER_URL: 'https://api.nango.dev',
  },
}));

vi.mock('../../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('nango service', () => {
  describe('computeWorkspaceConnectionId', () => {
    it('should compute connection ID for non-enterprise workspace', () => {
      const result = computeWorkspaceConnectionId({
        teamId: 'T0AA0UWRXJS',
      });

      expect(result).toBe('T:T0AA0UWRXJS');
    });

    it('should compute connection ID for enterprise workspace', () => {
      const result = computeWorkspaceConnectionId({
        teamId: 'T0AA0UWRXJS',
        enterpriseId: 'E0AA0UUL7ML',
      });

      expect(result).toBe('E:E0AA0UUL7ML:T:T0AA0UWRXJS');
    });

    it('should handle empty enterpriseId', () => {
      const result = computeWorkspaceConnectionId({
        teamId: 'T123',
        enterpriseId: '',
      });

      expect(result).toBe('T:T123');
    });

    it('should handle undefined enterpriseId', () => {
      const result = computeWorkspaceConnectionId({
        teamId: 'T123',
        enterpriseId: undefined,
      });

      expect(result).toBe('T:T123');
    });

    it('should match the expected connection ID format from Nango metadata', () => {
      const result = computeWorkspaceConnectionId({
        teamId: 'T0AA0UWRXJS',
        enterpriseId: 'E0AA0UUL7ML',
      });

      expect(result).toBe('E:E0AA0UUL7ML:T:T0AA0UWRXJS');
    });
  });

  describe('getSlackIntegrationId', () => {
    it('should return default integration ID when not configured', () => {
      const result = getSlackIntegrationId();

      expect(result).toBe('slack-agent');
    });
  });
});

describe('nango types', () => {
  describe('DefaultAgentConfig', () => {
    it('should have correct shape', () => {
      const config = {
        agentId: 'test',
        agentName: 'Test Agent',
        projectId: 'proj-1',
        projectName: 'Test Project',
      };

      expect(config.agentId).toBe('test');
      expect(config.agentName).toBe('Test Agent');
      expect(config.projectId).toBe('proj-1');
      expect(config.projectName).toBe('Test Project');
    });
  });

  describe('SlackWorkspaceConnection', () => {
    it('should have correct shape', () => {
      const connection = {
        connectionId: 'E:E123:T:T456',
        teamId: 'T456',
        teamName: 'Test Workspace',
        botToken: 'xoxb-test-token',
        tenantId: 'default',
        defaultAgent: {
          agentId: 'agent-1',
          agentName: 'Support Agent',
          projectId: 'proj-1',
          projectName: 'Main Project',
        },
      };

      expect(connection.connectionId).toBe('E:E123:T:T456');
      expect(connection.teamId).toBe('T456');
      expect(connection.botToken).toBe('xoxb-test-token');
      expect(connection.defaultAgent?.agentId).toBe('agent-1');
    });
  });

  describe('WorkspaceInstallData', () => {
    it('should have correct shape for full installation', () => {
      const installData = {
        teamId: 'T0AA0UWRXJS',
        teamName: 'inkeepBotTesting',
        teamDomain: 'e0aa0uul7ml-pgdr9bml',
        enterpriseId: 'E0AA0UUL7ML',
        enterpriseName: 'inkeepBotTesting',
        botUserId: 'U0AB5MC85UH',
        botToken: 'xoxb-fake-token-for-testing-only-not-real',
        botScopes: 'app_mentions:read,channels:history,channels:read,chat:write',
        installerUserId: 'U0A9WJVPN1H',
        installerUserName: 'sd0a7jj4uqje_user',
        isEnterpriseInstall: false,
        appId: 'A0AAPB3JMT7',
        tenantId: 'default',
        workspaceUrl: 'https://e0aa0uul7ml-pgdr9bml.slack.com/',
        workspaceIconUrl: 'https://a.slack-edge.com/80588/img/avatars-teams/ava_0007-68.png',
        installationSource: 'dashboard',
      };

      expect(installData.teamId).toBe('T0AA0UWRXJS');
      expect(installData.enterpriseId).toBe('E0AA0UUL7ML');
      expect(installData.botToken).toBe('xoxb-fake-token-for-testing-only-not-real');
      expect(installData.isEnterpriseInstall).toBe(false);
    });
  });
});
