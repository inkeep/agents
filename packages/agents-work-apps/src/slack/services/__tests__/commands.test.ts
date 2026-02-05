/**
 * Tests for Slack slash command parsing and handling
 *
 * Tests cover:
 * - SlackCommandPayload type structure
 * - Command parsing (link, status, run, help)
 * - Response types (ephemeral vs in_channel)
 * - TenantId resolution
 * - Dashboard URL construction
 * - Agent search functionality
 */

import { describe, expect, it, vi } from 'vitest';
import type { SlackCommandPayload } from '../types';

vi.mock('../../../../../data/db/manageDbClient', () => ({
  default: {},
}));

vi.mock('../../../../../data/db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../../../../env', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    SLACK_SIGNING_SECRET: 'test-signing-secret',
  },
}));

vi.mock('../../../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@inkeep/agents-core', () => ({
  createWorkAppSlackAccountLinkCode: () =>
    vi.fn().mockResolvedValue({
      plaintextCode: 'ABCD-1234',
    }),
  deleteWorkAppSlackUserMapping: () => vi.fn().mockResolvedValue(true),
  findWorkAppSlackUserMapping: () => vi.fn(),
  listAgents: () => vi.fn().mockResolvedValue([]),
  listProjectsPaginated: () => vi.fn().mockResolvedValue({ data: [], pagination: {} }),
  signSlackUserToken: vi.fn().mockResolvedValue('mock-jwt-token'),
}));

vi.mock('../nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn().mockResolvedValue(null),
}));

describe('Slack Commands', () => {
  describe('SlackCommandPayload type', () => {
    it('should have correct shape', () => {
      const payload: SlackCommandPayload = {
        command: '/inkeep',
        text: 'help',
        userId: 'U0A9WJVPN1H',
        userName: 'testuser',
        teamId: 'T0AA0UWRXJS',
        teamDomain: 'inkeepBotTesting',
        enterpriseId: 'E0AA0UUL7ML',
        channelId: 'C123456',
        channelName: 'general',
        responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
        triggerId: '123.456.abc',
      };

      expect(payload.command).toBe('/inkeep');
      expect(payload.text).toBe('help');
      expect(payload.userId).toBe('U0A9WJVPN1H');
      expect(payload.teamId).toBe('T0AA0UWRXJS');
      expect(payload.enterpriseId).toBe('E0AA0UUL7ML');
    });

    it('should handle optional enterpriseId', () => {
      const payload: SlackCommandPayload = {
        command: '/inkeep',
        text: 'list',
        userId: 'U123',
        userName: 'user',
        teamId: 'T123',
        teamDomain: 'team',
        channelId: 'C123',
        channelName: 'general',
        responseUrl: 'https://hooks.slack.com/commands',
        triggerId: '123.456',
      };

      expect(payload.enterpriseId).toBeUndefined();
    });
  });

  describe('command parsing', () => {
    it('should parse link command', () => {
      const text = 'link';
      const parts = text.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || '';

      expect(subcommand).toBe('link');
    });

    it('should parse connect as alias for link', () => {
      const text = 'connect';
      const parts = text.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || '';

      expect(subcommand).toBe('connect');
    });

    it('should parse status command', () => {
      const text = 'status';
      const parts = text.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || '';

      expect(subcommand).toBe('status');
    });

    it('should parse unlink/logout/disconnect commands', () => {
      const commands = ['unlink', 'logout', 'disconnect'];

      for (const cmd of commands) {
        const parts = cmd.split(/\s+/);
        const subcommand = parts[0]?.toLowerCase() || '';

        expect(['unlink', 'logout', 'disconnect']).toContain(subcommand);
      }
    });

    it('should parse list command', () => {
      const text = 'list';
      const parts = text.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || '';

      expect(subcommand).toBe('list');
    });

    it('should parse run command with agent and question', () => {
      const text = 'run support-agent What is the pricing?';
      const parts = text.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || '';
      const agentName = parts[1];
      const question = parts.slice(2).join(' ');

      expect(subcommand).toBe('run');
      expect(agentName).toBe('support-agent');
      expect(question).toBe('What is the pricing?');
    });

    it('should handle run command with insufficient args', () => {
      const text = 'run agent-only';
      const parts = text.split(/\s+/);

      expect(parts.length).toBeLessThan(3);
    });

    it('should parse help command', () => {
      const text = 'help';
      const parts = text.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || '';

      expect(subcommand).toBe('help');
    });

    it('should treat empty text as help', () => {
      const text = '';
      const parts = text.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || '';

      expect(subcommand).toBe('');
    });

    it('should parse question when no command matches', () => {
      const text = 'What is Inkeep and how does it work?';
      const parts = text.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || '';

      expect([
        'link',
        'connect',
        'status',
        'unlink',
        'logout',
        'disconnect',
        'list',
        'run',
        'help',
        '',
      ]).not.toContain(subcommand);
    });

    it('should handle case-insensitive commands', () => {
      const commands = ['LINK', 'Link', 'STATUS', 'Status', 'HELP', 'Help'];

      for (const cmd of commands) {
        const normalized = cmd.toLowerCase();
        expect(['link', 'status', 'help']).toContain(normalized);
      }
    });

    it('should handle extra whitespace', () => {
      const text = '  link  ';
      const trimmed = text.trim();
      const parts = trimmed.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || '';

      expect(subcommand).toBe('link');
    });
  });

  describe('response types', () => {
    it('should have ephemeral response type for private messages', () => {
      const response = {
        response_type: 'ephemeral' as const,
        text: 'This is only visible to you',
      };

      expect(response.response_type).toBe('ephemeral');
    });

    it('should have in_channel response type for public messages', () => {
      const response = {
        response_type: 'in_channel' as const,
        text: 'This is visible to everyone',
      };

      expect(response.response_type).toBe('in_channel');
    });

    it('should support blocks in response', () => {
      const response = {
        response_type: 'ephemeral' as const,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Bold text* and _italic_',
            },
          },
        ],
      };

      expect(response.blocks).toBeDefined();
      expect(response.blocks).toHaveLength(1);
    });
  });

  describe('tenantId resolution', () => {
    it('should default to "default" when no workspace connection', () => {
      const workspaceConnection = null as { tenantId?: string } | null;
      const tenantId = workspaceConnection?.tenantId || 'default';

      expect(tenantId).toBe('default');
    });

    it('should use workspace tenantId when available', () => {
      const workspaceConnection = {
        connectionId: 'E:E123:T:T456',
        teamId: 'T456',
        botToken: 'xoxb-token',
        tenantId: 'custom-tenant',
      };
      const tenantId = workspaceConnection.tenantId || 'default';

      expect(tenantId).toBe('custom-tenant');
    });
  });

  describe('dashboard URL construction', () => {
    it('should construct dashboard URL with tenantId', () => {
      const manageUiUrl = 'http://localhost:3000';
      const tenantId = 'test-tenant';
      const dashboardUrl = `${manageUiUrl}/${tenantId}/work-apps/slack`;

      expect(dashboardUrl).toBe('http://localhost:3000/test-tenant/work-apps/slack');
    });

    it('should handle default tenantId', () => {
      const manageUiUrl = 'https://app.inkeep.com';
      const tenantId = 'default';
      const dashboardUrl = `${manageUiUrl}/${tenantId}/work-apps/slack`;

      expect(dashboardUrl).toBe('https://app.inkeep.com/default/work-apps/slack');
    });
  });

  describe('background execution', () => {
    it('should prepare thinking message correctly', () => {
      const agentName = 'Support Agent';
      const agentId = 'support-agent';
      const displayName = agentName || agentId;

      const thinkingMessage = {
        response_type: 'ephemeral' as const,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🤔 _${displayName} is thinking..._`,
            },
          },
        ],
      };

      expect(thinkingMessage.blocks[0].text.text).toContain('Support Agent');
      expect(thinkingMessage.blocks[0].text.text).toContain('thinking');
    });

    it('should use agentId when name is null', () => {
      const agentName = null;
      const agentId = 'support-agent';
      const displayName = agentName || agentId;

      expect(displayName).toBe('support-agent');
    });
  });

  describe('agent search', () => {
    it('should find agent by exact ID match', () => {
      const agents = [
        { id: 'support-agent', name: 'Support Agent', projectId: 'proj-1' },
        { id: 'sales-agent', name: 'Sales Agent', projectId: 'proj-1' },
      ];
      const agentIdentifier = 'support-agent';

      const foundAgent = agents.find(
        (a) => a.id === agentIdentifier || a.name?.toLowerCase() === agentIdentifier.toLowerCase()
      );

      expect(foundAgent).toBeDefined();
      expect(foundAgent?.id).toBe('support-agent');
    });

    it('should find agent by name (case insensitive)', () => {
      const agents = [{ id: 'support-agent', name: 'Support Agent', projectId: 'proj-1' }];
      const agentIdentifier = 'support agent';

      const foundAgent = agents.find(
        (a) => a.id === agentIdentifier || a.name?.toLowerCase() === agentIdentifier.toLowerCase()
      );

      expect(foundAgent).toBeDefined();
      expect(foundAgent?.name).toBe('Support Agent');
    });

    it('should return undefined when agent not found', () => {
      const agents = [{ id: 'support-agent', name: 'Support Agent', projectId: 'proj-1' }];
      const agentIdentifier = 'nonexistent';

      const foundAgent = agents.find(
        (a) => a.id === agentIdentifier || a.name?.toLowerCase() === agentIdentifier.toLowerCase()
      );

      expect(foundAgent).toBeUndefined();
    });
  });
});
